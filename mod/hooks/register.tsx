import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Mood } from '../types'
import { framesFor, rasterSize, toCells, toSvg } from './draw'
import type { Sprite } from './draw'
import { HAPPY_FOR_MS, SLEEP_AFTER_MS, animationFor, caption, detailForCall, moodForTool } from './mood'
import { bundled, parseMascot } from './mascot'
import type { Mascot } from './mascot'

const PANE = 'maudette'
const SPRITE_KEY = 'sprite'
const DESKTOP_SCALE = 4
// A mascot name in the `mascot` setting: a file name in ~/.claude/mascots, no paths.
const MASCOT_NAME = /^[a-z0-9][a-z0-9_-]*$/i

const mood = atom({ plugin: 'maudette', key: 'mood' } as const, 'idle' as Mood)
const detail = atom({ plugin: 'maudette', key: 'detail' } as const, '')

// Animation and idle tracking live in the module: a reload restarts them,
// which is fine. The mood itself is in $.state so drawings follow it.
let current: Mood = 'idle'
// Drawn when a mood starts, to pick among its variants (see animationFor); one
// roll for every sprite, so the pane and the row pick alike.
let roll = 0
let lastActivity = 0
// The band above the prompt has an engine-minted id, learned when it draws.
let bandId: string | undefined
// The mascot on show: the bundled one until session.start loads the one the
// `mascot` setting names.
let active: Mascot = bundled

// The row above the prompt draws its sprite about 32px wide on desktop, always
// by a whole number.
function bandScale(): number {
  return Math.max(1, Math.round(32 / active.small.width))
}

// Terminal only: each site steps through its own sprite's frames, since the
// two sprites' frame counts and timings differ. Desktop animates on its own
// through SMIL.
type Player = { sprite: () => Sprite; site: () => string | undefined; index: number; timer?: { cancel: () => void } }
const band: Player = { sprite: () => active.terminal, site: () => bandId, index: 0 }
const pane: Player = { sprite: () => active.sprite, site: () => PANE, index: 0 }

function step($: EngineInterface, player: Player) {
  const sprite = player.sprite()
  const frames = framesFor(sprite, animationFor(sprite, current, roll))
  if (frames.length < 2) return
  player.index = (player.index + 1) % frames.length
  const frame = frames[player.index]
  if (!frame) return
  const site = player.site()
  if (site) void $.ui.blit({ requestId: site, key: SPRITE_KEY, cells: toCells(sprite, frame) })
  player.timer = $.clock.after(frame.duration, () => step($, player))
}

function play($: EngineInterface) {
  for (const player of [band, pane]) {
    player.timer?.cancel()
    player.index = 0
    const sprite = player.sprite()
    const frames = framesFor(sprite, animationFor(sprite, current, roll))
    if (frames.length < 2) continue
    player.timer = $.clock.after(frames[0]?.duration ?? 500, () => step($, player))
  }
}

async function setMood($: EngineInterface, next: Mood, subject = '') {
  if (next === current && subject === (await read($, detail))) return
  current = next
  roll = Math.random()
  await update($, mood, () => next)
  await update($, detail, () => subject)
  play($)
}

async function touch($: EngineInterface) {
  lastActivity = await $.clock.now()
}

async function checkSleep($: EngineInterface) {
  // Not while a question waits on the person: they may take a while to answer.
  if (current === 'sleep' || current === 'waiting') return
  if ((await $.clock.now()) - lastActivity > SLEEP_AFTER_MS) await setMood($, 'sleep')
}

async function settle($: EngineInterface) {
  if (current === 'happy') await setMood($, 'idle')
}

