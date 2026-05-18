// state-rw.mjs — atomic read/write helpers for `.agent-all-state.json`.
//
// Claude Code's `Write` tool is atomic at the FS layer; Cursor's chat surface
// doesn't promise atomicity, so the coordinator invokes this from `read_bash`
// to guarantee write-tmp-then-rename semantics.
//
// API:
//   readState(path)       → object (returns {} when file missing or unreadable)
//   writeState(path, obj) → writes JSON.stringify(obj, null, 2) atomically

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync, openSync, fsyncSync, closeSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function readState(path) {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (_e) {
    // Corrupt or unreadable — caller treats as empty (no partial state).
    return {};
  }
}

export function writeState(path, state) {
  const tmp = `${path}.tmp`;
  const body = JSON.stringify(state, null, 2) + "\n";
  writeFileSync(tmp, body);
  // fsync the file so the rename below is durable.
  const fd = openSync(tmp, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

export function clearTmp(path) {
  const tmp = `${path}.tmp`;
  if (existsSync(tmp)) {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
}

// CLI: `node lib/state-rw.mjs read <path>` | `... write <path> <json>`.
// realpathSync resolves macOS /var → /private/var symlinks so the URL match
// works under tmpdir-rooted installs.
function isMain() {
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
}
if (isMain()) {
  const [, , cmd, path, payload] = process.argv;
  if (cmd === "read" && path) {
    process.stdout.write(JSON.stringify(readState(path), null, 2) + "\n");
    process.exit(0);
  }
  if (cmd === "write" && path && payload !== undefined) {
    let obj;
    try { obj = JSON.parse(payload); }
    catch (e) { console.error(`invalid JSON payload: ${e.message}`); process.exit(2); }
    writeState(path, obj);
    process.exit(0);
  }
  console.error("usage: state-rw.mjs read <path>");
  console.error("       state-rw.mjs write <path> '<json>'");
  process.exit(2);
}
