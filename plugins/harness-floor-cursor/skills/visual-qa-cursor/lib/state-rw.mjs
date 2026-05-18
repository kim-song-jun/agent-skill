// state-rw.mjs — atomic read/write helpers for `.visual-qa-state.json`.
//
// Same pattern as agent-all-cursor's state-rw.mjs (see that file for the
// Cursor-vs-Claude-Code rationale). Kept separate so the visual-qa skill is
// installable without the agent-all kit.

import { readFileSync, writeFileSync, existsSync, renameSync, openSync, fsyncSync, closeSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function isMain() {
  try { return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; }
  catch { return false; }
}

function statePath(slugDir) {
  // slugDir may itself be the state file path (callers vary). If it ends
  // with `.json`, treat as full path; otherwise append default name.
  if (slugDir.endsWith(".json")) return slugDir;
  return resolve(slugDir, ".visual-qa-state.json");
}

export function readState(slugDir) {
  const path = statePath(slugDir);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (_e) {
    return {};
  }
}

export function writeState(slugDir, state) {
  const path = statePath(slugDir);
  const tmp = `${path}.tmp`;
  const body = JSON.stringify(state, null, 2) + "\n";
  writeFileSync(tmp, body);
  const fd = openSync(tmp, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, path);
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
