// Turns sprite frames into what each surface draws: Raster cells for the
// terminal, an animated SVG for desktop, VS Code and mobile.

export type Frame = { duration: number; pixels: string }

export type Sprite = {
  width: number
  height: number
  palette: string[]
  animations: Record<string, Frame[]>
  // How the terminal packs this sprite's pixels into a cell (see toCells).
  // Absent means 'half'.
  cells?: 'half' | 'quad'
}

const KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DEFAULT_COLOR = 0x01000000
const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

// Quadrant glyphs, indexed by which pixels of a 2×2 block are foreground:
// 1 top-left, 2 top-right, 4 bottom-left, 8 bottom-right.
export const QUADRANTS = [
  SPACE, 0x2598, 0x259d, UPPER_HALF, 0x2596, 0x258c, 0x259e, 0x259b,
  0x2597, 0x259a, 0x2590, 0x259c, LOWER_HALF, 0x2599, 0x259f, 0x2588,
]

export function framesFor(sprite: Sprite, mood: string): Frame[] {
  return sprite.animations[mood] ?? sprite.animations.idle ?? []
}

function colorAt(sprite: Sprite, frame: Frame, x: number, y: number): string | undefined {
  if (x >= sprite.width || y >= sprite.height) return undefined
  const key = frame.pixels[y * sprite.width + x]
  return key === undefined || key === '.' ? undefined : sprite.palette[KEYS.indexOf(key)]
}

const rgb = (hex: string) => parseInt(hex.slice(1), 16)

function distance(a: string, b: string): number {
  const [x, y] = [rgb(a), rgb(b)]
  return [16, 8, 0].reduce((sum, shift) => sum + (((x >> shift) & 0xff) - ((y >> shift) & 0xff)) ** 2, 0)
}

function luminance(hex: string): number {
  const n = rgb(hex)
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 0xff) + 0.0722 * (n & 0xff)
}

// 'half': two pixels stacked in a cell, ▀ with the top pixel as foreground and
// the bottom as background, so pixels come out about square. 'quad': a 2×2
// block per cell as a quadrant glyph (▘▝▖▗▚▞▛▜▙▟…), so pixels come out twice as
// tall as wide: art for it is drawn with a 1:2 pixel aspect ratio.
export function rasterSize(sprite: Sprite) {
  const across = sprite.cells === 'quad' ? 2 : 1
  return { columns: Math.ceil(sprite.width / across), rows: Math.ceil(sprite.height / 2) }
}

// A cell shows two colors at most, so a 2×2 block with more keeps its two
// most common (ties to the darker, so outlines survive) and maps the rest to
// the nearer of them. Where the block has transparent pixels, the second
// color is the terminal's own background.
function quadCell(pixels: Array<string | undefined>): [number, number, number] {
  const counts = new Map<string, number>()
  for (const p of pixels) if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
  const ranked = [...counts].sort(([a, m], [b, n]) => n - m || luminance(a) - luminance(b)).map(([c]) => c)
  const [first, second] = ranked
  if (!first) return [SPACE, DEFAULT_COLOR, DEFAULT_COLOR]
  const hasGap = pixels.some(p => !p)
  if (!hasGap && !second) return [SPACE, DEFAULT_COLOR, rgb(first)]
  let mask = 0
  pixels.forEach((p, i) => {
    if (!p) return
    const isFirst = hasGap || !second || distance(p, first) <= distance(p, second)
    if (isFirst) mask |= 1 << i
  })
  return [QUADRANTS[mask] ?? SPACE, rgb(first), hasGap || !second ? DEFAULT_COLOR : rgb(second)]
}

export function toCells(sprite: Sprite, frame: Frame): string {
  const { columns, rows } = rasterSize(sprite)
  const words = new Uint32Array(columns * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const at = (row * columns + column) * 3
      if (sprite.cells === 'quad') {
        const [x, y] = [column * 2, row * 2]
        const block = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] as const
        words.set(quadCell(block.map(([bx, by]) => colorAt(sprite, frame, bx, by))), at)
        continue
      }
      const top = colorAt(sprite, frame, column, row * 2)
      const bottom = colorAt(sprite, frame, column, row * 2 + 1)
      if (top) {
        words.set([UPPER_HALF, rgb(top), bottom ? rgb(bottom) : DEFAULT_COLOR], at)
      } else if (bottom) {
        words.set([LOWER_HALF, rgb(bottom), DEFAULT_COLOR], at)
      } else {
        words.set([SPACE, DEFAULT_COLOR, DEFAULT_COLOR], at)
      }
    }
  }
  const bytes = new Uint8Array(words.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

// One path per color, each run of pixels a 1px-tall rectangle: far shorter
// than a <rect> per run, which keeps the source under the engine's 128 KB cap.
function toPaths(sprite: Sprite, frame: Frame): string {
  const runs = new Map<string, string>()
  for (let y = 0; y < sprite.height; y++) {
    let x = 0
    while (x < sprite.width) {
      const color = colorAt(sprite, frame, x, y)
      let run = 1
      while (x + run < sprite.width && colorAt(sprite, frame, x + run, y) === color) run++
      if (color) runs.set(color, (runs.get(color) ?? '') + `M${x} ${y}h${run}v1h-${run}z`)
      x += run
    }
  }
  return [...runs].map(([color, d]) => `<path fill="${color}" d="${d}"/>`).join('')
}

// One <g> per distinct frame; SMIL flips its visibility at every time that
// frame is shown, so the desktop animates with no redraws from the mod.
export function toSvg(sprite: Sprite, frames: Frame[]): string {
  const { width, height } = sprite
  const total = frames.reduce((sum, f) => sum + f.duration, 0)
  const shown = new Map<string, Array<[number, number]>>()
  let start = 0
  for (const frame of frames) {
    const spans = shown.get(frame.pixels) ?? []
    const last = spans[spans.length - 1]
    if (last && last[1] === start) last[1] = start + frame.duration
    else spans.push([start, start + frame.duration])
    shown.set(frame.pixels, spans)
    start += frame.duration
  }
  const groups = [...shown].map(([pixels, spans]) => {
    const body = toPaths(sprite, { pixels, duration: 0 })
    if (shown.size === 1) return `<g>${body}</g>`
    const keys: Array<[number, string]> = []
    const key = (time: number, value: string) => {
      const last = keys[keys.length - 1]
      if (last && last[0] === time) last[1] = value
      else if (!last || last[1] !== value) keys.push([time, value])
    }
    key(0, 'hidden')
    for (const [from, to] of spans) {
      key(from / total, 'visible')
      if (to < total) key(to / total, 'hidden')
    }
    const animate =
      `<animate attributeName="visibility" calcMode="discrete" repeatCount="indefinite" dur="${total}ms" ` +
      `values="${keys.map(k => k[1]).join(';')}" keyTimes="${keys.map(k => +k[0].toFixed(4)).join(';')}"/>`
    return `<g visibility="hidden">${animate}${body}</g>`
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `shape-rendering="crispEdges">${groups.join('')}</svg>`
  )
}
