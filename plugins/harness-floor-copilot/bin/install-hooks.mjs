#!/usr/bin/env node
// install-hooks — registers a `subagentStop` entry in ~/.copilot/hooks.json
// pointing at the per-plugin dispatcher script. Merge-safe (preserves any
// existing user-configured hooks).
//
// Both agent-all-copilot and visual-qa-copilot dispatch into their own
// inbox files. This helper writes one labeled subagentStop entry per inbox;
// rerunning with another label appends side-by-side entries while preserving
// user-configured hooks.
//
// Usage:
//   node plugins/harness-floor-copilot/bin/install-hooks.mjs \
//     --hooks-file ~/.copilot/hooks.json \
//     --inbox <abs-path-to-inbox.jsonl> \
//     [--label agent-all|visual-qa] \
//     [--dispatcher <abs-path-to-dispatcher.mjs>] \
//     [--force]
//
// Idempotency: re-running with the same --inbox + --label is a no-op
// (entry detected by label match).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(here, "..");

const DEFAULT_DISPATCHERS = {
  "agent-all": resolve(PLUGIN_ROOT, "skills/agent-all-copilot/lib/hooks/subagent-stop-dispatcher.mjs"),
  "visual-qa": resolve(PLUGIN_ROOT, "skills/visual-qa-copilot/lib/hooks/subagent-stop-dispatcher.mjs"),
};

const HOOK_NAME = "subagentStop";

function parseArgs(argv) {
  const out = {
    hooksFile: null,
    inbox: null,
    label: null,
    dispatcher: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hooks-file") out.hooksFile = argv[++i];
    else if (a === "--inbox") out.inbox = argv[++i];
    else if (a === "--label") out.label = argv[++i];
    else if (a === "--dispatcher") out.dispatcher = argv[++i];
    else if (a === "--force") out.force = true;
  }
  return out;
}

function defaultHooksFile() {
  return resolve(homedir(), ".copilot/hooks.json");
}

export function loadHooksFile(path, fsRead = readFileSync) {
  if (!existsSync(path)) return {};
  const raw = fsRead(path, "utf-8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`hooks file is not valid JSON: ${path} — ${e.message}`);
  }
}

export function buildHookEntry({ label, dispatcher, inbox }) {
  if (!label) throw new Error("buildHookEntry: label required");
  if (!dispatcher) throw new Error("buildHookEntry: dispatcher required");
  if (!inbox) throw new Error("buildHookEntry: inbox required");
  return {
    label: `harness-floor-copilot:${label}`,
    command: "node",
    args: [dispatcher, "--inbox", inbox],
  };
}

export function mergeHook(existing, entry) {
  // Supported persisted shapes:
  //   { "<hookName>": [ { label, command, args } | { command, args } ] }
  //   { "<hookName>": { label, command, args } }
  // Normalize both to an append-only array so user hooks survive.
  const out = { ...existing };
  const current = out[HOOK_NAME];
  let arr;
  if (Array.isArray(current)) {
    arr = [...current];
  } else if (current && typeof current === "object") {
    arr = [current];
  } else {
    arr = [];
  }
  // Idempotency check: replace entry with same label.
  const idx = arr.findIndex((h) => h?.label === entry.label);
  if (idx >= 0) {
    arr[idx] = entry;
  } else {
    arr.push(entry);
  }
  out[HOOK_NAME] = arr;
  return out;
}

export function installHooks({
  hooksFile,
  inbox,
  label,
  dispatcher,
  force = false,
  fsRead = readFileSync,
  fsWrite = writeFileSync,
  fsExists = existsSync,
  fsMkdir = mkdirSync,
} = {}) {
  if (!hooksFile) throw new Error("installHooks: hooksFile required");
  if (!inbox) throw new Error("installHooks: inbox required");
  if (!label) throw new Error("installHooks: label required");
  const resolvedDispatcher = dispatcher ?? DEFAULT_DISPATCHERS[label];
  if (!resolvedDispatcher) {
    throw new Error(`installHooks: no default dispatcher for label '${label}'`);
  }
  if (!fsExists(resolvedDispatcher)) {
    throw new Error(`installHooks: dispatcher script not found: ${resolvedDispatcher}`);
  }

  const existing = loadHooksFile(hooksFile, fsRead);
  const entry = buildHookEntry({ label, dispatcher: resolvedDispatcher, inbox });

  // Detect idempotent re-run.
  const before = JSON.stringify(existing[HOOK_NAME] ?? null);
  const merged = mergeHook(existing, entry);
  const after = JSON.stringify(merged[HOOK_NAME]);
  const changed = before !== after;
  if (!changed && !force) {
    return { ok: true, changed: false, action: "noop", path: hooksFile };
  }

  fsMkdir(dirname(hooksFile), { recursive: true });
  fsWrite(hooksFile, JSON.stringify(merged, null, 2));
  return { ok: true, changed: true, action: changed ? "merged" : "rewritten", path: hooksFile };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hooksFile = args.hooksFile ?? defaultHooksFile();
  if (!args.inbox) {
    console.error("--inbox is required");
    process.exit(1);
  }
  if (!args.label) {
    console.error("--label is required (agent-all or visual-qa)");
    process.exit(1);
  }
  try {
    const result = installHooks({
      hooksFile,
      inbox: resolve(args.inbox),
      label: args.label,
      dispatcher: args.dispatcher ? resolve(args.dispatcher) : undefined,
      force: args.force,
    });
    console.log(`${result.action}: ${result.path}`);
    process.exit(0);
  } catch (e) {
    console.error(`install-hooks failed: ${e.message}`);
    process.exit(2);
  }
}

const isDirectInvocation = process.argv[1] && process.argv[1].endsWith("install-hooks.mjs");
if (isDirectInvocation) {
  main();
}

export const __internal = { DEFAULT_DISPATCHERS, HOOK_NAME, defaultHooksFile };
