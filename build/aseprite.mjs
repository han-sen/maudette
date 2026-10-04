// Finds the Aseprite CLI: $ASEPRITE when set, else `aseprite` from PATH, else
// the standalone or Steam app on macOS. Run as a script, it runs Aseprite with
// the given arguments.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const apps = [
  '/Applications/Aseprite.app',
  join(homedir(), 'Applications/Aseprite.app'),
  join(homedir(), 'Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app'),
].map(app => join(app, 'Contents/MacOS/aseprite'))

export function findAseprite() {
  const onPath = spawnSync('which', ['aseprite'], { encoding: 'utf8' }).stdout.trim()
  return process.env.ASEPRITE || onPath || apps.find(existsSync)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bin = findAseprite()
  if (!bin) {
    console.error('No Aseprite found: install it, or set ASEPRITE to its binary.')
    process.exit(1)
  }
  const { status } = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' })
  process.exit(status ?? 1)
}
