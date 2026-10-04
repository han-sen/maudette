// Writes docs/preview.html: every mascot in mascots/, each mood animated with
// the same SVG the desktop app draws and the cells a terminal draws. Handy for
// checking art without opening Claude Code. Reads the compiled
// <name>.mascot.json files, so run `npm run build` first to bring them up to date.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import ts from "typescript";

import { name as bundled } from "./mascot-config.mjs";

const dir = "node_modules/.cache/maudette";
mkdirSync(dir, { recursive: true });
const source = readFileSync("mod/hooks/draw.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
writeFileSync(`${dir}/draw.mjs`, outputText);
const { QUADRANTS, framesFor, rasterSize, toCells, toSvg } = await import(
  `../${dir}/draw.mjs`
);

// The bundled mascot first, then the rest alphabetically. A missing sprite
// falls back as in the mod: terminal → row → pane.
const mascots = readdirSync("mascots")
  .filter((name) => existsSync(`mascots/${name}/${name}.mascot.json`))
  .sort((a, b) => (a === bundled ? -1 : b === bundled ? 1 : a.localeCompare(b)))
  .map((id) => {
    const { name, sprites } = JSON.parse(
      readFileSync(`mascots/${id}/${id}.mascot.json`, "utf8"),
    );
    const sprite = sprites.pane;
    const small = sprites.row ?? sprite;
    return { id, name, sprite, small, terminal: sprites.terminal ?? small };
  });
if (!mascots.length)
  throw new Error("no compiled mascots: run `npm run build` first");

// A mascot's sections list the same moods in the same order, so a mood sits
// in the same column in each: the core moods in trigger order, each followed
// by its sub-moods and variants. A mood a sprite doesn't draw shows what it
// falls back to (its parent for a sub-mood, else idle), labelled so.
const ORDER = [
  "idle",
  "think",
  "read",
  "write",
  "run",
  "happy",
  "sad",
  "sleep",
  "waiting",
];
const baseOf = (tag) => tag.split(":")[0].split(".")[0];
const rank = (tag) => [
  ORDER.indexOf(baseOf(tag)) === -1 ? ORDER.length : ORDER.indexOf(baseOf(tag)),
  tag,
];
const moodsOf = (sprites) =>
  [...new Set(sprites.flatMap((s) => Object.keys(s.animations)))].sort(
    (a, b) => {
      const [ra, ta] = rank(a);
      const [rb, tb] = rank(b);
      return ra - rb || ta.localeCompare(tb);
    },
  );
const shownFor = (s, mood) => {
  if (s.animations[mood]) return mood;
  const parent = mood.split(":")[0];
  if (s.animations[parent]) return parent;
  const core = baseOf(mood);
  return s.animations[core] ? core : "idle";
};
const label = (mood, shown) =>
  shown === mood ? mood : `${mood} <span class="fallback">→ ${shown}</span>`;

// Each sprite at the size it's drawn on desktop: the pane at 4×, the row above
// the prompt at about 32px wide.
const cards = (s, scale, moods) =>
  moods
    .map((mood) => {
      const shown = shownFor(s, mood);
      const svg = toSvg(s, framesFor(s, shown)).replace(
        "<svg ",
        `<svg width="${s.width * scale}" height="${s.height * scale}" `,
      );
      return `<figure>${svg}<figcaption>${label(mood, shown)}</figcaption></figure>`;
    })
    .join("\n");

// What a terminal shows: each frame goes through toCells, the code the
// terminal surface draws, and the cells are turned back into pixels. So the
// 2-colors-per-cell limit shows here as it does in a terminal.
const DEFAULT = 0x01000000;
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

function fromCells(s, frame) {
  const { columns, rows } = rasterSize(s);
  const words = new Uint32Array(
    Uint8Array.from(Buffer.from(toCells(s, frame), "base64")).buffer,
  );
  const across = s.cells === "quad" ? 2 : 1;
  const grid = Array.from({ length: rows * 2 }, () =>
    Array(columns * across).fill(null),
  );
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const [glyph, fg, bg] = words.subarray(
        (row * columns + column) * 3,
        (row * columns + column) * 3 + 3,
      );
      const color = (on) => {
        const c = on ? fg : bg;
        return c === DEFAULT ? null : hex(c);
      };
      const quadMask = Math.max(0, QUADRANTS.indexOf(glyph));
      // Half mode: ▀ is the top half, ▄ the bottom; a quadrant glyph covers both.
      const mask =
        across === 2
          ? quadMask
          : glyph === 0x2580
            ? 0b0011
            : glyph === 0x2584
              ? 0b1100
              : 0;
      for (let i = 0; i < 4; i++) {
        const [dx, dy] = [i % 2, i >> 1];
        if (dx >= across) continue;
        const bit = across === 2 ? i : dy * 2;
        grid[row * 2 + dy][column * across + dx] = color(mask & (1 << bit));
      }
    }
  }
  const palette = [...new Set(grid.flat().filter(Boolean))];
  const keys = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pixels = grid
    .slice(0, s.height)
    .map((line) =>
      line
        .slice(0, s.width)
        .map((c) => (c ? keys[palette.indexOf(c)] : "."))
        .join(""),
    )
    .join("");
  return { palette, pixels, duration: frame.duration };
}

