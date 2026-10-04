// The mascot the mod shows: the bundled one (Maudette, from sprites.ts), or one
// loaded at run time from a compiled mascot file (`<name>.mascot.json`, written by
// build/sprites.mjs, installed to ~/.claude/mascots/ by build/install-mascot.mjs).
// Pure: register.tsx reads the file, this checks it.
import type { Sprite } from './draw'
import { CORE_MOODS, SUB_MOODS } from './mood'
import type { MascotText } from './mood'
import * as bundledMascot from './sprites'

export type Mascot = {
  text: MascotText
  // The pane, the row above the prompt on desktop, and that row in a terminal.
  sprite: Sprite
  small: Sprite
  terminal: Sprite
}

export const bundled: Mascot = {
  text: bundledMascot.mascot,
  sprite: bundledMascot.sprite,
  small: bundledMascot.small,
  terminal: bundledMascot.terminal,
}

const FORMAT = 1
const KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const MOODS: readonly string[] = [...CORE_MOODS, ...Object.keys(SUB_MOODS)]

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Why `value` isn't a usable sprite, or undefined when it is.
function spriteProblem(value: unknown): string | undefined {
  if (!isObject(value)) return 'not an object'
  const { width, height, palette, animations, cells } = value
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 1 || (height as number) < 1) {
    return 'width and height must be positive whole numbers'
  }
  if (!Array.isArray(palette) || palette.length > KEYS.length || !palette.every(c => /^#[0-9a-f]{6}$/i.test(String(c)))) {
    return `palette must be up to ${KEYS.length} colors like "#de7356"`
  }
  if (cells !== undefined && cells !== 'half' && cells !== 'quad') return 'cells must be "half" or "quad"'
  if (!isObject(animations) || !Array.isArray(animations.idle) || animations.idle.length === 0) {
    return 'it needs an idle animation'
  }
  const size = (width as number) * (height as number)
  const known = '.' + KEYS.slice(0, palette.length)
  for (const [mood, frames] of Object.entries(animations)) {
    if (!Array.isArray(frames)) return `${mood} must be a list of frames`
    for (const frame of frames) {
      if (!isObject(frame) || typeof frame.duration !== 'number' || frame.duration <= 0) {
        return `${mood}: every frame needs a positive duration`
      }
      const { pixels } = frame
      if (typeof pixels !== 'string' || pixels.length !== size || ![...pixels].every(k => known.includes(k))) {
        return `${mood}: every frame needs ${size} pixels, each "." or a palette key`
      }
    }
  }
  return undefined
}

// A compiled mascot file's text → the mascot, or why it can't be used. Missing
// sprites fall back as the build's do: terminal → row (small) → pane.
export function parseMascot(json: string): Mascot | string {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return 'not valid JSON'
  }
  if (!isObject(value)) return 'not a mascot file'
  if (value.format !== FORMAT) return `format ${String(value.format)}, but this version of the mod reads format ${FORMAT}`
  if (typeof value.name !== 'string' || !value.name.trim()) return 'it has no name'
  const captions = value.captions ?? {}
  if (!isObject(captions) || !Object.entries(captions).every(([m, c]) => MOODS.includes(m) && typeof c === 'string')) {
    return 'captions must be text, one per mood'
  }
  if (!isObject(value.sprites)) return 'it has no sprites'
  const { pane, row, terminal } = value.sprites
  for (const [surface, sprite] of Object.entries({ pane, row, terminal })) {
    if (sprite === undefined && surface !== 'pane') continue
    const problem = spriteProblem(sprite)
    if (problem) return `the ${surface} sprite: ${problem}`
  }
  const sprite = pane as Sprite
  const small = (row as Sprite | undefined) ?? sprite
  return {
    text: { name: value.name, captions: captions as MascotText['captions'] },
    sprite,
    small,
    terminal: (terminal as Sprite | undefined) ?? small,
  }
}
