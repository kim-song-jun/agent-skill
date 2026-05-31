#!/usr/bin/env node
// install-hook.mjs — compatibility shim for the removed legacy Codex
// agent-hook installer.
//
// Current Codex hooks support command handlers such as PreToolUse and
// PostToolUse. They do not provide the old agent-dispatch hook surface
// this scaffold assumed. Keep this script as a no-op so old docs/CLI
// invocations fail safe and leave user config untouched.
//
// Usage:
//   node plugins/harness-floor-codex/bin/install-hook.mjs \
//     [--config-toml ~/.codex/config.toml] \
//     [--matcher agent-all|visual-qa|both]   (default: both) \
//     [--dry-run] [--force]
//
import {
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");

const UNSUPPORTED_REASON = "agent-hook dispatch is unsupported by current Codex hooks; sequential dispatch is used";

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
 * Current Codex hook config has no supported agent-dispatch table.
 * Legacy config snippets are intentionally ignored so preflight falls
 * back to sequential dispatch instead of selecting a broken path.
 *
 * @param {string} tomlText
 * @param {string} prefix
 * @returns {boolean}
 */
export function hookSectionContainsMatcher(tomlText, prefix) {
  void tomlText;
  void prefix;
  return false;
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
  for (const { name } of snippetsToApply) {
    skipped.push(name);
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
      supported: false,
      reason: UNSUPPORTED_REASON,
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
  void opts.dryRun;
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
    console.log(`# unsupported: ${UNSUPPORTED_REASON}`);
    return;
  }
  console.log(`config: ${result.configPath} (${result.existed ? "merged" : "created"})`);
  console.log(`applied: ${result.applied.join(", ") || "(none)"}`);
  console.log(`skipped: ${result.skipped.join(", ") || "(none — all idempotent)"}`);
  console.log(`unsupported: ${UNSUPPORTED_REASON}`);
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
