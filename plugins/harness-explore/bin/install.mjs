#!/usr/bin/env node
// harness-explore install — initial config renderer.
//
// Writes `.explore.json` (config seed) into a target project. Unlike
// harness-thrift, harness-explore does NOT install hooks or patch
// settings.local.json — exploration is run on-demand via the
// `/explore` skill, whose phase docs stay in the plugin itself.
//
// Usage:
//   node plugins/harness-explore/bin/install.mjs <target> \
//        [--ctx ctx.json] [--force] [--dry-run]
//
// What gets installed:
//   .explore.json    (config seed)
//
// What does NOT get installed (lives in the plugin, read on demand):
//   - skills/explore/phases/*.md
//   - skills/explore/lib/*.mjs
//   - skills/explore/templates/*.hbs
//
// `.explore-cache/` is auto-created on first scan; not seeded here.
// `.gitignore` patching is handled by Phase 4 (idempotent), not here.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const SKILL_ROOT = resolve(pluginRoot, "skills/explore");
const CONFIG_TEMPLATE = resolve(SKILL_ROOT, "templates/explore.config.json.hbs");

function parseArgs(argv) {
  const args = { target: null, ctxPath: null, force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ctx") args.ctxPath = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
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
    "Usage: install.mjs <target> [--ctx ctx.json] [--force] [--dry-run]",
  );
}

function loadCtx(ctxPath) {
  const base = {
    concurrency: 8,
    subagentOutputTokenBudget: 4000,
    autoScan: false,
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
  const ctx = loadCtx(args.ctxPath);

  writeRendered({
    srcPath: CONFIG_TEMPLATE,
    dstPath: resolve(target, ".explore.json"),
    ctx,
    force: args.force,
    dryRun: args.dryRun,
  });

  console.log("");
  console.log("harness-explore install summary:");
  console.log(`  target:        ${target}`);
  console.log(`  config:        .explore.json`);
  console.log(`  concurrency:   ${ctx.concurrency}`);
  console.log(`  token budget:  ${ctx.subagentOutputTokenBudget}`);
  console.log(`  auto-scan:     ${ctx.autoScan}`);
  console.log(`  dry-run:       ${args.dryRun ? "yes" : "no"}`);
  console.log("");
  console.log("Next: run `/explore` in this project to build the first map.");
}

main();
