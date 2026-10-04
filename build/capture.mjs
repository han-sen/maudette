// Captures one mascot's section of docs/preview.html (pane, row and terminal,
// every mood) as a GIF with exact timing: no screen recording. It opens the
// page in Chrome, pauses every animation, steps them all to each moment in
// turn, screenshots the section, and has ffmpeg join the frames.
//
//   npm run capture                    Maudette, to docs/preview-maudette.gif
//   MASCOT=orbit npm run capture       another mascot
//   npm run capture -- --dark --scale 1 --seconds 6 --width 1800
//   MASCOT=orbit npm run capture -- --moods idle --panels pane,terminal --bare
//                                      just those, side by side, no labels
//
// Needs Google Chrome ($CHROME for another browser) and ffmpeg. Run
// `npm run preview` first: it captures the page as it was last generated.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import puppeteer from 'puppeteer-core'

import { name } from './mascot-config.mjs'

const { values: args } = parseArgs({
  options: {
    dark: { type: 'boolean', default: false },
    scale: { type: 'string', default: '2' },
    seconds: { type: 'string' },
    width: { type: 'string', default: '1800' },
    out: { type: 'string' },
    moods: { type: 'string' },
    panels: { type: 'string' },
    bare: { type: 'boolean', default: false },
  },
})

// GIF delays are in hundredths of a second, and browsers slow anything at
// 10ms or under to 100ms, so 20ms is the finest step that plays true.
const STEP_MS = 20
const PANELS = ['pane', 'row', 'terminal']
const out = args.out ?? `docs/preview-${name}${args.moods || args.panels || args.bare ? '-compact' : ''}.gif`
const MAX_MS = 12_000

const page = resolve('docs/preview.html')
if (!existsSync(page)) throw new Error('docs/preview.html is missing: run `npm run preview` first')
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) throw new Error(`no Chrome at ${chrome}: set CHROME to a Chrome or Chromium binary`)
if (spawnSync('ffmpeg', ['-version']).status !== 0) throw new Error('ffmpeg is missing: brew install ffmpeg')

const browser = await puppeteer.launch({ executablePath: chrome, headless: true })
const frames = mkdtempSync(join(tmpdir(), 'mascot-capture-'))
try {
  const tab = await browser.newPage()
  await tab.setViewport({ width: Number(args.width), height: 1000, deviceScaleFactor: Number(args.scale) })
  await tab.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: args.dark ? 'dark' : 'light' }])
  await tab.goto(pathToFileURL(page).href, { waitUntil: 'load' })

  const section = await tab.$(`section#${name}`)
  if (!section) throw new Error(`docs/preview.html has no section for "${name}": run \`npm run preview\``)
  // A margin of page around the section, so the panels don't touch the GIF's edge.
  await tab.addStyleTag({ content: `section#${name} { padding: 24px; margin: 0 }` })

  // Leave out the moods and panels not asked for (removed, so their loops
  // don't count below). The page lists the panels in PANELS order, each an
  // <h3> and the panel after it.
  const moods = args.moods?.split(',')
  const panels = args.panels?.split(',')
  for (const panel of panels ?? []) if (!PANELS.includes(panel)) throw new Error(`--panels: "${panel}" isn't one of ${PANELS.join(', ')}`)
  await section.evaluate(
    (el, { moods, panels, all, bare }) => {
      const headings = [...el.querySelectorAll('h3')]
      headings.forEach((h, i) => {
        if (panels && !panels.includes(all[i])) {
          h.nextElementSibling?.remove()
          h.remove()
        }
      })
      if (moods) {
        for (const figure of el.querySelectorAll('figure')) {
          const mood = figure.querySelector('figcaption')?.firstChild?.textContent?.trim()
          if (!moods.includes(mood)) figure.remove()
        }
      }
      if (bare || moods || panels) {
        // Panels side by side, each as wide as what's left in it.
        el.style.cssText += ';display:flex;gap:16px;align-items:stretch;width:max-content'
        for (const panel of el.children) {
          if (panel.tagName === 'H3' || panel.tagName === 'H2') continue
          panel.style.cssText += ';display:flex;gap:24px;align-items:center'
        }
        if (bare) for (const label of el.querySelectorAll('h2, h3, figcaption')) label.remove()
        else for (const h of el.querySelectorAll('h2, h3')) h.remove()
      }
    },
    { moods, panels, all: PANELS, bare: args.bare },
  )
  if (!(await section.$('figure'))) throw new Error(`nothing left to capture: no ${moods?.join(', ')} in ${panels?.join(', ') ?? 'any panel'}`)

  // Every loop's length, to find how long until they all line up again.
  const loops = await section.$$eval('animate', els => els.map(a => Math.round(parseFloat(a.getAttribute('dur')))))
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  const lcm = [...new Set(loops)].reduce((a, b) => (a * b) / gcd(a, b), 1)
  const totalMs = args.seconds ? Number(args.seconds) * 1000 : Math.min(lcm, MAX_MS)
  const seamless = totalMs % lcm === 0
  console.log(
    `capture: ${name}, ${(totalMs / 1000).toFixed(2)}s` +
      (seamless
        ? ', loops seamlessly'
        : lcm <= 30_000
          ? ` (every loop lines up after ${(lcm / 1000).toFixed(2)}s: use --seconds ${lcm / 1000} for a seamless GIF)`
          : ` (the loops don't all line up within ${MAX_MS / 1000}s, so some moods jump when the GIF restarts)`),
  )

  // Consecutive identical screenshots become one frame shown longer.
  const shots = []
  for (let t = 0; t < totalMs; t += STEP_MS) {
    await section.evaluate(
      (el, seconds) =>
        new Promise(done => {
          for (const svg of el.querySelectorAll('svg')) {
            svg.pauseAnimations()
            svg.setCurrentTime(seconds)
          }
          requestAnimationFrame(() => requestAnimationFrame(done))
        }),
      t / 1000,
    )
    const png = await section.screenshot({ type: 'png' })
    const last = shots.at(-1)
    if (last && Buffer.compare(last.png, png) === 0) last.ms += STEP_MS
    else shots.push({ png, ms: STEP_MS })
  }

  const list = shots.map((shot, i) => {
    const file = join(frames, `${String(i).padStart(5, '0')}.png`)
    writeFileSync(file, shot.png)
    return `file '${file}'\nduration ${shot.ms / 1000}`
  })
  // The concat format reads the last file's duration only when it's listed again.
  list.push(`file '${join(frames, `${String(shots.length - 1).padStart(5, '0')}.png`)}'`)
  writeFileSync(join(frames, 'list.txt'), list.join('\n'))

  // One palette for the whole GIF, and no dithering: pixel art stays flat.
  const { status } = spawnSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'),
      '-vf', 'split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none',
      '-fps_mode', 'vfr', '-loop', '0', out,
    ],
    { stdio: 'inherit' },
  )
  if (status !== 0) process.exit(status ?? 1)
  console.log(`capture: ${shots.length} distinct frames → ${out}`)
} finally {
  await browser.close()
  rmSync(frames, { recursive: true, force: true })
}
