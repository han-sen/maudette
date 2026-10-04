import { expect, test } from 'claude-code/testing'

import { rasterSize } from '../hooks/draw'
import { small, terminal } from '../hooks/sprites'

const BAND = {
  plugin: 'maudette',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 19, total: 0 },
    view: {},
  },
} as const

// The engine accepting a drawing for a surface doesn't mean that client draws
// it: the VS Code extension (2.1.287) never asks mods to draw.
for (const surface of ['desktop', 'vscode', 'mobile', 'terminal'] as const) {
  test(`the band above the prompt draws the mascot on ${surface}`, async $ => {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeDefined()
    await ui.unmount()
  })
}

// A default 80×24 terminal leaves the band 7 rows (measured in macOS Terminal).
test('the band fits the terminal sprite in a default-size terminal', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 7 } })
  const size = rasterSize(terminal)
  expect(size.rows).toBeLessThanOrEqual(6)
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject(size)
  await ui.unmount()
})

test('the band shows only the caption when the mascot does not fit', async $ => {
  const maxRows = rasterSize(terminal).rows - 1
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows } })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text' })).toBeDefined()
  await ui.unmount()
})

test('the band draws its sprite about 32px wide on desktop, by a whole number', async $ => {
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const scale = Math.max(1, Math.round(32 / small.width))
  expect((await ui.find({ type: 'Svg' }))?.props).toMatchObject({ width: small.width * scale, height: small.height * scale })
  await ui.unmount()
})
