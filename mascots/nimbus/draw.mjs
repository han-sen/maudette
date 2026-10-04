// Draws Nimbus, an ambient mascot: a tiny sky whose weather follows the work.
// Writes its art as PNG sprite sheets with Aseprite-format JSON beside them:
// art/pane.png + .json (32×32, multicolor) and art/terminal.png + .json
// (18×6, 1:2 pixels, one color). It needs no Aseprite.
//
//   node mascots/nimbus/draw.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const TAU = Math.PI * 2

// Pale parts carry a darker edge or tint, so they read on a light theme too.
const C = {
  cloud: '#e3eaf4',
  cloudShade: '#c4d1e3',
  cloudEdge: '#7d93b2',
  storm: '#8d99ab',
  stormShade: '#747f91',
  stormEdge: '#4f596a',
  white: '#ffffff',
  sun: '#f6c344',
  sunEdge: '#e0912f',
  ray: '#f0a43a',
  rain: '#5b8fd6',
  snow: '#a9c3e6',
  bolt: '#f7d354',
  boltEdge: '#c98f1c',
  moon: '#f1e6b8',
  moonEdge: '#b9a76a',
  star: '#e2b545',
  wind: '#93a8c2',
  bow: ['#e06a5a', '#f0a050', '#f2d060', '#6cc08a', '#5b8fd6'],
}

// ---- Drawing helpers (32×32) ----

const W = 32
const H = 32
const blank = (w = W, h = H) => Array.from({ length: h }, () => Array(w).fill(null))
const put = (g, x, y, c) => {
  x = Math.round(x)
  y = Math.round(y)
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c
}
const inCircle = (x, y, cx, cy, r) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r

// Lays a shape on: its outline first (any empty-or-covered pixel next to it),
// then its fill. So a shape sits in front of what was drawn before it.
function layer(g, inside, fill, edge) {
  const mask = (x, y) => x >= 0 && x < W && y >= 0 && y < H && inside(x, y)
  if (edge)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (!mask(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => mask(x + a, y + b))) g[y][x] = edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask(x, y)) g[y][x] = fill(x, y)
}

// A cumulus: three puffs on a flat base. `puff` swells the top one.
function cloud(g, cx, cy, { storm = false, puff = 0, scale = 1 } = {}) {
  const s = scale
  const puffs = [
    [cx - 6 * s, cy + 1 * s, 4.2 * s],
    [cx, cy - 2 * s, (5.6 + puff) * s],
    [cx + 6 * s, cy + 1.2 * s, 4.4 * s],
  ]
  const inside = (x, y) => y + 0.5 <= cy + 4.6 * s && puffs.some(([px, py, r]) => inCircle(x, y, px, py, r))
  const [fill, shade, edge] = storm ? [C.storm, C.stormShade, C.stormEdge] : [C.cloud, C.cloudShade, C.cloudEdge]
  layer(g, inside, (x, y) => (y + 0.5 > cy + 2 * s ? shade : fill), edge)
  if (!storm) for (const [x, y] of [[-3, -5], [-2, -6], [-4, -4]]) if (inside(Math.round(cx + x * s), Math.round(cy + y * s))) put(g, cx + x * s, cy + y * s, C.white)
}

function sun(g, cx, cy, r, phase = 0, rays = true) {
  if (rays)
    for (let k = 0; k < 8; k++) {
      const a = phase + (k * TAU) / 8
      for (let d = r + 2; d <= r + 4; d++) put(g, cx - 0.5 + d * Math.cos(a), cy - 0.5 + d * Math.sin(a), C.ray)
    }
  layer(g, (x, y) => inCircle(x, y, cx, cy, r), () => C.sun, C.sunEdge)
}

function drop(g, x, y, c = C.rain) {
  put(g, x, y, c)
  put(g, x, y + 1, c)
}
function flake(g, x, y) {
  put(g, x, y, C.snow)
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(g, x + a, y + b, C.snow)
}
function star(g, x, y, big) {
  put(g, x, y, C.star)
  if (big) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(g, x + a, y + b, C.star)
}
function bolt(g, x, y) {
  const path = [[2, 0], [1, 1], [0, 2], [1, 3], [2, 3], [1, 4], [0, 5], [-1, 6]]
  const pts = new Set(path.flatMap(([a, b]) => [[a, b], [a + 1, b]]).map(([a, b]) => `${x + a},${y + b}`))
  layer(g, (px, py) => pts.has(`${px},${py}`), () => C.bolt, C.boltEdge)
}
function wind(g, x, y, len) {
  for (let i = 0; i < len; i++) put(g, x + i, y, C.wind)
  put(g, x + len, y - 1, C.wind)
}

const frames = (n, ms, draw) => Array.from({ length: n }, (_, i) => [draw(i / n, i), ms])

