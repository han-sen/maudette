// Draws Orbit, an abstract mascot: a core with satellites, every mood told
// by motion alone. Writes its art as PNG sprite sheets with Aseprite-format
// JSON beside them: art/pane.png + .json (32×32) and art/terminal.png + .json
// (18×6, 1:2 pixels, one color). It needs no Aseprite, and shows a variant
// (`idle:figure8`), a sub-mood (`run.test`) and the `waiting` mood.
//
//   node mascots/orbit/draw.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const TAU = Math.PI * 2

// Mid-tone oranges: each reads on both the light and the dark theme.
const C = {
  core: '#d97757', // Claude orange
  deep: '#c4573a',
  light: '#e8946f',
}

// ---- The pane sprite: 32×32 ----

const W = 32
const H = 32
const blank = (w = W, h = H) => Array.from({ length: h }, () => Array(w).fill(null))
const put = (g, x, y, c) => {
  x = Math.round(x)
  y = Math.round(y)
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c
}
const disc = (g, cx, cy, r, c) => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(g, x, y, c)
}
const ring = (g, cx, cy, r, c) => {
  for (let i = 0; i < 64; i++) put(g, cx - 0.5 + r * Math.cos((i / 64) * TAU), cy - 0.5 + r * Math.sin((i / 64) * TAU), c)
}

// The core, with a small highlight up and to the left.
function core(g, { x = 16, y = 16, r = 6, color = C.core } = {}) {
  disc(g, x, y, r, color)
  disc(g, x - r * 0.35, y - r * 0.35, r * 0.35, C.light)
}

// Satellites on a tilted orbit: those behind the core (upper half of the
// ellipse) are drawn first and smaller, so the orbit reads as 3D.
function orbiting(g, angles, { rx = 12.5, ry = 4.5, cy = 16, coreOptions = {}, trail = 0, step = 0.4 } = {}) {
  const sat = (a, color, scale = 1) => {
    const depth = Math.sin(a)
    disc(g, 16 + rx * Math.cos(a), cy + ry * Math.sin(a), (1.95 + 0.3 * depth) * scale, color)
  }
  const behind = angles.filter(a => Math.sin(a) < 0)
  const front = angles.filter(a => Math.sin(a) >= 0)
  for (const a of behind) for (let t = trail; t >= 1; t--) sat(a - t * step, C.light, 0.7)
  for (const a of behind) sat(a, C.deep)
  core(g, { y: cy, ...coreOptions })
  for (const a of front) for (let t = trail; t >= 1; t--) sat(a - t * step, C.light, 0.7)
  for (const a of front) sat(a, C.deep)
  return g
}

const frames = (n, ms, draw) => Array.from({ length: n }, (_, i) => [draw(i / n, i), ms])

