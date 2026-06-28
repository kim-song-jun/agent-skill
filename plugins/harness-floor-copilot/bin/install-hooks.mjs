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
  // Copilot CLI loads user hooks from the `~/.copilot/hooks/` DIRECTORY
  // (`*.json` files), NOT a single `~/.copilot/hooks.json` file. Writing one
  // labeled config file inside that directory is the supported user-level path.
  // See https://docs.github.com/en/copilot/reference/hooks-reference (Hooks locations).
  return resolve(homedir(), ".copilot/hooks/agent-skill.json");
}

// Resolved path to the preToolUse git-safety policy handler (a sibling of the
// per-skill dispatchers, copied with the lib/hooks tree on install).
const PRETOOLUSE_HANDLER = resolve(PLUGIN_ROOT, "skills/agent-all-copilot/lib/hooks/pre-tool-use-policy.mjs");
const GIT_SAFETY_LABEL = "harness-floor-copilot:git-safety";

export function buildPreToolUseEntry(handler = PRETOOLUSE_HANDLER) {
  const command = `node ${shellQuote(handler)}`;
  return {
    type: "command",
    matcher: "bash|powershell",
    bash: command,
    powershell: command,
    timeoutSec: 10,
    env: { AGENT_SKILL_HOOK_LABEL: GIT_SAFETY_LABEL },
  };
}

// Idempotently ensure the git-safety preToolUse hook is registered (replaces the
// entry with our label, preserves any other user-configured preToolUse hooks).
export function addPreToolUseGitSafety(config, handler = PRETOOLUSE_HANDLER) {
  const out = { ...config, version: config.version ?? 1 };
  out.hooks = { ...(config.hooks && typeof config.hooks === "object" ? config.hooks : {}) };
  const arr = Array.isArray(out.hooks.preToolUse) ? [...out.hooks.preToolUse] : [];
  const entry = buildPreToolUseEntry(handler);
  const idx = arr.findIndex((h) => h?.env?.AGENT_SKILL_HOOK_LABEL === GIT_SAFETY_LABEL);
  if (idx >= 0) arr[idx] = entry;
  else arr.push(entry);
  out.hooks.preToolUse = arr;
  return out;
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function buildHookEntry({ label, dispatcher, inbox }) {
  if (!label) throw new Error("buildHookEntry: label required");
  if (!dispatcher) throw new Error("buildHookEntry: dispatcher required");
  if (!inbox) throw new Error("buildHookEntry: inbox required");
  const command = `node ${shellQuote(dispatcher)} --inbox ${shellQuote(inbox)}`;
  return {
    type: "command",
    bash: command,
    powershell: command,
    timeoutSec: 10,
    env: {
      AGENT_SKILL_HOOK_LABEL: `harness-floor-copilot:${label}`,
    },
  };
}

export function mergeHook(existing, entry) {
  // Supported persisted shapes:
  //   { version: 1, hooks: { "<hookName>": [ { type, bash } ] } }
  //   { "<hookName>": [ ... ] } legacy pre-v0.6.17 shape.
  // Normalize both to the official Copilot hook object so user hooks survive.
  const out = { ...existing, version: existing.version ?? 1 };
  const existingHooks = existing.hooks && typeof existing.hooks === "object" ? existing.hooks : {};
  const outHooks = { ...existingHooks };
  const current = outHooks[HOOK_NAME];
  const legacy = existing[HOOK_NAME];
  delete out[HOOK_NAME];
  let arr;
  if (Array.isArray(current)) {
    arr = [...current];
  } else if (current && typeof current === "object") {
    arr = [current];
  } else {
    arr = [];
  }
  if (Array.isArray(legacy)) {
    arr.unshift(...legacy);
  } else if (legacy && typeof legacy === "object") {
    arr.unshift(legacy);
  }
  // Idempotency check: replace entry with same label.
  const entryLabel = entry.env?.AGENT_SKILL_HOOK_LABEL;
  const idx = arr.findIndex((h) => h?.env?.AGENT_SKILL_HOOK_LABEL === entryLabel);
  if (idx >= 0) {
    arr[idx] = entry;
  } else {
    arr.push(entry);
  }
  outHooks[HOOK_NAME] = arr;
  out.hooks = outHooks;
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

  // Detect idempotent re-run across BOTH managed hook events (subagentStop
  // dispatcher + preToolUse git-safety). Compare array content, not the whole
  // object, so key-ordering differences don't trigger a spurious rewrite.
  const before = JSON.stringify({
    s: existing.hooks?.[HOOK_NAME] ?? existing[HOOK_NAME] ?? null,
    p: existing.hooks?.preToolUse ?? null,
  });
  let merged = mergeHook(existing, entry);
  merged = addPreToolUseGitSafety(merged);
  const after = JSON.stringify({
    s: merged.hooks?.[HOOK_NAME] ?? null,
    p: merged.hooks?.preToolUse ?? null,
  });
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
