import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bundled, parseMascot } from '../hooks/mascot'

const file = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 1,
    name: 'Pip',
    captions: { idle: '{name} naps' },
    sprites: { pane: bundled.sprite, terminal: bundled.terminal },
    ...changes,
  })

test('a mascot file loads, its missing row sprite falling back to the pane', async () => {
  const mascot = parseMascot(file())
  if (typeof mascot === 'string') throw new Error(mascot)
  expect(mascot.text.name).toBe('Pip')
  expect(mascot.small).toBe(mascot.sprite)
  expect(mascot.terminal.cells).toBe(bundled.terminal.cells)
})

test('a mascot file with only a pane sprite uses it everywhere', async () => {
  const mascot = parseMascot(file({ sprites: { pane: bundled.sprite } }))
  if (typeof mascot === 'string') throw new Error(mascot)
  expect(mascot.terminal).toBe(mascot.sprite)
})

test('a mascot file from another format version is refused', async () => {
  expect(parseMascot(file({ format: 2 }))).toContain('format 2')
})

test('a sprite with the wrong number of pixels is refused', async () => {
  const pane = { ...bundled.sprite, animations: { idle: [{ duration: 100, pixels: '..' }] } }
  expect(parseMascot(file({ sprites: { pane } }))).toContain('the pane sprite')
})

test('a sprite without idle is refused', async () => {
  const pane = { ...bundled.sprite, animations: { think: bundled.sprite.animations.idle } }
  expect(parseMascot(file({ sprites: { pane } }))).toContain('idle')
})

test('text that is not JSON is refused', async () => {
  expect(parseMascot('{')).toBe('not valid JSON')
})

// $.fs isn't available under the test runner, so a named mascot can't load here:
// the mascot must still be drawn, as the bundled mascot.
test('a mascot that cannot be loaded leaves the bundled mascot', { options: { mascot: 'nowhere' } }, async $ => {
  const ui = await $.ui.mount({
    plugin: 'maudette',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 20,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 19, total: 0 },
      view: {},
    },
  })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

// Toasts that session.start shows for the `mascot` setting.
async function startToasts($: Engine, on: On): Promise<string[]> {
  const toasts: string[] = []
  on('ui.toast', async (_$, e) => void toasts.push(e.text))
  on('env.get', async () => ({ value: '/nowhere' }) as never)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', interactive: true } as never)
  return toasts
}

test('a mascot that cannot be loaded says so in a toast', { options: { mascot: 'nowhere' } }, async ($, on) => {
  expect(await startToasts($, on)).toEqual([expect.stringContaining('no mascot "nowhere"')])
})

test('naming the bundled mascot shows it without a toast', { options: { mascot: 'Maudette' } }, async ($, on) => {
  expect(await startToasts($, on)).toEqual([])
})
