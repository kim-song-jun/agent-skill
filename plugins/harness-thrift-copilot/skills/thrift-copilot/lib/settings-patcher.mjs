// Append-only patcher for Copilot's .github/hooks/*.json hook directory.
//
// Copilot CLI's hook convention (per
// plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/)
// uses ONE JSON file per event under .github/hooks/, with shape:
//
//   { "version": 1, "hooks": { "preToolUse": [{ "type": "command", ... }] } }
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
// Event names are Copilot's camelCase hook names. PascalCase files are not
// used because that switches payloads to VS Code-compatible field names.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

const DEFAULT_SENTINEL = /thrift-.*\.m?js/;
const FILE_PREFIX = "thrift-";
const FILE_SUFFIX = ".json";

function hookFilePath(hooksDir, eventName) {
  return resolvePath(hooksDir, `${FILE_PREFIX}${eventName}${FILE_SUFFIX}`);
}

function readHookFile(path, eventName) {
  if (!existsSync(path)) return { version: 1, hooks: { [eventName]: [] } };
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
  if (Array.isArray(parsed.hooks)) {
    parsed = { ...parsed, version: parsed.version ?? 1, hooks: { [eventName]: parsed.hooks } };
  } else if (!parsed.hooks || typeof parsed.hooks !== "object") {
    parsed.hooks = { [eventName]: [] };
  } else if (Array.isArray(parsed.hooks[eventName])) {
    parsed.version = parsed.version ?? 1;
  } else if (parsed.hooks[eventName] && typeof parsed.hooks[eventName] === "object") {
    parsed.hooks[eventName] = [parsed.hooks[eventName]];
    parsed.version = parsed.version ?? 1;
  } else {
    parsed.hooks[eventName] = [];
    parsed.version = parsed.version ?? 1;
  }
  return parsed;
}

function atomicWrite(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function entryCommand(entry) {
  return entry?.command ?? entry?.bash ?? entry?.powershell ?? null;
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
    const file = readHookFile(fp, eventName);
    const eventHooks = file.hooks[eventName];
    let touched = false;

    for (const entry of entries) {
      if (alreadyRegistered(eventHooks, entry)) {
        skipped++;
        continue;
      }
      eventHooks.push(entry);
      applied++;
      touched = true;
    }

    if (touched && !dryRun) {
      atomicWrite(fp, JSON.stringify(file, null, 2) + "\n");
    }
    files.push({ event: eventName, path: fp, hookCount: eventHooks.length, touched });
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
      const eventName = fp.slice(fp.lastIndexOf(FILE_PREFIX) + FILE_PREFIX.length, -FILE_SUFFIX.length);
      file = readHookFile(fp, eventName);
      const eventHooks = file.hooks[eventName];
      const before = eventHooks.length;
      file.hooks[eventName] = eventHooks.filter((h) => {
        const cmd = entryCommand(h);
        const matched = cmd && sentinel.test(cmd);
        if (matched) removed++;
        return !matched;
      });
      const changed = file.hooks[eventName].length !== before;
      if (!dryRun && changed) {
        if (file.hooks[eventName].length === 0) {
          try { unlinkSync(fp); } catch { /* non-fatal */ }
          files.push({ path: fp, deleted: true });
        } else {
          atomicWrite(fp, JSON.stringify(file, null, 2) + "\n");
          files.push({ path: fp, deleted: false, hookCount: file.hooks[eventName].length });
        }
      } else if (changed) {
        files.push({ path: fp, deleted: file.hooks[eventName].length === 0, hookCount: file.hooks[eventName].length, dryRun: true });
      }
      continue;
    } catch {
      // Unparseable — leave alone, don't double-fault on unpatch.
      continue;
    }
  }

  return { removed, files };
}

// Convenience helper: build the standard thrift-copilot hooks object given
// the scripts-dir path (where the actual .mjs scripts live). The returned
// object maps Copilot event names (camelCase) to entry arrays.
export function buildStandardThriftHooks({ hooksScriptsDir }) {
  const cmd = (name) => `node "${hooksScriptsDir}/${name}.mjs"`;
  const entry = (name, extra = {}) => ({
    type: "command",
    bash: cmd(name),
    powershell: cmd(name),
    timeoutSec: 10,
    ...extra,
  });
  return {
    preToolUse: [
      entry("thrift-pretool-bash-telemetry", { matcher: "bash|powershell" }),
      entry("thrift-pretool-read-coerce", { matcher: "view" }),
    ],
    postToolUse: [
      entry("thrift-posttool-summariser-trigger"),
    ],
    sessionStart: [
      entry("thrift-sessionstart-cache-prime"),
    ],
    agentStop: [
      entry("thrift-agentstop-audit"),
    ],
  };
}
