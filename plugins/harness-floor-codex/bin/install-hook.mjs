#!/usr/bin/env node
// install-hook.mjs — merge the [[hooks.agent]] snippet(s) into
// ~/.codex/config.toml (or a user-supplied config path) without
// clobbering existing TOML.
//
// Strategy (deliberately conservative — no third-party TOML parser):
//
//   1. If the target file does not exist, create it with a managed
//      header + the snippet.
//   2. If the target file exists and already contains a
//      `[[hooks.agent]]` table-array whose `matcher` references our
//      prefix (agent-all/wave/ or visual-qa/page/), skip that snippet —
//      install is idempotent.
//   3. Otherwise append the snippet beneath a managed marker comment.
//
// We never rewrite existing tables. Worst case the user ends up with
// two consecutive `[[hooks.agent]]` table-array elements (TOML allows
// this — table-arrays are designed for it). If they want a single
// canonical form they can hand-merge after seeing the printed diff.
//
// Usage:
//   node plugins/harness-floor-codex/bin/install-hook.mjs \
//     [--config-toml ~/.codex/config.toml] \
//     [--matcher agent-all|visual-qa|both]   (default: both) \
//     [--dry-run] [--force]
//
// TODO: requires live Codex CLI to verify [[hooks.agent]] schema. If
// the live syntax is `[hooks] agent = [...]` instead of
// `[[hooks.agent]]`, swap the snippet templates and the prefix-detection
// regex in `hookSectionContainsMatcher` below.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");

const MANAGED_HEADER = "# Managed by harness-floor-codex/bin/install-hook.mjs";

export const SNIPPETS = {
  "agent-all": {
    matcherPrefix: "agent-all/wave/",
    snippetPath: resolve(
      pluginRoot,
      "skills/agent-all-codex/templates/codex-hooks-snippet.toml.hbs",
    ),
  },
  "visual-qa": {
    matcherPrefix: "visual-qa/page/",
    snippetPath: resolve(
      pluginRoot,
      "skills/visual-qa-codex/templates/codex-hooks-snippet.toml.hbs",
    ),
  },
};

export function defaultConfigPath() {
  return resolve(homedir(), ".codex", "config.toml");
}

/**
 * Scan TOML text for a `[[hooks.agent]]` table-array whose `matcher`
 * string contains the given prefix. Returns true when at least one
 * such section is present.
 *
 * Implementation: line-by-line walk (no TOML parser). We treat any
 * `[...]` header as a section break. Within a `[[hooks.agent]]`
 * section, we look for `matcher = "..."` (single or double quotes).
 *
 * @param {string} tomlText
 * @param {string} prefix
 * @returns {boolean}
 */
export function hookSectionContainsMatcher(tomlText, prefix) {
  if (typeof tomlText !== "string" || tomlText.length === 0) return false;
  const lines = tomlText.split(/\r?\n/);
  let inAgentHook = false;
  let sectionMatched = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[\[?[^\]]+\]\]?$/.test(line)) {
      if (inAgentHook && sectionMatched) return true;
      inAgentHook = /^\[\[hooks\.agent\]\]$/.test(line);
      sectionMatched = false;
      continue;
    }
    if (!inAgentHook) continue;
    const m = line.match(/^matcher\s*=\s*(['"])(.*)\1\s*$/);
    if (m && m[2].includes(prefix)) sectionMatched = true;
  }
  return inAgentHook && sectionMatched;
}

/**
 * Compute the merged TOML text. Pure function — no filesystem writes.
 *
 * @param {string} existingToml
 * @param {Array<{name: string, snippet: string, matcherPrefix: string}>} snippetsToApply
 * @returns {{merged: string, applied: string[], skipped: string[]}}
 */
export function planMerge(existingToml, snippetsToApply) {
  const applied = [];
  const skipped = [];
  let merged = existingToml;
  for (const { name, snippet, matcherPrefix } of snippetsToApply) {
    if (hookSectionContainsMatcher(merged, matcherPrefix)) {
      skipped.push(name);
      continue;
    }
    const block = [
      "",
      `${MANAGED_HEADER} (matcher=${name})`,
      snippet.trim(),
      "",
    ].join("\n");
    merged = merged.length === 0
      ? `${MANAGED_HEADER}\n${snippet.trim()}\n`
      : (merged.endsWith("\n") ? merged + block : merged + "\n" + block);
    applied.push(name);
  }
  return { merged, applied, skipped };
}

function parseArgs(argv) {
  const args = {
    configPath: null,
    matcher: "both",
    dryRun: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--config-toml") args.configPath = argv[++i];
    else if (a.startsWith("--config-toml=")) args.configPath = a.slice("--config-toml=".length);
    else if (a === "--matcher") args.matcher = argv[++i];
    else if (a.startsWith("--matcher=")) args.matcher = a.slice("--matcher=".length);
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printUsage();
      process.exit(1);
    }
  }
  if (!["agent-all", "visual-qa", "both"].includes(args.matcher)) {
    console.error(`--matcher must be one of: agent-all, visual-qa, both`);
    process.exit(1);
  }
  return args;
}

