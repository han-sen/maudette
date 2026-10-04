// Turns the mascot's exports (<mascot>/export/<surface>.png + .json, json-array
// with tags; see build/export.mjs) and its mascot.json into mod/hooks/sprites.ts.
// The mod can't decode PNGs or import JSON at run time, so every frame becomes
// a string of palette indices here.
//
// One sprite per surface: `sprite` (pane, the /maudette pane), `small` (row,
// the row above the prompt on desktop) and `terminal` (that row in a
// terminal). A surface without art falls back: terminal → row → pane.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

import { ALL_MOODS, FALLBACK, MOODS, dir, moodOfTag, name as id, readMascot } from './mascot-config.mjs'

// One character per pixel: '.' is transparent, the rest index the palette.
const KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function order({ from, to, direction }) {
  const forward = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (direction === 'reverse') return forward.reverse()
  if (direction === 'pingpong') return [...forward, ...forward.slice(1, -1).reverse()]
  return forward
}

function load(surface, { quad = false } = {}) {
  const name = `${surface} sprite`
  const sheet = JSON.parse(readFileSync(`${dir}/export/${surface}.json`, 'utf8'))
  const png = PNG.sync.read(readFileSync(`${dir}/export/${sheet.meta.image}`))
  const frames = Array.isArray(sheet.frames) ? sheet.frames : Object.values(sheet.frames)
  const { w: width, h: height } = frames[0].sourceSize

  const palette = []
  const keyOf = new Map()

  function encode({ frame, spriteSourceSize }) {
    const out = Array(width * height).fill('.')
    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const o = ((frame.y + y) * png.width + frame.x + x) * 4
        if (png.data[o + 3] < 128) continue
        const hex = '#' + [0, 1, 2].map(i => png.data[o + i].toString(16).padStart(2, '0')).join('')
        if (!keyOf.has(hex)) {
          if (palette.length === KEYS.length) throw new Error(`${name}: more than ${KEYS.length} colors`)
          keyOf.set(hex, KEYS[palette.length])
          palette.push(hex)
        }
        out[(spriteSourceSize.y + y) * width + spriteSourceSize.x + x] = keyOf.get(hex)
      }
    }
    return out.join('')
  }

  const animations = {}
  for (const tag of sheet.meta.frameTags ?? []) {
    animations[tag.name] = order(tag).map(i => ({ duration: frames[i].duration ?? 100, pixels: encode(frames[i]) }))
  }

  if (!animations.idle) throw new Error(`${name}: the sheet needs an "idle" tag: every missing mood falls back to it`)
  const missing = MOODS.filter(m => !Object.keys(animations).some(tag => moodOfTag(tag) === m))
  if (missing.length) console.warn(`${name}: no tag for ${missing.join(', ')}: those moods will show idle`)
  const unknown = Object.keys(animations).filter(tag => !ALL_MOODS.includes(moodOfTag(tag)))
  if (unknown.length) console.warn(`${name}: tags the mod doesn't use yet: ${unknown.join(', ')}`)

  if (quad) {
    // A terminal cell is a 2×2 block and shows two colors at most, transparent
    // counting as one; the mod draws a third as the nearer of the two.
    const seen = new Set()
    for (const tag of sheet.meta.frameTags ?? []) {
      for (let f = tag.from; f <= tag.to; f++) {
        const pixels = encode(frames[f])
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x += 2) {
            const block = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]
              .map(([bx, by]) => (bx < width && by < height ? pixels[by * width + bx] : '.'))
            const where = `frame ${f + 1}, x ${x}-${x + 1}, y ${y}-${y + 1}`
            if (new Set(block).size > 2 && !seen.has(where)) {
              seen.add(where)
              console.warn(`${name}: more than 2 colors in one cell (${tag.name}, ${where})`)
            }
          }
        }
      }
    }
  }

  const count = Object.values(animations).reduce((n, a) => n + a.length, 0)
  console.log(`sprites: ${name} ${width}×${height}, ${palette.length} colors, ${count} frames`)
  return { width, height, palette, animations }
}

const mascot = readMascot()
const sprites = {}
for (const surface of ['pane', 'row', 'terminal']) {
  const config = mascot.sprites[surface]
  if (!config) {
    sprites[surface] = null
    console.warn(`sprites: no ${surface} sprite in mascot.json: it uses the ${FALLBACK[surface]} sprite`)
    continue
  }
  const quad = config.pixels === 'tall'
  sprites[surface] = { ...load(surface, { quad }), ...(quad ? { cells: 'quad' } : {}) }
}

// The compiled mascot: one file the mod can load at run time (see mod/hooks/mascot.ts
// for its format). Written beside the mascot's art; build/install-mascot.mjs copies
// it to ~/.claude/mascots/.
const compiled = {
  format: 1,
  name: mascot.name,
  captions: mascot.captions,
  sprites: Object.fromEntries(Object.entries(sprites).filter(([, s]) => s)),
}
writeFileSync(`${dir}/${id}.mascot.json`, JSON.stringify(compiled))
console.log(`sprites: ${dir} → ${dir}/${id}.mascot.json`)

// With --compile-only, stop here: the mod keeps its bundled mascot.
if (process.argv.includes('--compile-only')) process.exit(0)

const declare = (name, surface, fallback) =>
  sprites[surface]
    ? `export const ${name}: Sprite = ${JSON.stringify(sprites[surface], null, 1)}\n`
    : `export const ${name}: Sprite = ${fallback}\n`

writeFileSync(
  'mod/hooks/sprites.ts',
  `// Generated by build/sprites.mjs from ${dir}. Don't edit by hand.\n` +
    (existsSync(`${dir}/LICENSE`) ? `// ${mascot.name}'s artwork is licensed separately from the code: see LICENSE-ART.\n` : '') +
    `import type { Sprite } from './draw'\n` +
    `import type { MascotText } from './mood'\n\n` +
    `export const mascot: MascotText = ${JSON.stringify({ name: mascot.name, captions: mascot.captions }, null, 1)}\n\n` +
    declare('sprite', 'pane') +
    '\n' +
    declare('small', 'row', 'sprite') +
    '\n' +
    declare('terminal', 'terminal', 'small'),
)
console.log(`sprites: ${dir} → mod/hooks/sprites.ts`)
