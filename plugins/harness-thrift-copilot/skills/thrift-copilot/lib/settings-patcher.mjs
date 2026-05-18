// Append-only patcher for Copilot's .github/hooks/*.json hook directory.
//
// Copilot CLI's hook convention (per
// plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/)
// uses ONE JSON file per event under .github/hooks/, with shape:
//
//   { "hooks": [{ "matcher": "...", "command": "..." }, ...] }
//
// Contract:
//   patchHooks({hooksDir, hooksToAdd, dryRun}) → {applied, skipped, files}
//     hooksToAdd: { [eventName]: [{matcher?, command}, ...] }
//       eventName is the camelCase Copilot convention used as the
//       filename: preToolUse → .github/hooks/thrift-preToolUse.json
//   - For each event, reads (or creates) .github/hooks/thrift-<event>.json.
//   - Appends new entries (never inserts at head; never modifies existing).
//   - Skips entries whose `command` is already present in the file.
//   - Writes back atomically (tmp + rename).
//
//   unpatchHooks({hooksDir, sentinel, dryRun}) → {removed, files}
//   - For each .github/hooks/thrift-*.json file:
//     - Removes any hook whose command matches `sentinel` (regex).
//     - If the file becomes empty, deletes the file entirely.
//   - Default sentinel: /thrift-.*\.m?js/
//   - Safe to run multiple times.
//
// > TODO: verify Copilot ask_user / store_memory schemas against live
//   CLI — and verify the exact event-name casing (camelCase assumed:
//   preToolUse, postToolUse, sessionStart, agentStop). If a future
//   Copilot release uses snake_case, swap the filename convention.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

const DEFAULT_SENTINEL = /thrift-.*\.m?js/;
const FILE_PREFIX = "thrift-";
const FILE_SUFFIX = ".json";

function hookFilePath(hooksDir, eventName) {
  return resolvePath(hooksDir, `${FILE_PREFIX}${eventName}${FILE_SUFFIX}`);
}

function readHookFile(path) {
  if (!existsSync(path)) return { hooks: [] };
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(`cannot read ${path}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`cannot parse ${path} — refusing to patch`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`cannot parse ${path} — refusing to patch (not an object)`);
  }
  if (!Array.isArray(parsed.hooks)) parsed.hooks = [];
  return parsed;
}

function atomicWrite(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function entryCommand(entry) {
  return entry?.command ?? null;
}

function alreadyRegistered(existingHooks, newEntry) {
  const newCmd = entryCommand(newEntry);
  if (!newCmd) return false;
  return existingHooks.some((h) => entryCommand(h) === newCmd);
}

export function patchHooks({ hooksDir, hooksToAdd, dryRun = false }) {
  let applied = 0;
  let skipped = 0;
  const files = [];

  for (const [eventName, entries] of Object.entries(hooksToAdd)) {
    const fp = hookFilePath(hooksDir, eventName);
    const file = readHookFile(fp);
    let touched = false;

    for (const entry of entries) {
      if (alreadyRegistered(file.hooks, entry)) {
        skipped++;
        continue;
      }
      file.hooks.push(entry);
      applied++;
      touched = true;
    }

    if (touched && !dryRun) {
      atomicWrite(fp, JSON.stringify(file, null, 2) + "\n");
    }
    files.push({ event: eventName, path: fp, hookCount: file.hooks.length, touched });
  }

  return { applied, skipped, files };
}

export function unpatchHooks({ hooksDir, sentinel = DEFAULT_SENTINEL, dryRun = false }) {
  let removed = 0;
  const files = [];

  if (!existsSync(hooksDir)) {
    return { removed: 0, files: [] };
  }

  const candidates = readdirSync(hooksDir)
    .filter((n) => n.startsWith(FILE_PREFIX) && n.endsWith(FILE_SUFFIX))
    .map((n) => resolvePath(hooksDir, n));

  for (const fp of candidates) {
    let file;
    try {
      file = readHookFile(fp);
    } catch {
      // Unparseable — leave alone, don't double-fault on unpatch.
      continue;
    }
    const before = file.hooks.length;
    file.hooks = file.hooks.filter((h) => {
      const cmd = entryCommand(h);
      const matched = cmd && sentinel.test(cmd);
      if (matched) removed++;
      return !matched;
    });
    const changed = file.hooks.length !== before;

    if (!dryRun && changed) {
      if (file.hooks.length === 0) {
        try { unlinkSync(fp); } catch { /* non-fatal */ }
        files.push({ path: fp, deleted: true });
      } else {
        atomicWrite(fp, JSON.stringify(file, null, 2) + "\n");
        files.push({ path: fp, deleted: false, hookCount: file.hooks.length });
      }
    } else if (changed) {
      files.push({ path: fp, deleted: file.hooks.length === 0, hookCount: file.hooks.length, dryRun: true });
    }
  }

  return { removed, files };
}

// Convenience helper: build the standard thrift-copilot hooks object given
// the scripts-dir path (where the actual .mjs scripts live). The returned
// object maps Copilot event names (camelCase) to entry arrays.
export function buildStandardThriftHooks({ hooksScriptsDir }) {
  const cmd = (name) => `node "${hooksScriptsDir}/${name}.mjs"`;
  return {
    preToolUse: [
      { matcher: "read_bash", command: cmd("thrift-pretool-bash-telemetry") },
      { matcher: "read_file", command: cmd("thrift-pretool-read-coerce") },
    ],
    postToolUse: [
      { command: cmd("thrift-posttool-summariser-trigger") },
    ],
    sessionStart: [
      { command: cmd("thrift-sessionstart-cache-prime") },
    ],
    agentStop: [
      { command: cmd("thrift-agentstop-audit") },
    ],
  };
}
