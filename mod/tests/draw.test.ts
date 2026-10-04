import { expect, test } from 'claude-code/testing'

import { toCells } from '../hooks/draw'
import type { Sprite } from '../hooks/draw'

const DEFAULT = 0x01000000

function cell(sprite: Sprite) {
  const frame = sprite.animations.idle?.[0]
  if (!frame) throw new Error('no idle frame')
  const bytes = Uint8Array.from(atob(toCells(sprite, frame)), c => c.charCodeAt(0))
  return [...new Uint32Array(bytes.buffer)]
}

const quad = (palette: string[], pixels: string): Sprite => ({
  width: 2,
  height: 2,
  palette,
  cells: 'quad',
  animations: { idle: [{ duration: 100, pixels }] },
})

test('a quadrant cell draws one pixel over the terminal background', async () => {
  expect(cell(quad(['#ff0000'], '0...'))).toEqual([0x2598, 0xff0000, DEFAULT])
})

test('a quadrant cell with two colors keeps both, darker as the glyph', async () => {
  expect(cell(quad(['#ff0000', '#0000ff'], '0011'))).toEqual([0x2584, 0x0000ff, 0xff0000])
})

test('a solid quadrant cell is a background-colored space', async () => {
  expect(cell(quad(['#ff0000'], '0000'))).toEqual([0x20, DEFAULT, 0xff0000])
})
