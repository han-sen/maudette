# Making a mascot

Mascots come in any style. The four in `mascots/` show the range: **Maudette** (a character, hand-drawn in Aseprite), **Bonsai** (a still life), **Nimbus** (an ambient weather scene) and **Orbit** (pure shapes and motion), the last three drawn in code as PNG sheets.

A mascot is a folder in `mascots/`: a `mascot.json` with its name and words, and the art for each place it appears. Maudette, in `mascots/maudette/`, is the example to copy.

## Quick start

1. Copy `mascots/maudette/` to `mascots/<your-mascot>/`.
2. Replace the art and edit `mascot.json` (below).
3. Build it and install it:

   ```bash
   MASCOT=<your-mascot> npm run mascot:install
   ```

   This exports the art, checks it, writes `mascots/<your-mascot>/<your-mascot>.mascot.json` and copies it to `~/.claude/mascots/`.

4. Set the plugin's **Mascot** option to `<your-mascot>`: in the config menu (`/config` in a terminal session), or in `~/.claude/settings.json` under `pluginConfigs` → `maudette` → `options` → `mascot`. The mod reloads and shows your mascot. Empty means Maudette.

If the file is missing or broken, the mod shows Maudette and a toast saying why.

**Sharing a mascot** is sharing that one `.mascot.json` file: anyone with the mod drops it into `~/.claude/mascots/` and sets the option. No Aseprite, no build.

**While drawing,** `MASCOT=<your-mascot> npm run update` is quicker: it builds your mascot into the mod itself, in place of Maudette, and sends it to the running session. Run `npm run update` without `MASCOT=` to go back. `npm run build` builds every mascot in `mascots/`, so `docs/preview.html` shows yours next to Maudette and the example mascots: every mood, on desktop and as a terminal draws it.

## `mascot.json`

```json
{
  "name": "Maudette",
  "sprites": {
    "pane": { "file": "art/maudette.aseprite" },
    "terminal": { "file": "art/maudette_terminal.aseprite", "pixels": "tall" }
  },
  "captions": {
    "idle": "Hanging out",
    "think": "Thinking…",
    "read": "Reading {detail}…",
    "read.search": "Searching {detail}…",
    "read.web": "Browsing…",
    "write": "Writing {detail}…",
    "run": "Running {detail}…",
    "run.test": "Running tests…",
    "happy": "Done!",
    "sad": "Hit a snag",
    "sleep": "Asleep",
    "waiting": "Waiting on you…"
  }
}
```

- **`name`:** shown in captions, the pane's title and the `/maudette` command. (The file name, `<your-mascot>.mascot.json`, comes from the folder's name instead: letters, digits, `-` and `_`.)
- **`sprites`:** the art for each place the mascot appears (next section). Only `pane` is required.
- **`captions`:** one line per mood, all optional. The convention matches Claude Code's own status text: a short verb phrase, with an ellipsis (`…`) for ongoing work ("Thinking…", "Reading draw.ts…") and none for states ("Done!", "Asleep"). The mascot is drawn right beside it, so its name isn't needed, but `{name}` is there if you want it ("{name} is thinking"). `{name}` is the mascot's name. `{detail}` is what Claude is working on: a file's name (`draw.ts`), a command's first word (`npm`), a search (`for "toSvg"`). When there's nothing, `{detail}` disappears with the space before it. A mood without a caption uses idle's.

## Where the mascot appears

| Sprite                | Where                                                         | Drawn at                            | Suggested size  |
| --------------------- | ------------------------------------------------------------- | ----------------------------------- | --------------- |
| `pane` (required)     | The side pane `/maudette` opens, on desktop and in a terminal | 4× on desktop                       | about 32×32     |
| `row` (optional)      | The row above the prompt on desktop                           | a whole-number scale near 32px wide | about 16×12     |
| `terminal` (optional) | The row above the prompt in a terminal                        | character cells (below)             | up to 12px tall |

**Where mascots can't appear (yet):** the VS Code extension's chat panel (checked on 2.1.287) loads and runs mods but never asks them to draw, so mascots don't show there. In VS Code, run Claude Code in the integrated terminal instead, where the `terminal` sprite works. The Claude mobile app doesn't draw them either, even for a session you follow from your phone.

A missing sprite uses the next one up: `terminal` → `row` → `pane`. So a mascot can be one sprite, used everywhere, or up to three. Maudette uses two: `pane`, also drawn at 1× in the desktop row, and a tiny `terminal` one.

Desktop draws real pixels, so any size works there; keep to whole-number scales, which the mod does for you. **A terminal is the hard constraint**, so read the next section before drawing a `terminal` sprite.

## Drawing for the terminal

A terminal can't draw pixels, only character cells, each about twice as tall as wide. The mod paints pixels with block characters, in one of two ways:

| `"pixels"`           | Pixels per cell                        | Pixel shape           | Good for                                                                       |
| -------------------- | -------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `"square"` (default) | 1 across × 2 down (`▀`)                | about square          | full-color art, but each pixel is a whole column wide, so sprites come out big |
| `"tall"`             | 2 across × 2 down (quadrants, `▘▝▖▗…`) | twice as tall as wide | small, crisp sprites like the Claude Code logo                                 |

