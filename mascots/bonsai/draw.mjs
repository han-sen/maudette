// Draws Bonsai, a still-life mascot: a potted tree whose foliage, blossoms and
// visitors follow the work. Writes its art as PNG sprite sheets with
// Aseprite-format JSON beside them: art/pane.png + .json (32×32, multicolor)
// and art/terminal.png + .json (18×6, 1:2 pixels, one color). It needs no
// Aseprite.
//
//   node mascots/bonsai/draw.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))

const C = {
  pot: '#c7704d', // terracotta, in Claude's orange family
  potShade: '#9c5235',
  potLight: '#dd8d69',
  potEdge: '#5e3122',
  soil: '#5a3d2e',
  trunk: '#7a5440',
  trunkDark: '#523627',
  leaf: '#6aa35a',
  leafShade: '#4f8a46',
  leafLight: '#93c672',
  leafEdge: '#2f5a2c',
  dry: '#b5915a',
  dryShade: '#97773f',
  dryEdge: '#5f4a26',
  blossom: '#f4a7ba',
  blossomCore: '#e2708e',
  petal: '#f1b9c7',
  water: '#5b8fd6',
  can: '#7a8ca8',
  canEdge: '#48566e',
  firefly: '#f3cf4a',
  bird: '#4d6a9a',
  birdBelly: '#e9d6b0',
  beak: '#e8a33a',
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
const inEllipse = (x, y, cx, cy, rx, ry) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1

// Lays a shape on: its outline first, then its fill, in front of what's there.
function layer(g, inside, fill, edge) {
  const mask = (x, y) => x >= 0 && x < W && y >= 0 && y < H && inside(x, y)
  if (edge)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (!mask(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => mask(x + a, y + b))) g[y][x] = edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask(x, y)) g[y][x] = fill(x, y)
}

// A shallow, wide bonsai pot with a rim, a band of soil and two feet.
function pot(g, { wet = false } = {}) {
  layer(
    g,
    (x, y) => (y >= 24 && y <= 28 && x >= 7 && x <= 24) || (y === 23 && x >= 6 && x <= 25) || (y === 29 && (x === 9 || x === 10 || x === 21 || x === 22)),
    (x, y) => (y === 23 ? C.potLight : y >= 27 || x >= 22 ? C.potShade : C.pot),
    C.potEdge,
  )
  for (let x = 8; x <= 23; x++) put(g, x, 23, wet ? C.trunkDark : C.soil)
}

// A thick line, for the trunk and branches.
function limb(g, [x0, y0], [x1, y1], width, color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps
    const y = y0 + ((y1 - y0) * i) / steps
    for (let a = 0; a < width; a++) put(g, x + a - width / 2 + 0.5, y, color)
  }
}

function tree(g, { sway = 0, droop = 0, dry = false, shoot = 0, lift = -1, nod = 0 } = {}) {
  // Trunk: up from the soil with a lean, then a branch out to each pad.
  limb(g, [16, 22], [14, 18], 3, C.trunk)
  limb(g, [14, 18], [15, 13], 2, C.trunk)
  limb(g, [15, 13], [14, 8 + droop + nod], 2, C.trunk)
  limb(g, [15, 14], [21, 12 + droop], 2, C.trunk)
  limb(g, [14, 17], [9, 15 + droop], 2, C.trunkDark)
  for (const [x, y] of [[15, 21], [15, 20], [14, 19]]) put(g, x, y, C.trunkDark)
  // A new shoot, grown out to the right as `shoot` goes from 0 to 1.
  if (shoot > 0) limb(g, [25, 11], [25 + 3 * shoot, 11 - 3 * shoot], 1, C.trunk)

  const [fill, shade, light, edge] = dry ? [C.dry, C.dryShade, C.dry, C.dryEdge] : [C.leaf, C.leafShade, C.leafLight, C.leafEdge]
  // Foliage pads, cloud-pruned and apart, so branches show between them.
  // The higher a pad, the more it sways; `lift` raises one (a rustle).
  const pads = [
    [8.5 + sway * 0.5, 14 + droop, 4.4, 2.4],
    [22 + sway * 0.7, 11 + droop, 4.8, 2.6],
    [14 + sway, 5.5 + droop + nod, 4.4, 2.5],
  ].map((p, k) => (k === lift ? [p[0], p[1] - 1, p[2], p[3]] : p))
  if (shoot >= 1) pads.push([28.5 + sway * 0.6, 7, 2.6, 1.7])
  layer(
    g,
    (x, y) => pads.some(([cx, cy, rx, ry]) => inEllipse(x, y, cx, cy, rx, ry)),
    (x, y) => {
      const pad = pads.find(([cx, cy, rx, ry]) => inEllipse(x, y, cx, cy, rx, ry))
      return y + 0.5 > pad[1] + 0.8 ? shade : fill
    },
    edge,
  )
  if (!dry)
    pads.slice(0, 3).forEach(([cx, cy, rx, ry], k) => {
      const width = k === lift ? rx * 1.4 : 2
      for (let dx = -width / 2; dx < width / 2; dx++) put(g, cx - 1 + dx, cy - ry + 0.9, light)
    })
  return pads
}