// ---- The pane sprite ----

const PANE = {
  // Partly cloudy: the cloud drifts slowly in front of the sun.
  idle: frames(8, 240, (t, i) => {
    const g = blank()
    sun(g, 21, 11, 5, t * 0.8)
    cloud(g, 13 + [0, 0, 1, 1, 2, 2, 1, 1][i], 18)
    return g
  }),
  // Clouds gathering: the top puff billows up and settles.
  think: frames(8, 160, (t, i) => {
    const g = blank()
    const p = [0, 0.5, 1, 1.5, 1.5, 1, 0.5, 0][i]
    cloud(g, 7 + [0, 1, 1, 2, 2, 1, 1, 0][i], 12, { scale: 0.55 })
    cloud(g, 16, 18, { puff: p })
    return g
  }),
  // Reading: wind streaks sweep beneath the cloud, line after line.
  read: frames(10, 110, t => {
    const g = blank()
    cloud(g, 16, 12)
    for (const [row, lag] of [[21, 0], [25, 0.35], [29, 0.7]]) {
      const x = ((t + lag) % 1) * 30 - 6
      wind(g, x, row, 7)
    }
    return g
  }),
  // Writing: snow falls and piles up on the ground.
  write: frames(8, 150, (t, i) => {
    const g = blank()
    cloud(g, 16, 10)
    for (const [x, y0] of [[8, 16], [14, 19], [20, 15], [25, 18], [11, 22]]) {
      const y = 16 + ((y0 - 16 + i * 2) % 12)
      flake(g, x, y)
    }
    const pile = 4 + i
    layer(g, (x, y) => y >= 29 && y <= 30 && Math.abs(x + 0.5 - 16) <= pile - (y === 29 ? 2 : 0), () => C.snow, C.cloudEdge)
    return g
  }),
  // Running: a storm, with slanting rain and lightning.
  run: frames(8, 90, (t, i) => {
    const g = blank()
    cloud(g, 16, 10, { storm: true })
    for (let k = 0; k < 7; k++) {
      const x = 5 + k * 3.5 + ((i * 1.5) % 3)
      const y = 17 + ((k * 5 + i * 3) % 12)
      put(g, x, y, C.rain)
      put(g, x - 1, y + 1, C.rain)
    }
    if (i === 2 || i === 3 || i === 6) bolt(g, 15, 16)
    return g
  }),
  // Clear skies: the sun's rays turn and a rainbow arcs in.
  happy: [1, 2, 3, 3, 3, 3].map((bands, i) => {
    const g = blank()
    for (let b = 0; b < Math.min(bands + 2, 5); b++) {
      const r = 15 - b
      for (let a = 0; a <= 64; a++) {
        const ang = Math.PI + (a / 64) * Math.PI
        if (a / 64 > (i + 1) / 3) break
        put(g, 16 - 0.5 + r * Math.cos(ang), 27 - 0.5 + r * Math.sin(ang), C.bow[b])
      }
    }
    sun(g, 16, 20, 5, i * 0.25)
    return [g, [140, 140, 160, 300, 300, 300][i]]
  }),
  // Showers: a gray cloud and steady rain.
  sad: frames(6, 150, (t, i) => {
    const g = blank()
    cloud(g, 16, 11, { storm: true })
    for (let k = 0; k < 6; k++) drop(g, 7 + k * 3.6, 17 + ((k * 4 + i * 2) % 12))
    return g
  }),
  // A clear night: a crescent moon and twinkling stars.
  sleep: frames(4, 650, (t, i) => {
    const g = blank()
    layer(g, (x, y) => inCircle(x, y, 14, 15, 8) && !inCircle(x, y, 18, 12, 7), () => C.moon, C.moonEdge)
    const twinkle = [[24, 7], [27, 19], [6, 26], [21, 27], [5, 6]]
    twinkle.forEach(([x, y], k) => star(g, x, y, (k + i) % 2 === 0))
    return g
  }),
  // Waiting on you: the sun peeks out from behind the cloud, then ducks back.
  waiting: [19, 15, 11, 11, 15, 19].map((sy, i) => {
    const g = blank()
    sun(g, 21, sy, 5, i * 0.3, sy < 16)
    cloud(g, 14, 20)
    return [g, [500, 120, 450, 450, 120, 300][i]]
  }),
}

// ---- The terminal sprite: 18×6, 1:2 pixels, one color ----
// Tall pixels: shapes are twice as wide in pixels as they are tall.