**Height is the hard limit.** In a terminal, the row above the prompt gets at most half the window's height, the prompt included: **7 rows in a default 80×24 window**, fewer while a long prompt is being typed. Each row is 2 pixels, so **keep the `terminal` sprite at most 12px tall** (6 rows, one spare). Taller sprites only appear in tall windows; when the mascot doesn't fit, only its caption shows.

**With `"tall"` pixels:**

- Set **Pixel Aspect Ratio to 1:2** in your sprite editor (for Asperite: File → New → Advanced, or Sprite → Properties), so you see the proportions a terminal will.
- **Each 2×2 block is one cell, and a cell shows two colors at most, transparent counting as one.** So a block on the mascot's edge can use one of its colors; a block inside can use two. A third color is drawn as the nearer of the other two. The build lists every block that breaks this, and `docs/preview.html` shows the result. A 2×2 grid helps (View → Grid → Grid Settings).
- **One color is the easy path.** Draw features like eyes as transparent holes. Maudette's terminal sprite is one color, 18×6: 9 columns by 3 rows, about the size of the Claude Code logo.

**Expect small differences between terminals.** A cell's exact shape comes from the terminal's font and line spacing, so the same art can look a little narrower in one terminal and wider in another. Solid shapes survive this better than 1px details.

**Terminals known to draw block characters well:** iTerm2, Hyper, Ghostty, kitty, WezTerm, VS Code's terminal. **macOS Terminal on macOS 14** draws them at the font's size rather than filling the cell, which breaks the art up. I haven't tested whether newer macOS fixes this.

## Moods

| Mood      | When                                                               |
| --------- | ------------------------------------------------------------------ |
| `idle`    | Nothing happening. **Required:** every other mood falls back to it |
| `think`   | A turn starts, and between tool calls                              |
| `read`    | Reading or searching: Read, Grep, Glob, WebFetch, WebSearch        |
| `write`   | Editing: Edit, Write, NotebookEdit                                 |
| `run`     | Running a command: Bash                                            |
| `happy`   | A turn finishes (for 4 seconds)                                    |
| `sad`     | A tool fails                                                       |
| `sleep`   | 5 minutes without activity; typing in the prompt wakes the mascot  |
| `waiting` | Claude asks a question (AskUserQuestion), until it's answered      |

Each mood is an **animation tag** with that exact name. A mood without a tag shows `idle`, so you can start with `idle` alone and add moods one at a time. Easy ones to test next: `think` (any prompt triggers it, for the whole turn) and `happy` (the end of every turn). `read`, `write` and `run` often last under a second.

### Extras: variants and sub-moods

Both are optional: a mascot without them works the same.

- **Variants:** more than one animation for a mood, one picked at random each time the mood starts. Name the tags `<mood>:<anything>`: `idle`, `idle:yawn` and `idle:stretch` are three idles. Most worth it for `idle`, which people see most.
- **Sub-moods:** a finer version of a mood, used only if the mascot draws it, otherwise the mascot shows the parent mood. Name the tag (and, if you like, the caption) after the sub-mood:

  | Sub-mood      | Parent | When                                                                                   |
  | ------------- | ------ | -------------------------------------------------------------------------------------- |
  | `run.test`    | `run`  | Bash runs tests: `npm test`, `vitest`, `pytest`, `cargo test`, `go test`, `make test`… |
  | `run.git`     | `run`  | Bash runs `git`                                                                        |
  | `read.web`    | `read` | WebFetch, WebSearch                                                                    |
  | `read.search` | `read` | Grep, Glob                                                                             |

  A sub-mood can have variants too (`run.test:sweat`). A sub-mood without a caption uses its parent's.

Orbit, in `mascots/orbit/`, uses both: `idle:figure8` and `run.test`. It's also an example of a mascot that isn't a character at all, just shapes and motion. Try it with `MASCOT=orbit npm run update` (then `npm run update` to go back to Maudette).

**Animation:** each frame's duration and each tag's direction (forward, reverse, ping-pong) come from your file. At small sizes, motion tells moods apart more than detail does: an ear flick, a hop, a tail swish. Uneven timing (long holds, quick in-betweens) feels more natural than every frame at the same speed.

## Art formats

A sprite's `file` can be:

- **An `.aseprite` file.** Exported for you with the Aseprite CLI, found on PATH, in `/Applications`, in Steam's folder, or wherever `ASEPRITE` points.
- **A `.png` sprite sheet with a `.json` beside it,** same name. The JSON is Aseprite's sheet format (array or hash), and must include frame tags: in Aseprite's Export Sprite Sheet, check Tags under Meta. Other tools that write this format work too. No Aseprite needed to build.
- **A `.png` alone:** one still frame, used as `idle`. The quickest way to try a mascot.

**Colors:** up to 62 per sprite. Pixels under half opacity are transparent, so avoid soft edges. The mascot sits on the app's light or dark background, so pick colors that read on both: mid-tones are safest, and a dark outline helps on light backgrounds.

## Checking your mascot

`npm run update` stops on mistakes (missing files, no `idle` tag, a bad `mascot.json`) and warns about the rest:

- moods without a tag, which will show `idle`
- tags or captions for moods the mod doesn't know
- terminal cells with more than two colors, with frame and position

Then look at `docs/preview.html`, and at the real thing: the row above the prompt in the desktop app, and `npm run dev` in a terminal, in a **default-size window**.