// A small watering can up and to the right, pouring a stream into the pot.
function wateringCan(g, i) {
  layer(g, (x, y) => (x >= 25 && x <= 30 && y >= 2 && y <= 5) || (y === 1 && x >= 27 && x <= 29), () => C.can, C.canEdge)
  limb(g, [25, 4], [21, 6], 1, C.canEdge)
  for (let k = 0; k < 4; k++) {
    const y = 8 + ((k * 4 + i * 2) % 15)
    put(g, 20, y, C.water)
    put(g, 20, y + 1, C.water)
  }
}

function blossom(g, x, y, open) {
  put(g, x, y, open ? C.blossomCore : C.blossom)
  if (open) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(g, x + a, y + b, C.blossom)
}
function leaf(g, x, y, c = C.leaf) {
  put(g, x, y, c)
  put(g, x + 1, y, c)
}
function firefly(g, x, y, bright) {
  put(g, x, y, C.firefly)
  if (bright) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(g, x + a, y + b, C.firefly)
}
// A small bird perched with its feet at (x, y), facing left or right.
function bird(g, x, y, facing) {
  const f = facing === 'left' ? -1 : 1
  for (const [a, b] of [[0, -1], [1, -1], [-1, -1], [0, -2], [1, -2], [-1, -2], [0, -3]]) put(g, x + a * f, y + b, C.bird)
  put(g, x, y - 1, C.birdBelly)
  put(g, x + 1 * f, y - 3, C.bird)
  put(g, x + 2 * f, y - 3, C.beak)
  put(g, x - 2 * f, y - 2, C.bird)
}

const frames = (n, ms, draw) => Array.from({ length: n }, (_, i) => [draw(i / n, i), ms])
const SWAY = [0, 0, 1, 1, 1, 0, 0, -1, -1, -1]

const PANE = {
  // The foliage sways gently.
  idle: frames(10, 220, (t, i) => {
    const g = blank()
    pot(g)
    tree(g, { sway: SWAY[i] })
    return g
  }),
  // A single leaf drifts down, swinging side to side.
  think: frames(8, 200, (t, i) => {
    const g = blank()
    pot(g)
    tree(g)
    leaf(g, 23 + [0, 1, 2, 1, 0, -1, -2, -1][i], 14 + i * 1.1, C.leafLight)
    return g
  }),
  // A rustle travels through the canopy, pad by pad, like scanning.
  read: frames(6, 150, (t, i) => {
    const g = blank()
    pot(g)
    tree(g, { lift: [0, 2, 1, -1, 0, 2][i] })
    return g
  }),
  // A new shoot grows out and leafs.
  write: [0.25, 0.5, 0.75, 1, 1, 1].map((shoot, i) => {
    const g = blank()
    pot(g)
    tree(g, { shoot })
    if (shoot < 1) put(g, 25 + 3 * shoot + 1, 10 - 3 * shoot, C.leafLight)
    return [g, [160, 160, 160, 200, 300, 300][i]]
  }),
  // Watering: drops fall into the pot and the soil darkens.
  run: frames(6, 110, (t, i) => {
    const g = blank()
    pot(g, { wet: i >= 2 })
    tree(g)
    wateringCan(g, i)
    return g
  }),
  // It blossoms: flowers open across the pads and petals drift off.
  happy: [0, 1, 2, 3, 3].map((stage, i) => {
    const g = blank()
    pot(g)
    tree(g)
    const spots = [[7, 14], [10, 13], [20, 10], [23, 11], [25, 10], [12, 5], [16, 5]]
    spots.forEach(([x, y], k) => {
      if (k <= stage * 2 + 1) blossom(g, x, y, stage >= 2)
    })
    if (stage === 3) for (const [x, y] of [[27, 6 + i], [5, 4 + i * 2], [29, 15 + i]]) put(g, x, y, C.petal)
    return [g, [160, 160, 180, 320, 320][i]]
  }),
  // It wilts: the pads droop and brown, a leaf falls.
  sad: [0, 1, 2, 2].map((droop, i) => {
    const g = blank()
    pot(g)
    tree(g, { droop, dry: droop >= 1 })
    if (i >= 2) leaf(g, 25, 16 + (i - 2) * 4, C.dry)
    return [g, [200, 200, 600, 600][i]]
  }),
  // Asleep: the top pad nods slowly down and back up, like a dozing head,
  // while fireflies blink around the tree.
  sleep: [0, 2, 0, 2].map((nod, i) => {
    const g = blank()
    pot(g)
    tree(g, { nod })
    ;[[4, 6], [27, 4], [28, 19], [3, 19]].forEach(([x, y], k) => firefly(g, x, y + (i % 2), (k + i) % 2 === 0))
    return [g, nod ? 1400 : 1200]
  }),
  // Waiting on you: a bird lands on a branch and looks around.
  waiting: [
    [null, 300],
    ['right', 150],
    ['right', 450],
    ['left', 450],
    ['right', 450],
  ].map(([facing, ms], i) => {
    const g = blank()
    pot(g)
    tree(g)
    if (!facing) bird(g, 28, 3, 'left')
    else bird(g, 22, 9, facing)
    return [g, ms]
  }),
}

