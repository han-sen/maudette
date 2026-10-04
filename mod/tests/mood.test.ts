import { expect, test } from 'claude-code/testing'

import { animationFor, caption, detailForCall, moodForTool } from '../hooks/mood'
import type { Sprite } from '../hooks/draw'
import type { MascotText } from '../hooks/mood'

const mascot: MascotText = {
  name: 'Pip',
  captions: { idle: '{name} is lounging', read: '{name} is reading {detail}' },
}

test('a caption fills in the name and the detail', async () => {
  expect(caption(mascot, 'read', 'draw.ts')).toBe('Pip is reading draw.ts')
})

test('an empty detail is removed with its space', async () => {
  expect(caption(mascot, 'read', '')).toBe('Pip is reading')
})

test("a mood without a caption uses idle's", async () => {
  expect(caption(mascot, 'sleep', '')).toBe('Pip is lounging')
})

test('a $ in the detail is shown as is', async () => {
  expect(caption(mascot, 'read', 'cost$`.ts')).toBe('Pip is reading cost$`.ts')
})

test("a sub-mood without a caption uses its parent's", async () => {
  expect(caption(mascot, 'read.web', 'example.com')).toBe('Pip is reading example.com')
})

test('a question waits on the person', async () => {
  expect(moodForTool('AskUserQuestion', { questions: [] })).toBe('waiting')
})

test('test commands, git and searches get their sub-moods', async () => {
  expect(moodForTool('Bash', { command: 'npm test' })).toBe('run.test')
  expect(moodForTool('Bash', { command: 'npx vitest run' })).toBe('run.test')
  expect(moodForTool('Bash', { command: 'cargo test --all' })).toBe('run.test')
  expect(moodForTool('Bash', { command: 'git status' })).toBe('run.git')
  expect(moodForTool('Bash', { command: 'ls -la' })).toBe('run')
  expect(moodForTool('Bash', { command: 'echo npm test' })).toBe('run')
  expect(moodForTool('Grep')).toBe('read.search')
  expect(moodForTool('WebSearch')).toBe('read.web')
  expect(moodForTool('Agent')).toBe('think')
})

const frame = { duration: 100, pixels: '.' }
const drawn = (...tags: string[]): Sprite => ({
  width: 1,
  height: 1,
  palette: [],
  animations: Object.fromEntries(tags.map(tag => [tag, [frame]])),
})

test('a sub-mood plays its own animation, else its parent, else idle', async () => {
  expect(animationFor(drawn('idle', 'run', 'run.test'), 'run.test', 0)).toBe('run.test')
  expect(animationFor(drawn('idle', 'run'), 'run.test', 0)).toBe('run')
  expect(animationFor(drawn('idle'), 'run.test', 0)).toBe('idle')
})

test('the roll picks among a mood and its variants', async () => {
  const sprite = drawn('idle', 'idle:yawn', 'idle:stretch', 'run')
  const picks = [0, 0.4, 0.9].map(roll => animationFor(sprite, 'idle', roll))
  expect(picks).toEqual(['idle', 'idle:stretch', 'idle:yawn'])
  expect(animationFor(sprite, 'run', 0.9)).toBe('run')
})

test("a caption's detail is a file's name, a command's first word, or a search", async () => {
  expect(detailForCall({ file_path: '/repo/mod/hooks/draw.ts' })).toBe('draw.ts')
  expect(detailForCall({ command: '  npm run build' })).toBe('npm')
  expect(detailForCall({ pattern: 'toSvg' })).toBe('for "toSvg"')
})

test('the default captions read like Claude Code: "Thinking…", "Running npm…"', async () => {
  const short: MascotText = { name: 'Pip', captions: { think: 'Thinking…', run: 'Running {detail}…' } }
  expect(caption(short, 'think', '')).toBe('Thinking…')
  expect(caption(short, 'run', 'npm')).toBe('Running npm…')
  expect(caption(short, 'run', '')).toBe('Running…')
  expect(caption(short, 'run.git', 'git')).toBe('Running git…')
})
