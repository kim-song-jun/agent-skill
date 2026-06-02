#!/usr/bin/env node
// harness-thrift-cursor install — renders `.thrift.json` + the advisory
// rule `.cursor/rules/thrift.mdc` into a target Cursor workspace.
//
// Cursor has no programmatic hook system and no exposed prompt-cache
// surface, so the Claude Code skill's Phases 2 (hook patching), 4
// (cache prime) collapse to a single rule file. Phase 5 (audit) is
// advisory only and is not rendered at install time — the planner
// fills it from the rule's recap clause.
//
// Usage:
//   node plugins/harness-thrift-cursor/bin/install.mjs <target> \
//        [--ctx ctx.json] [--force] [--dry-run] [--uninstall]
//
// What gets installed to <target>:
//   .thrift.json                       (config seed; no `cache` section)
//   .cursor/rules/thrift.mdc           (advisory rule encoding the workflow)
//
// What is NOT installed (vs Claude Code harness-thrift):
//   - `.claude/hooks/thrift-*.mjs`     (no hook system)
//   - `.claude/settings.local.json`    (no settings file to patch)
//   - `.claude/hooks/lib/*.mjs`        (no hook scripts to import lib)
//   - `audit-report.md.hbs` runtime    (recap is narrative; template stays in plugin)

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const SKILL_ROOT = resolve(pluginRoot, "skills/thrift-cursor");
const CONFIG_TEMPLATE = resolve(SKILL_ROOT, "templates/thrift.config.json.hbs");
const RULE_TEMPLATE = resolve(SKILL_ROOT, "templates/rules/thrift.mdc.hbs");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    target: null,
    ctxPath: null,
    force: false,
    dryRun: false,
    uninstall: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ctx") args.ctxPath = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--uninstall") args.uninstall = true;
    else if (!a.startsWith("--") && !args.target) args.target = a;
    else {
      console.error(`Unknown argument: ${a}`);
      printUsage();
      process.exit(1);
    }
  }
  if (!args.target) {
    printUsage();
    process.exit(1);
  }
  return args;
}

function printUsage() {
  console.error(
    "Usage: install.mjs <target> [--ctx ctx.json] [--force] [--dry-run] [--uninstall]",
  );
}

function loadCtx(ctxPath) {
  const base = {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    summariserModel: "claude-haiku-4-5-20251001",
    coerceBashWhenOutputExceeds: 20,
    coerceReadWhenOutputExceeds: 200,
    date: todayISO(),
  };
  if (ctxPath) {
    const file = JSON.parse(readFileSync(ctxPath, "utf-8"));
    return { ...base, ...file };
  }
  return base;
}

function writeRendered({ srcPath, dstPath, ctx, force, dryRun }) {
  if (existsSync(dstPath) && !force) {
    console.error(`Refusing to overwrite ${dstPath} (use --force)`);
    process.exit(2);
  }
  const tpl = readFileSync(srcPath, "utf-8");
  const rendered = render(tpl, ctx);
  if (dryRun) {
    console.log(`would write ${dstPath} (${rendered.length} bytes)`);
    return;
  }
  mkdirSync(dirname(dstPath), { recursive: true });
  writeFileSync(dstPath, rendered);
  console.log(`wrote ${dstPath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }

  if (args.uninstall) {
    const artifacts = [
      resolve(target, ".thrift.json"),
      resolve(target, ".cursor/rules/thrift.mdc"),
    ];
    let removed = 0;
    for (const path of artifacts) {
      if (!existsSync(path)) continue;
      removed++;
      if (args.dryRun) {
        console.log(`would remove ${path}`);
      } else {
        rmSync(path, { force: true });
        console.log(`removed ${path}`);
      }
    }
    console.log("");
    console.log("Thrift uninstall summary (Cursor):");
    console.log(`  target:       ${target}`);
    console.log(`  removed:      removed=${removed}`);
    console.log(`  dry-run:      ${args.dryRun ? "yes" : "no"}`);
    return;
  }

  const ctx = loadCtx(args.ctxPath);

  // 1. Render config seed
  writeRendered({
    srcPath: CONFIG_TEMPLATE,
    dstPath: resolve(target, ".thrift.json"),
    ctx,
    force: args.force,
    dryRun: args.dryRun,
  });

  // 2. Render the advisory rule into .cursor/rules/
  writeRendered({
    srcPath: RULE_TEMPLATE,
    dstPath: resolve(target, ".cursor/rules/thrift.mdc"),
    ctx,
    force: args.force,
    dryRun: args.dryRun,
  });

  console.log("");
  console.log("Thrift install summary (Cursor):");
  console.log(`  target:       ${target}`);
  console.log(`  config:       .thrift.json`);
  console.log(`  rule:         .cursor/rules/thrift.mdc`);
  console.log(`  cache prime:  omitted (Cursor has no cache surface)`);
  console.log(`  audit:        advisory recap only (no token metrics)`);
  console.log(`  dry-run:      ${args.dryRun ? "yes" : "no"}`);
}

main();
