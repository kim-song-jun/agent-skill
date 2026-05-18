// Append-only patcher for .claude/settings.local.json.
//
// Contract:
//   patchSettings({settingsPath, hooksToAdd, dryRun}) → {applied, skipped, current}
//     hooksToAdd: { [event]: [{matcher?, hooks: [{type, command}]}, ...] }
//   - Reads existing settings.local.json (creates empty if missing).
//   - Appends thrift entries to each event's array (never inserts at head).
//   - Skips an entry if a hooks[*].command path is already registered
//     (using exact string match) — avoids double-registration on re-run.
//   - Writes back atomically (tmp + rename).
//
//   unpatchSettings({settingsPath, sentinel}) → {removed, current}
//   - Removes any hooks entry whose command path matches `sentinel`
//     (regex). Default sentinel: /thrift-.*\.mjs/.
//   - Safe to run multiple times.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_SENTINEL = /thrift-.*\.m?js|thrift\/.*\.m?js/;

function readSettings(path) {
  if (!existsSync(path)) return { hooks: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!parsed.hooks || typeof parsed.hooks !== "object") parsed.hooks = {};
    return parsed;
  } catch {
    // Don't blow away unparseable user config; refuse to touch.
    throw new Error(`cannot parse ${path} — refusing to patch`);
  }
}

function atomicWrite(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function commandsOf(entry) {
  if (!entry || !Array.isArray(entry.hooks)) return [];
  return entry.hooks.map((h) => h?.command).filter(Boolean);
}

function alreadyRegistered(existingEntries, newEntry) {
  const newCommands = commandsOf(newEntry);
  for (const existing of existingEntries) {
    const existingCommands = commandsOf(existing);
    for (const c of newCommands) {
      if (existingCommands.includes(c)) return true;
    }
  }
  return false;
}

export function patchSettings({ settingsPath, hooksToAdd, dryRun = false }) {
  const settings = readSettings(settingsPath);
  let applied = 0;
  let skipped = 0;
  for (const [event, entries] of Object.entries(hooksToAdd)) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    for (const entry of entries) {
      if (alreadyRegistered(settings.hooks[event], entry)) {
        skipped++;
        continue;
      }
      settings.hooks[event].push(entry);
      applied++;
    }
  }
  if (!dryRun && applied > 0) {
    atomicWrite(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }
  return { applied, skipped, current: settings };
}

export function unpatchSettings({ settingsPath, sentinel = DEFAULT_SENTINEL, dryRun = false }) {
  if (!existsSync(settingsPath)) {
    return { removed: 0, current: { hooks: {} } };
  }
  const settings = readSettings(settingsPath);
  let removed = 0;
  for (const [event, entries] of Object.entries(settings.hooks)) {
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((entry) => {
      const cmds = commandsOf(entry);
      const matched = cmds.some((c) => sentinel.test(c));
      if (matched) removed++;
      return !matched;
    });
    if (filtered.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = filtered;
    }
  }
  if (!dryRun && removed > 0) {
    atomicWrite(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  }
  return { removed, current: settings };
}

// Convenience helper: build the standard thrift hooks array given a
// hooks-dir path (where the actual .mjs scripts live).
export function buildStandardThriftHooks({ hooksDir }) {
  const cmd = (name) => `node "${hooksDir}/${name}.mjs"`;
  return {
    PreToolUse: [
      { matcher: "Bash", hooks: [{ type: "command", command: cmd("thrift-pretool-bash-telemetry") }] },
      { matcher: "Read", hooks: [{ type: "command", command: cmd("thrift-pretool-read-coerce") }] },
    ],
    PostToolUse: [
      { hooks: [{ type: "command", command: cmd("thrift-posttool-summariser-trigger") }] },
    ],
    SessionStart: [
      { hooks: [{ type: "command", command: cmd("thrift-sessionstart-cache-prime") }] },
    ],
    SessionEnd: [
      { hooks: [{ type: "command", command: cmd("thrift-sessionend-audit") }] },
    ],
  };
}
