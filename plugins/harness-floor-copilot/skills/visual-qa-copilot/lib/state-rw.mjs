// state-rw — atomic read/write helpers for `.visual-qa-state.json`.
//
// Atomic write pattern: serialize to `<path>.tmp`, fsync, then rename.
// rename(2) is atomic on POSIX within the same filesystem, so observers
// either see the old or new state — never a torn write.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, fsyncSync, openSync, closeSync } from "node:fs";
import { dirname } from "node:path";

export function readState(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`state file is not valid JSON: ${path} — ${e.message}`);
  }
}

export function writeStateAtomic(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const data = JSON.stringify(state, null, 2);
  writeFileSync(tmp, data);
  // Best-effort fsync; on some filesystems opening for sync isn't possible.
  try {
    const fd = openSync(tmp, "r+");
    fsyncSync(fd);
    closeSync(fd);
  } catch {}
  renameSync(tmp, path);
  return path;
}

export function mergeState(prev, patch) {
  if (!prev) return patch;
  return { ...prev, ...patch };
}
