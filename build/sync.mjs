// Copies mod/ into the hot-reload folder of a Claude Code session, so the
// running Maudette picks up the change. The target is MAUDETTE_MOD_DIR when
// set, else the most recently used ~/.claude/dev-mods/<session>/maudette.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

function latestSessionCopy() {
  const root = join(homedir(), ".claude/dev-mods");
  if (!existsSync(root)) return undefined;
  return readdirSync(root)
    .map((session) => join(root, session, "maudette"))
    .filter((dir) => existsSync(dir))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const target = process.env.MAUDETTE_MOD_DIR || latestSessionCopy();
if (!target) {
  console.error(
    "No session has Maudette loaded yet. Ask Claude Code to load them with hot reloading once,\n" +
      "or set MAUDETTE_MOD_DIR to the folder to copy into.",
  );
  process.exit(1);
}

// The engine writes its own tsconfig.json and .claude-plugin/types there; tests stay here.
const skip = /(^|\/)(tsconfig\.json|\.claude|tests)(\/|$)/;

// Copies only files whose content differs: the engine reloads the plugin when
// a file's modified time changes, so rewriting unchanged files (plugin.json
// above all) would reload it, resetting the mascot's mood, after every sync.
function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (skip.test(relative("mod", path))) continue;
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const changed = [];
for (const source of files("mod")) {
  const dest = join(target, relative("mod", source));
  if (existsSync(dest) && readFileSync(dest).equals(readFileSync(source))) continue;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  changed.push(relative("mod", source));
}
console.log(changed.length ? `sync: ${changed.join(", ")} → ${target}` : `sync: ${target} is up to date`);