const SKY = '#6b97cf'
const TW = 18
const TH = 6
const stamp = (g, rows, ox, oy) =>
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && put(g, ox + x, oy + y, SKY)))
const CLOUD = ['..##..###..', '.#########.', '###########']
const PUFFED = ['..##.####..', '.#########.', '###########']
// A round core (5 wide × 2 tall reads as round in tall pixels) with rays.
const SUN = ['.#..#..#.', '..#####..', '#.#####.#', '.#..#..#.']
const SUN_TURNED = ['..#...#..', '#.#####.#', '..#####..', '..#...#..']
const MOON = ['.###.', '##...', '##...', '.###.']
const BOLT = ['..#', '.#.', '###', '.#.', '#..']

const tFrames = (n, ms, draw) => Array.from({ length: n }, (_, i) => [draw(i / n, i), ms])
const tBlank = () => blank(TW, TH)

const TERMINAL = {
  idle: tFrames(8, 240, (t, i) => {
    const g = tBlank()
    stamp(g, SUN, 9, 0)
    stamp(g, CLOUD, 2 + [0, 0, 1, 1, 2, 2, 1, 1][i], 3)
    return g
  }),
  think: tFrames(6, 200, (t, i) => {
    const g = tBlank()
    stamp(g, i % 3 === 2 ? PUFFED : CLOUD, 4, 1)
    if (i >= 3) put(g, 15, 0, SKY)
    return g
  }),
  read: tFrames(8, 110, t => {
    const g = tBlank()
    stamp(g, CLOUD, 4, 0)
    for (const [row, lag] of [[4, 0], [5, 0.5]]) {
      const x = Math.round(((t + lag) % 1) * 22) - 4
      for (let k = 0; k < 4; k++) put(g, x + k, row, SKY)
    }
    return g
  }),
  write: tFrames(6, 160, (t, i) => {
    const g = tBlank()
    stamp(g, CLOUD, 4, 0)
    for (const [x, y0] of [[5, 3], [9, 4], [13, 3]]) put(g, x, 3 + ((y0 - 3 + i) % 3), SKY)
    for (let x = 9 - Math.floor(i / 2); x <= 9 + Math.floor(i / 2); x++) put(g, x, 5, SKY)
    return g
  }),
  run: tFrames(6, 90, (t, i) => {
    const g = tBlank()
    stamp(g, CLOUD, 4, 0)
    if (i === 1 || i === 4) stamp(g, BOLT, 8, 1)
    else for (const x of [5, 9, 13]) put(g, x - (i % 2), 3 + ((x + i) % 3), SKY)
    return g
  }),
  happy: tFrames(4, 220, (t, i) => {
    const g = tBlank()
    stamp(g, i % 2 ? SUN_TURNED : SUN, 5, 1)
    return g
  }),
  sad: tFrames(6, 150, (t, i) => {
    const g = tBlank()
    stamp(g, CLOUD, 4, 0)
    for (const x of [5, 8, 11, 14]) put(g, x, 3 + ((x + i) % 3), SKY)
    return g
  }),
  sleep: tFrames(2, 900, (t, i) => {
    const g = tBlank()
    stamp(g, MOON, 5, 1)
    put(g, i ? 13 : 12, i ? 1 : 3, SKY)
    put(g, i ? 15 : 16, i ? 4 : 2, SKY)
    return g
  }),
  waiting: [3, 1, 0, 1, 3].map((sy, i) => {
    const g = tBlank()
    stamp(g, SUN, 8, sy)
    stamp(g, CLOUD, 2, 3)
    return [g, [500, 120, 450, 120, 300][i]]
  }),
}

// ---- Writing the sheets ----

function writeSheet(name, w, h, tags) {
  const all = []
  const frameTags = []
  for (const [tag, list] of Object.entries(tags)) {
    frameTags.push({ name: tag, from: all.length, to: all.length + list.length - 1, direction: 'forward' })
    all.push(...list)
  }
  const png = new PNG({ width: w * all.length, height: h })
  all.forEach(([grid], i) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = grid[y][x]
        if (!c) continue
        png.data.set([1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)).concat(255), (y * png.width + i * w + x) * 4)
      }
  })
  mkdirSync(join(here, 'art'), { recursive: true })
  writeFileSync(join(here, 'art', `${name}.png`), PNG.sync.write(png))
  const rect = i => ({ x: i * w, y: 0, w, h })
  writeFileSync(
    join(here, 'art', `${name}.json`),
    JSON.stringify(
      {
        frames: all.map(([, duration], i) => ({
          filename: `${name} ${i}`,
          frame: rect(i),
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w, h },
          sourceSize: { w, h },
          duration,
        })),
        meta: { app: 'mascots/nimbus/draw.mjs', image: `${name}.png`, format: 'RGBA8888', size: { w: png.width, h }, scale: '1', frameTags },
      },
      null,
      1,
    ),
  )
  console.log(`nimbus: art/${name}.png, ${w}×${h}, ${all.length} frames, ${frameTags.length} tags`)
}

writeSheet('pane', W, H, PANE)
writeSheet('terminal', TW, TH, TERMINAL)
