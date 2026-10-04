// Builds every mascot in mascots/: exports its art and compiles its
// <name>.mascot.json (which docs/preview.html shows). One of them, MASCOT or
// maudette, is also bundled into the mod as mod/hooks/sprites.ts.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'

import { name as bundled } from './mascot-config.mjs'

const names = readdirSync('mascots').filter(name => existsSync(`mascots/${name}/mascot.json`))
if (!names.includes(bundled)) throw new Error(`mascots/${bundled}/mascot.json is missing`)

for (const name of [bundled, ...names.filter(n => n !== bundled).sort()]) {
  console.log(`— ${name}${name === bundled ? ' (bundled into the mod)' : ''}`)
  const env = { ...process.env, MASCOT: name }
  for (const args of [['build/export.mjs'], ['build/sprites.mjs', ...(name === bundled ? [] : ['--compile-only'])]]) {
    const { status } = spawnSync('node', args, { stdio: 'inherit', env })
    if (status !== 0) process.exit(status ?? 1)
  }
}

// The other mascots ship with the plugin in mod/mascots/, so the `mascot`
// option can name one with nothing to install.
mkdirSync('mod/mascots', { recursive: true })
for (const file of readdirSync('mod/mascots')) rmSync(`mod/mascots/${file}`)
for (const name of names.filter(n => n !== bundled)) {
  copyFileSync(`mascots/${name}/${name}.mascot.json`, `mod/mascots/${name}.mascot.json`)
}
console.log(`— shipped with the plugin: ${names.filter(n => n !== bundled).sort().join(', ')}`)