const PANE = {
  idle: frames(16, 110, t => orbiting(blank(), [t * TAU, t * TAU + Math.PI])),
  'idle:figure8': frames(16, 100, t => {
    const g = blank()
    const a = t * TAU
    const d = 1 + Math.sin(a) ** 2
    core(g)
    disc(g, 16 + (13 * Math.cos(a)) / d, 16 + (9 * Math.sin(a) * Math.cos(a)) / d, 2.1, C.deep)
    return g
  }),
  think: frames(12, 70, (t, i) =>
    orbiting(blank(), [0, 1, 2].map(k => t * TAU + (k * TAU) / 3), { rx: 7, ry: 12.5, coreOptions: { r: i % 6 < 3 ? 6 : 6.6 } }),
  ),
  // Both satellites sweep beneath the core like a scanner, then flick back.
  read: [
    ...frames(8, 90, t => {
      const g = blank()
      core(g, { y: 12 })
      const x = 7 + t * 18
      for (let k = 1; k <= 4; k++) put(g, x - 2 - k * 1.3, 25, C.light)
      disc(g, x, 25, 2, C.deep)
      disc(g, x - 5, 25, 1.6, C.deep)
      return g
    }),
    [(() => { const g = blank(); core(g, { y: 12 }); disc(g, 16, 25, 1.6, C.light); return g })(), 60],
  ],
  // A satellite draws a zigzag line beneath the core, holds it, then clears.
  write: (() => {
    const zig = Array.from({ length: 19 }, (_, i) => [7 + i, 26 + (i % 4 < 2 ? 0 : -2) + (i % 2 ? -1 : 0)])
    const out = []
    for (let n = 2; n <= zig.length; n += 2) {
      const g = blank()
      core(g, { y: 12 })
      zig.slice(0, n).forEach(([x, y]) => put(g, x, y, C.light))
      const [tx, ty] = zig[n - 1]
      disc(g, tx + 1, ty - 2, 2, C.deep)
      out.push([g, 80])
    }
    const done = blank()
    core(done, { y: 12 })
    zig.forEach(([x, y]) => put(done, x, y, C.light))
    out.push([done, 400])
    return out
  })(),
  run: frames(12, 50, t => orbiting(blank(), [t * TAU, t * TAU + Math.PI], { trail: 3, step: 0.35 })),
  // Tests: a row of boxes fills in one by one while the satellites orbit.
  'run.test': frames(6, 220, (t, i) => {
    const g = orbiting(blank(), [t * TAU, t * TAU + Math.PI], { cy: 12, ry: 4 })
    for (let k = 0; k < 5; k++) {
      const x = 7 + k * 4
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
        const edge = a !== 1 || b !== 1
        if (k < i) put(g, x + a, 25 + b, C.deep)
        else if (edge) put(g, x + a, 25 + b, C.light)
      }
    }
    return g
  }),
  // A burst: satellites shoot out in every direction and come home.
  happy: [8, 11, 13, 14, 0].map((r, i) => {
    const g = blank()
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6 + 0.3
      if (r) disc(g, 16 + r * Math.cos(a), 16 + r * Math.sin(a), i === 3 ? 1.5 : 2.1, i === 3 ? C.light : C.deep)
    }
    core(g, { r: i < 2 ? 7 : 6 })
    if (!r) orbiting(g, [0.4, 0.4 + Math.PI])
    return [g, [110, 110, 140, 160, 500][i]]
  }),
  // The satellites drop to the ground and the core sinks.
  sad: [
    [orbiting(blank(), [0.2, 0.2 + Math.PI]), 200],
    [(() => { const g = blank(); core(g, { y: 17 }); disc(g, 5, 22, 2, C.deep); disc(g, 27, 22, 2, C.deep); return g })(), 150],
    [(() => { const g = blank(); core(g, { y: 20, color: C.deep }); disc(g, 6, 27, 2, C.deep); disc(g, 26, 27, 2, C.deep); return g })(), 900],
    [(() => { const g = blank(); core(g, { y: 21, r: 5.6, color: C.deep }); disc(g, 6, 27, 2, C.deep); disc(g, 26, 27, 2, C.deep); return g })(), 900],
  ],
  // Resting: the core breathes, the satellites lie still, a bubble rises.
  sleep: [9, 7, 5, null].map((by, i) => {
    const g = blank()
    disc(g, 5, 24, 1.8, C.light)
    disc(g, 27, 24, 1.8, C.light)
    core(g, { y: 19, r: i % 2 ? 6.3 : 5.7 })
    if (by) disc(g, 22 + i, by + 1, 1.4, C.light)
    return [g, 900]
  }),
  // Waiting on you: sonar rings pulse out from the core.
  waiting: [9, 12, 15, 0].map((r, i) => {
    const g = blank()
    if (r) ring(g, 16, 16, r, i === 2 ? C.light : C.deep)
    core(g, { r: i === 0 ? 6.6 : 6 })
    return [g, [140, 140, 160, 700][i]]
  }),
}

// ---- The terminal sprite: 18×6, 1:2 pixels, one color ----
// A tall pixel is 1 wide by 2 tall, so the orbit's vertical radius is small.