// ---- The terminal sprite: 18×6, 1:2 pixels, one color ----

const GREEN = '#5f9a52'
const TW = 18
const TH = 6
const tBlank = () => blank(TW, TH)
const stamp = (g, rows, ox = 0, oy = 0) =>
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && put(g, ox + x, oy + y, GREEN)))

// Three foliage pads over a leaning trunk, on a wide flat pot.
const TREE = [
  '......####........',
  '.###..####..####..',
  '.###...#....####..',
  '.......##.........',
  '...###########....',
  '....#########.....',
]
const SWAYED = [
  '.......####.......',
  '.###...####.####..',
  '.###...#....####..',
  '.......##.........',
  '...###########....',
  '....#########.....',
]
const DROOPED = [
  '..................',
  '......####........',
  '.###..####..####..',
  '.###...##...####..',
  '...###########....',
  '....#########.....',
]
const NODDING = [
  '..................',
  '.###..####..####..',
  '.###..####..####..',
  '.......##.........',
  '...###########....',
  '....#########.....',
]
const tFrames = (n, ms, draw) => Array.from({ length: n }, (_, i) => [draw(i / n, i), ms])

const TERMINAL = {
  idle: tFrames(4, 350, (t, i) => {
    const g = tBlank()
    stamp(g, i % 2 ? SWAYED : TREE)
    return g
  }),
  think: tFrames(6, 220, (t, i) => {
    const g = tBlank()
    stamp(g, TREE)
    put(g, 15 + (i % 2), Math.min(5, 1 + i), GREEN)
    return g
  }),
  read: tFrames(3, 160, (t, i) => {
    const g = tBlank()
    stamp(g, TREE)
    const [x, y] = [[2, 0], [7, -1], [13, 0]][i]
    if (y >= 0) put(g, x, y, GREEN)
    else stamp(g, SWAYED)
    return g
  }),
  write: [1, 2, 3, 3].map((len, i) => {
    const g = tBlank()
    stamp(g, TREE)
    for (let k = 0; k < len; k++) put(g, 16 + k, 1 - (k > 0 ? 1 : 0), GREEN)
    return [g, [200, 200, 300, 400][i]]
  }),
  run: tFrames(4, 120, (t, i) => {
    const g = tBlank()
    stamp(g, TREE)
    for (const [x, lag] of [[1, 0], [16, 2]]) put(g, x, (lag + i) % 4, GREEN)
    return g
  }),
  happy: tFrames(4, 200, (t, i) => {
    const g = tBlank()
    stamp(g, TREE)
    for (const [x, y] of i % 2 ? [[1, 0], [16, 1]] : [[17, 0], [0, 1]]) put(g, x, y, GREEN)
    if (i % 2) for (const x of [4, 9, 13]) put(g, x, 0, GREEN)
    return g
  }),
  sad: [0, 1, 1].map((d, i) => {
    const g = tBlank()
    stamp(g, d ? DROOPED : TREE)
    if (i === 2) put(g, 15, 3, GREEN)
    return [g, [250, 500, 600][i]]
  }),
  // Asleep: the top pad nods slowly down and back up, like a dozing head.
  sleep: [TREE, NODDING].map((rows, i) => {
    const g = tBlank()
    stamp(g, rows)
    return [g, [1200, 1400][i]]
  }),
  waiting: [0, 1, 1, 2].map((pose, i) => {
    const g = tBlank()
    stamp(g, TREE)
    if (pose === 0) put(g, 17, 0, GREEN)
    else {
      put(g, 13, 0, GREEN)
      put(g, pose === 1 ? 14 : 12, 0, GREEN)
    }
    return [g, [300, 450, 450, 450][i]]
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
        meta: { app: 'mascots/bonsai/draw.mjs', image: `${name}.png`, format: 'RGBA8888', size: { w: png.width, h }, scale: '1', frameTags },
      },
      null,
      1,
    ),
  )
  console.log(`bonsai: art/${name}.png, ${w}×${h}, ${all.length} frames, ${frameTags.length} tags`)
}

writeSheet('pane', W, H, PANE)
writeSheet('terminal', TW, TH, TERMINAL)