// Loads the mascot the `mascot` setting names from ~/.claude/mascots/<name>.mascot.json,
// keeping the bundled one, with a toast saying why, when it can't.
async function loadMascot($: EngineInterface, name: string) {
  active = bundled
  if (!name) return
  const fallback = `showing ${bundled.text.name}`
  if (!MASCOT_NAME.test(name)) {
    $.ui.toast(`Maudette: "${name}" isn't a mascot name (letters, digits, - and _), ${fallback}`)
    return
  }
  // The person's own mascots first, so one can stand in for an example of the
  // same name, then the examples the plugin ships (bonsai, nimbus, orbit).
  const path = `~/.claude/mascots/${name}.mascot.json`
  let json: string | undefined
  for (const file of [path.replace('~', (await $.env.get('HOME')) ?? '~'), `${$.plugin.root}/mascots/${name}.mascot.json`]) {
    try {
      json = await $.fs.read(file)
      break
    } catch {}
  }
  if (json === undefined) {
    // Naming the bundled mascot just asks for it; no file needed, nothing to say.
    if (name.toLowerCase() === bundled.text.name.toLowerCase()) return
    $.ui.toast(`Maudette: no mascot "${name}" in ~/.claude/mascots or the plugin, ${fallback}`)
    return
  }
  const loaded = parseMascot(json)
  if (typeof loaded === 'string') {
    $.ui.toast(`Maudette: can't use ${path}: ${loaded}; ${fallback}`)
    return
  }
  active = loaded
  $.ui.invalidate('ui.render')
}

export const register: Register = (on, options) => {
  const mascotName = typeof options.mascot === 'string' ? options.mascot.trim() : ''

  on('session.start', async ($, e, next) => {
    await loadMascot($, mascotName)
    await $.command.register({ name: 'maudette', description: `Show ${active.text.name} in a pane` })
    await touch($)
    current = await read($, mood)
    play($)
    $.clock.every(30_000, () => void checkSleep($))

    return next(e)
  })

  on('command.run', { command: 'maudette' }, async $ => {
    await $.ui.open({ id: PANE, title: active.text.name })

    return { text: `${active.text.name} is here.` }
  })

  // Typing in the prompt wakes the mascot up.
  on('prompt.edit', async ($, e, next) => {
    await touch($)
    if (current === 'sleep') await setMood($, 'idle')

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await touch($)
    await setMood($, 'think')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await touch($)
    const input = e as Record<string, unknown>
    await setMood($, moodForTool(e.tool, input), detailForCall(input))
    const ran = await next(e)
    const hasFailed = ran.deny === undefined && ran.isError === true
    await setMood($, hasFailed ? 'sad' : 'think')

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    await touch($)
    await setMood($, 'happy')
    $.clock.after(HAPPY_FOR_MS, () => void settle($))

    return next(e)
  })

  // The mascot's home: the row just above the prompt, in the conversation window.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const now = await read($, mood)
    const text = caption(active.text, now, await read($, detail))
    const { small, terminal } = active
    const frames = framesFor(small, animationFor(small, now, roll))

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const cells = framesFor(terminal, animationFor(terminal, now, roll))
      const size = rasterSize(terminal)
      const frame = cells[band.index % cells.length] ?? cells[0]
      if (!frame || e.props.maxRows < size.rows) return <Text dimColor>{text}</Text>
      bandId = e.requestId

      return (
        <Box flexDirection="row" alignItems="flex-end" gap={1}>
          <Raster key={SPRITE_KEY} {...size} cells={toCells(terminal, frame)} />
          <Text dimColor>{text}</Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Svg
          source={toSvg(small, frames)}
          alt={text}
          width={small.width * bandScale()}
          height={small.height * bandScale()}
          isInteractive
        />
        <Text dimColor>{text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await read($, mood)
    const text = caption(active.text, now, await read($, detail))
    const { sprite } = active
    const frames = framesFor(sprite, animationFor(sprite, now, roll))

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      const frame = frames[pane.index % frames.length] ?? frames[0]

      return (
        <Box flexDirection="column" alignItems="center">
          {frame && <Raster key={SPRITE_KEY} {...rasterSize(sprite)} cells={toCells(sprite, frame)} />}
          <Text dimColor>{text}</Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" alignItems="center">
        <Svg
          source={toSvg(sprite, frames)}
          alt={text}
          width={sprite.width * DESKTOP_SCALE}
          height={sprite.height * DESKTOP_SCALE}
          isInteractive
        />
        <Text dimColor>{text}</Text>
      </Box>
    )
  })
}