// Tall pixels for quadrant cells (1:2), square for half-blocks: about a
// terminal cell's shape, though each terminal's font shifts it a little.
const terminalCards = (s, moods) =>
  moods
    .map((mood) => {
      const shown = shownFor(s, mood);
      const frames = framesFor(s, shown).map((f) => fromCells(s, f));
      const palette = [...new Set(frames.flatMap((f) => f.palette))];
      const keys =
        "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const remap = (f) =>
        [...f.pixels]
          .map((k) =>
            k === "." ? "." : keys[palette.indexOf(f.palette[keys.indexOf(k)])],
          )
          .join("");
      const flat = {
        width: s.width,
        height: s.height,
        palette,
        animations: {},
      };
      const svg = toSvg(
        flat,
        frames.map((f) => ({ duration: f.duration, pixels: remap(f) })),
      );
      const [w, h] = s.cells === "quad" ? [6, 12] : [8, 8];
      return `<figure>${svg.replace("<svg ", `<svg width="${s.width * w}" height="${s.height * h}" preserveAspectRatio="none" `)}<figcaption>${label(mood, shown)}</figcaption></figure>`;
    })
    .join("\n");

const bandScale = (small) => Math.max(1, Math.round(32 / small.width));
const section = ({ id, name, sprite, small, terminal }) => {
  const moods = moodsOf([sprite, small, terminal]);
  return `<section id="${id}">
<h2>${name}${id === bundled ? ' <span class="note">bundled</span>' : ""}</h2>
<h3>Pane (large, 4×)</h3>
<article>${cards(sprite, 4, moods)}</article>
<h3>Above the prompt (small, ${bandScale(small)}×)</h3>
<article>${cards(small, bandScale(small), moods)}</article>
<h3>Terminal (${terminal.cells === "quad" ? "quadrant cells, 1:2 pixels" : "half-block cells"}, as the terminal draws it)</h3>
<article class="terminal">${terminalCards(terminal, moods)}</article>
</section>`;
};

writeFileSync(
  "docs/preview.html",
  `<!doctype html><meta charset="utf-8"><title>Mascots: moods</title>
<style>
  body { margin: 0; padding: 32px; font: 14px ui-monospace, monospace; background: #f4efe6; color: #2b1f33 }
  @media (prefers-color-scheme: dark) { body { background: #1d1a20; color: #e8e2d8 } }
  a { color: inherit }
  nav { display: flex; gap: 16px; margin-bottom: 8px }
  section + section { margin-top: 64px }
  .note { font-size: 12px; font-weight: normal; opacity: 0.5 }
  /* Every section is the same panel, so the grids get the same width and the
     same number of columns, and each mood lines up across sections. */
  article { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 24px; align-items: end;
         padding: 24px; border-radius: 8px; background: #ebe3d6 }
  @media (prefers-color-scheme: dark) { main { background: #27232b } }
  figure { margin: 0; text-align: center }
  figcaption { margin-top: 8px }
  .fallback { opacity: 0.5 }
  svg { image-rendering: pixelated }
  h2 { font-size: 14px; margin: 32px 0 16px }
  article.terminal { background: #16161c; color: #c9c5bd }
</style>
<nav>${mascots.map((m) => `<a href="#${m.id}">${m.name}</a>`).join("")}</nav>
${mascots.map(section).join("\n")}`,
);
console.log(
  `preview: docs/preview.html (${mascots.map((m) => m.name).join(", ")})`,
);
