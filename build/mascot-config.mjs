// Reads and checks a mascot folder's mascot.json. The mascot is mascots/<MASCOT>, or
// mascots/maudette when MASCOT isn't set.
import { existsSync, readFileSync } from 'node:fs'

// Kept in step with CORE_MOODS and SUB_MOODS in mod/hooks/mood.ts.
export const MOODS = ['idle', 'think', 'read', 'write', 'run', 'happy', 'sad', 'sleep', 'waiting']
export const SUB_MOODS = ['run.test', 'run.git', 'read.web', 'read.search']
export const ALL_MOODS = [...MOODS, ...SUB_MOODS]

// A tag is a mood, or a variant of one: `idle`, `idle:yawn`, `run.test:sweat`.
export const moodOfTag = tag => tag.split(':')[0]

// Where each sprite is drawn, and what it stands in for when missing.
export const SURFACES = ['pane', 'row', 'terminal']
export const FALLBACK = { row: 'pane', terminal: 'row' }

export const name = process.env.MASCOT ?? 'maudette'
export const dir = `mascots/${name}`

export function readMascot() {
  const path = `${dir}/mascot.json`
  if (!existsSync(path)) throw new Error(`${path} is missing`)
  const mascot = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof mascot.name !== 'string' || !mascot.name.trim()) throw new Error(`${path}: "name" must be a non-empty string`)

  const sprites = mascot.sprites ?? {}
  if (!sprites.pane) throw new Error(`${path}: "sprites.pane" is required: every other sprite falls back to it`)
  for (const [surface, sprite] of Object.entries(sprites)) {
    if (!SURFACES.includes(surface)) throw new Error(`${path}: unknown sprite "${surface}" (use ${SURFACES.join(', ')})`)
    if (typeof sprite.file !== 'string' || !/\.(aseprite|ase|png)$/.test(sprite.file)) {
      throw new Error(`${path}: sprites.${surface}.file must be an .aseprite or .png file`)
    }
    if (!existsSync(`${dir}/${sprite.file}`)) throw new Error(`${path}: sprites.${surface}.file: ${dir}/${sprite.file} is missing`)
    if (sprite.pixels !== undefined && !['square', 'tall'].includes(sprite.pixels)) {
      throw new Error(`${path}: sprites.${surface}.pixels must be "square" or "tall"`)
    }
    if (sprite.pixels === 'tall' && surface !== 'terminal') console.warn(`${path}: "pixels": "tall" only applies to the terminal sprite`)
  }

  const captions = mascot.captions ?? {}
  for (const [mood, text] of Object.entries(captions)) {
    if (!ALL_MOODS.includes(mood)) console.warn(`${path}: caption for "${mood}", which isn't a mood the mod knows`)
    if (typeof text !== 'string') throw new Error(`${path}: the caption for "${mood}" must be a string`)
  }
  if (!captions.idle) console.warn(`${path}: no idle caption: moods without one will show just the name`)

  return { name: mascot.name, sprites, captions }
}
