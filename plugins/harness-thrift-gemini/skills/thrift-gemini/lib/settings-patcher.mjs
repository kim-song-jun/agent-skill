// Append-only patcher for ~/.gemini/settings.json (Gemini port).
//
// Differences vs the CC settings-patcher:
//   - Target file is `~/.gemini/settings.json` (single user-scope JSON),
//     NOT `.claude/settings.local.json` (per-project).
//   - Event names: `BeforeTool` / `AfterTool` / `SessionStart`
//     (NOT `PreToolUse` / `PostToolUse` / `SessionStart` / `SessionEnd`).
//   - Hook entry shape: Gemini uses `{matcher?, command}` directly (no
//     nested `hooks: [{type, command}]` array). The patcher honors this
//     flatter shape.
//
// Contract:
//   patchSettings({settingsPath, hooksToAdd, dryRun}) → {applied, skipped, current}
//     hooksToAdd: { [event]: [{matcher?, command}, ...] }
//   - Reads existing settings.json (creates {hooks: {}} skeleton if missing).
//   - Appends thrift entries to each event's array (never inserts at head).
//   - Skips an entry if a matching `command` is already registered
//     (exact string match) — avoids double-registration on re-run.
//   - Writes back atomically (tmp + rename).
//
//   unpatchSettings({settingsPath, sentinel, dryRun}) → {removed, current}
//   - Removes any hook entry whose command matches `sentinel` (regex).
//     Default sentinel: /thrift-.*\.m?js/.
//   - Safe to run multiple times.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_SENTINEL = /thrift-.*\.m?js/;

// The four hook event names Gemini exposes (as of 2026-05). `AfterTool`
// is the rough equivalent of PostToolUse; no native `SessionEnd` exists
// in Gemini, so we don't include it.
export const GEMINI_HOOK_EVENTS = ["BeforeTool", "AfterTool", "SessionStart"];

function readSettings(path) {
  if (!existsSync(path)) return { hooks: {} };
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
    // Don't blow away unparseable user config; refuse to touch.
    throw new Error(`cannot parse ${path} — refusing to patch`);
  }
  if (!parsed.hooks || typeof parsed.hooks !== "object") parsed.hooks = {};
  return parsed;
}

function atomicWrite(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, body);
  renameSync(tmp, path);
}

function commandOf(entry) {
  if (!entry) return null;
  // Gemini's flat shape: {matcher?, command}.
  if (typeof entry.command === "string") return entry.command;
  // Defensive: support CC-shape {hooks: [{command}]} in case a user has
  // mixed-style entries.
  if (Array.isArray(entry.hooks) && entry.hooks[0]?.command) return entry.hooks[0].command;
  return null;
}

function alreadyRegistered(existingEntries, newEntry) {
  const newCmd = commandOf(newEntry);
  if (!newCmd) return false;
  return existingEntries.some((existing) => commandOf(existing) === newCmd);
}

export function patchSettings({ settingsPath, hooksToAdd, dryRun = false }) {
  const settings = readSettings(settingsPath);
  let applied = 0;
  let skipped = 0;
  for (const [event, entries] of Object.entries(hooksToAdd)) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    if (!Array.isArray(settings.hooks[event])) {
      throw new Error(`existing settings.hooks.${event} is not an array — refusing to patch`);
    }
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
      const cmd = commandOf(entry);
      const matched = cmd && sentinel.test(cmd);
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

// Convenience helper: build the standard thrift-gemini hooks object
// given a hooks-dir path (where the actual .mjs scripts live).
//
// Tool name mapping:
//   Bash → run_shell_command
//   Read → read_file
//
// Event name mapping:
//   PreToolUse  → BeforeTool
//   PostToolUse → AfterTool
//   SessionStart → SessionStart  (unchanged)
//   SessionEnd  → (no Gemini equivalent — audit fires on next SessionStart)
export function buildStandardThriftGeminiHooks({ hooksDir }) {
  const cmd = (name) => `node "${hooksDir}/${name}.mjs"`;
  return {
    BeforeTool: [
      { matcher: "run_shell_command", command: cmd("thrift-beforetool-bash-telemetry") },
      { matcher: "read_file", command: cmd("thrift-beforetool-read-coerce") },
    ],
    AfterTool: [
      { command: cmd("thrift-aftertool-summariser-trigger") },
    ],
    SessionStart: [
      { command: cmd("thrift-sessionstart-cache-prime") },
    ],
  };
}
