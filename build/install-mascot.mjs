// Copies the compiled mascot (<mascot>/<mascot>.mascot.json, from build/sprites.mjs) to
// ~/.claude/mascots/, where the mod loads it at run time when its `mascot` setting
// names it.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { dir, name } from './mascot-config.mjs'

const source = `${dir}/${name}.mascot.json`
if (!existsSync(source)) throw new Error(`${source} is missing: build the mascot first`)
const target = join(homedir(), '.claude', 'mascots', `${name}.mascot.json`)
mkdirSync(join(homedir(), '.claude', 'mascots'), { recursive: true })
copyFileSync(source, target)
console.log(`install: ${source} → ${target}`)
console.log(`Set the maudette plugin's "mascot" option to "${name}" to show it.`)