const TW = 18
const TH = 6
const tPut = (g, x, y) => put(g, x, y, C.core)
function tCore(g, { dy = 0, big = false } = {}) {
  const [x0, x1] = big ? [6, 11] : [7, 10]
  for (let x = x0; x <= x1; x++) for (const y of [2 + dy, 3 + dy]) tPut(g, x, y)
}
function tOrbit(angles, { rx = 7.5, ry = 2.6, trail = 0, coreBig = false } = {}) {
  const g = blank(TW, TH)
  const at = a => [8.5 + rx * Math.cos(a) - 0.5, 2.5 + ry * Math.sin(a) - 0.5]
  for (const a of angles) if (Math.sin(a) < 0) for (let t = 0; t <= trail; t++) tPut(g, ...at(a - t * 0.45))
  tCore(g, { big: coreBig })
  for (const a of angles) if (Math.sin(a) >= 0) for (let t = 0; t <= trail; t++) tPut(g, ...at(a - t * 0.45))
  return g
}
const tFrames = (n, ms, draw) => Array.from({ length: n }, (_, i) => [draw(i / n, i), ms])

const TERMINAL = {
  idle: tFrames(16, 110, t => tOrbit([t * TAU, t * TAU + Math.PI])),
  'idle:figure8': tFrames(16, 100, t => {
    const g = blank(TW, TH)
    tCore(g)
    const a = t * TAU
    const d = 1 + Math.sin(a) ** 2
    tPut(g, 8 + (8.5 * Math.cos(a)) / d, 2.5 + (3.4 * Math.sin(a) * Math.cos(a)) / d - 0.5)
    return g
  }),
  think: tFrames(12, 70, (t, i) => tOrbit([0, 1, 2].map(k => t * TAU + (k * TAU) / 3), { rx: 4.5, ry: 3, coreBig: i % 6 >= 3 })),
  run: tFrames(12, 50, t => tOrbit([t * TAU, t * TAU + Math.PI], { trail: 2 })),
  'run.test': tFrames(6, 220, (t, i) => {
    const g = blank(TW, TH)
    for (let x = 7; x <= 10; x++) for (const y of [1, 2]) tPut(g, x, y)
    for (let k = 0; k < 5; k++) if (k < i) tPut(g, 4 + k * 2.5, 5)
    tPut(g, 8.5 + 7 * Math.cos(t * TAU) - 0.5, 1.5 + 1.5 * Math.sin(t * TAU) - 0.5)
    return g
  }),
  happy: [2, 4, 6, 0].map((r, i) => {
    const g = r ? blank(TW, TH) : tOrbit([0.4, 0.4 + Math.PI])
    if (r) {
      tCore(g, { big: i < 2 })
      for (let k = 0; k < 8; k++) {
        const a = (k * TAU) / 8 + 0.2
        tPut(g, 8.5 + r * 1.4 * Math.cos(a) - 0.5, 2.5 + (r / 2.2) * Math.sin(a) - 0.5)
      }
    }
    return [g, [110, 120, 150, 500][i]]
  }),
  sleep: [0, 1].map(i => {
    const g = blank(TW, TH)
    tCore(g, { dy: 1, big: i === 1 })
    tPut(g, 2, 5)
    tPut(g, 15, 5)
    return [g, 1100]
  }),
  waiting: [1, 2, 3, 0].map((r, i) => {
    const g = blank(TW, TH)
    tCore(g, { big: i === 0 })
    if (r) for (let k = 0; k < 12; k++) {
      const a = (k * TAU) / 12
      tPut(g, 8.5 + (2 + r * 2) * Math.cos(a) - 0.5, 2.5 + (1 + r * 0.6) * Math.sin(a) - 0.5)
    }
    return [g, [140, 140, 160, 700][i]]
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
        meta: { app: 'mascots/orbit/draw.mjs', image: `${name}.png`, format: 'RGBA8888', size: { w: png.width, h }, scale: '1', frameTags },
      },
      null,
      1,
    ),
  )
  console.log(`orbit: art/${name}.png, ${w}×${h}, ${all.length} frames, ${frameTags.length} tags`)
}

writeSheet('pane', W, H, PANE)
writeSheet('terminal', TW, TH, TERMINAL)
