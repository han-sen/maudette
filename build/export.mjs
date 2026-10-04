// Exports each sprite the mascot's mascot.json names to <mascot>/export/<surface>.png
// + .json (Aseprite's sheet format, with frame tags), the input
// build/sprites.mjs reads. A sprite's file can be:
//   - an .aseprite file: exported with the Aseprite CLI
//   - a .png with a .json beside it: a sheet exported from Aseprite or a tool
//     that writes its format, copied as is
//   - a .png alone: one still frame, used as idle
// Only .aseprite files need Aseprite installed. Without it, an .aseprite
// sprite keeps the export already in export/ (Maudette's is committed, so a
// clone builds without Aseprite), and the build says so.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

import { findAseprite } from './aseprite.mjs'
import { dir, readMascot } from './mascot-config.mjs'

const mascot = readMascot()
const hasAseprite = Boolean(findAseprite())
const surfaces = Object.keys(mascot.sprites)
mkdirSync(`${dir}/export`, { recursive: true })
// Clear what's left from surfaces mascot.json no longer names.
for (const file of readdirSync(`${dir}/export`)) {
  if (!surfaces.includes(file.replace(/\.(png|json)$/, ''))) rmSync(`${dir}/export/${file}`)
}

for (const [surface, { file }] of Object.entries(mascot.sprites)) {
  const source = `${dir}/${file}`
  const out = `${dir}/export/${surface}`

  if (!file.endsWith('.png')) {
    if (!hasAseprite) {
      if (!existsSync(`${out}.png`) || !existsSync(`${out}.json`)) {
        console.error(`export: ${file} needs Aseprite to export, and there's no earlier export of it. Install Aseprite, or set ASEPRITE to its binary.`)
        process.exit(1)
      }
      console.log(`export: no Aseprite, so ${surface} keeps its earlier export; changes to ${file} won't show until it's exported with Aseprite`)
      continue
    }
    const { status } = spawnSync(
      'node',
      ['build/aseprite.mjs', '-b', source, '--sheet', `${out}.png`, '--data', `${out}.json`, '--format', 'json-array', '--list-tags'],
      { stdio: 'inherit' },
    )
    if (status !== 0) process.exit(status ?? 1)
    continue
  }

  copyFileSync(source, `${out}.png`)
  const data = source.replace(/\.png$/, '.json')
  if (existsSync(data)) {
    const sheet = JSON.parse(readFileSync(data, 'utf8'))
    if (!sheet.frames || !sheet.meta) throw new Error(`${data}: not a sprite sheet's data (expected "frames" and "meta")`)
    if (!sheet.meta.frameTags?.length) {
      throw new Error(`${data}: no frame tags. Export with tags (Aseprite: check "Tags" under Meta, or --list-tags); each tag is a mood`)
    }
    // The image is copied under the surface's name, so point the data at it.
    writeFileSync(`${out}.json`, JSON.stringify({ ...sheet, meta: { ...sheet.meta, image: `${surface}.png` } }))
    continue
  }

  // A PNG alone: one frame, the whole image, as idle.
  const { width: w, height: h } = PNG.sync.read(readFileSync(source))
  const rect = { x: 0, y: 0, w, h }
  writeFileSync(
    `${out}.json`,
    JSON.stringify({
      frames: [{ frame: rect, spriteSourceSize: rect, sourceSize: { w, h }, duration: 1000 }],
      meta: { image: `${surface}.png`, size: { w, h }, frameTags: [{ name: 'idle', from: 0, to: 0, direction: 'forward' }] },
    }),
  )
  console.log(`export: ${file} has no .json beside it: one still frame, used as idle`)
}
