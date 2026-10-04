// Which mood each thing Claude does puts the mascot in, and the caption it
// shows. Pure: no `$`.
import type { CoreMood, Mood, SubMood } from '../types'
import type { Sprite } from './draw'

export const SLEEP_AFTER_MS = 5 * 60_000
export const HAPPY_FOR_MS = 4_000

export const CORE_MOODS: readonly CoreMood[] = ['idle', 'think', 'read', 'write', 'run', 'happy', 'sad', 'sleep', 'waiting']
export const SUB_MOODS: Readonly<Record<SubMood, CoreMood>> = {
  'run.test': 'run',
  'run.git': 'run',
  'read.web': 'read',
  'read.search': 'read',
}

const TOOL_MOODS: Record<string, Mood> = {
  Read: 'read',
  Grep: 'read.search',
  Glob: 'read.search',
  WebFetch: 'read.web',
  WebSearch: 'read.web',
  Edit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Bash: 'run',
  AskUserQuestion: 'waiting',
}

// Commands that run tests: a test runner, or a package manager's or build
// tool's test command, at the start of the command.
const TEST_COMMAND =
  /^(npx\s+|bunx\s+)?(jest|vitest|mocha|ava|rspec|pytest|phpunit)\b|^python3?\s+-m\s+(pytest|unittest)\b|^(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|^(cargo|go|deno|dotnet|mix|swift)\s+test\b|^make\s+(test|check)\b/

export function moodForTool(tool: string, input: Record<string, unknown> = {}): Mood {
  if (tool === 'Bash' && typeof input.command === 'string') {
    const command = input.command.trim()
    if (TEST_COMMAND.test(command)) return 'run.test'
    if (/^git\b/.test(command)) return 'run.git'
  }
  return TOOL_MOODS[tool] ?? 'think'
}

// The mood itself, then its parent, then idle: what a mascot without art or a
// caption for a mood shows instead.
export function moodChain(mood: Mood): Mood[] {
  const parent = (SUB_MOODS as Record<string, CoreMood>)[mood]
  return [...new Set<Mood>([mood, ...(parent ? [parent] : []), 'idle'])]
}

// The animation (tag) to play for a mood: the first in its chain the sprite
// draws, and among that one's variants (`idle`, `idle:yawn`, `idle:stretch`)
// the one `roll` (0 to 1, drawn when the mood starts) picks.
export function animationFor(sprite: Sprite, mood: Mood, roll: number): string {
  for (const name of moodChain(mood)) {
    const options = Object.keys(sprite.animations)
      .filter(tag => tag === name || tag.startsWith(`${name}:`))
      .sort()
    if (options.length) return options[Math.min(options.length - 1, Math.floor(roll * options.length))] ?? name
  }
  return 'idle'
}

// A mascot's words, from its mascot.json: its name and a caption template per
// mood. `{name}` is the name; `{detail}` is the subject (a file's name, a
// command), removed with the space before it when empty. A mood without a
// caption uses its parent's (for a sub-mood), else idle's.
export type MascotText = {
  name: string
  captions: Partial<Record<Mood, string>>
}

export function caption(mascot: MascotText, mood: Mood, detail: string): string {
  const template = moodChain(mood).map(m => mascot.captions[m]).find(c => c !== undefined) ?? '{name}'
  // Functions, not strings, as replacements: a `$` in a command or file name
  // would otherwise be read as a replacement pattern.
  return template
    .replace(/\{name\}/g, () => mascot.name)
    .replace(/ ?\{detail\}/g, () => (detail ? ` ${detail}` : ''))
    .trim()
}

// A short subject for the caption: a file's name, a command's first word.
export function detailForCall(input: Record<string, unknown>): string {
  const path = input.file_path ?? input.notebook_path ?? input.path
  if (typeof path === 'string') return path.split('/').pop() ?? ''
  if (typeof input.command === 'string') return input.command.trim().split(/\s+/)[0] ?? ''
  if (typeof input.pattern === 'string') return `for "${input.pattern.slice(0, 24)}"`
  return ''
}
