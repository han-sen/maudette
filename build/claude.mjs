// Runs the Claude Code CLI with the given arguments: `claude` from PATH when
// installed, else the copy the desktop app ships (its newest version).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function bundled() {
  const root = join(homedir(), 'Library/Application Support/Claude/claude-code')
  if (!existsSync(root)) return undefined
  const versions = readdirSync(root)
    .filter(v => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .reverse()
  for (const version of versions) {
    for (const build of readdirSync(join(root, version))) {
      const bin = join(root, version, build, 'claude.app/Contents/MacOS/claude')
      if (existsSync(bin)) return bin
    }
  }
  return undefined
}

const onPath = spawnSync('which', ['claude'], { encoding: 'utf8' }).stdout.trim()
const bin = onPath || bundled()
if (!bin) {
  console.error('No Claude Code CLI found: install `claude`, or open the desktop app once.')
  process.exit(1)
}

const { status } = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' })
process.exit(status ?? 1)