function printUsage() {
  console.error(
    "Usage: install-hook.mjs [--config-toml <path>] "
    + "[--matcher agent-all|visual-qa|both] [--dry-run] [--force]",
  );
}

export function buildSnippetsForMatcher(matcher) {
  const names = matcher === "both"
    ? ["agent-all", "visual-qa"]
    : [matcher];
  return names.map((name) => {
    const def = SNIPPETS[name];
    if (!def) throw new Error(`unknown matcher: ${name}`);
    if (!existsSync(def.snippetPath)) {
      throw new Error(`snippet template missing: ${def.snippetPath}`);
    }
    return {
      name,
      matcherPrefix: def.matcherPrefix,
      snippet: readFileSync(def.snippetPath, "utf-8"),
    };
  });
}

/**
 * Programmatic entry-point — used by tests and by bin/init.mjs's
 * optional `--with-hook` flag (per spec line 100).
 *
 * @param {object} opts
 * @param {string} opts.configPath
 * @param {"agent-all"|"visual-qa"|"both"} [opts.matcher="both"]
 * @param {boolean} [opts.dryRun=false]
 * @returns {{configPath: string, applied: string[], skipped: string[],
 *           merged: string, existed: boolean}}
 */
export function installHook(opts) {
  const configPath = opts.configPath || defaultConfigPath();
  const existed = existsSync(configPath);
  const existing = existed ? readFileSync(configPath, "utf-8") : "";
  const snippets = buildSnippetsForMatcher(opts.matcher || "both");
  const { merged, applied, skipped } = planMerge(existing, snippets);
  if (!opts.dryRun && applied.length > 0) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, merged);
  }
  return { configPath, applied, skipped, merged, existed };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = args.configPath || defaultConfigPath();
  const result = installHook({
    configPath,
    matcher: args.matcher,
    dryRun: args.dryRun,
  });
  if (args.dryRun) {
    console.log(`# dry-run: would write to ${result.configPath}`);
    console.log(`# applied:  ${result.applied.join(", ") || "(none)"}`);
    console.log(`# skipped:  ${result.skipped.join(", ") || "(none — all idempotent)"}`);
    if (result.applied.length > 0) {
      console.log("# --- merged TOML preview ---");
      console.log(result.merged);
    }
    return;
  }
  console.log(`config: ${result.configPath} (${result.existed ? "merged" : "created"})`);
  console.log(`applied: ${result.applied.join(", ") || "(none)"}`);
  console.log(`skipped: ${result.skipped.join(", ") || "(none — all idempotent)"}`);
  if (result.applied.length === 0 && result.skipped.length > 0) {
    console.log(
      "All matchers already present; no changes written. "
      + "Re-run with --force to no-op (the file is unchanged regardless).",
    );
  }
}

// Run main only when invoked as a script, not when imported by tests.
const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (err) {
    console.error(`install-hook: ${err.message}`);
    process.exit(1);
  }
}
