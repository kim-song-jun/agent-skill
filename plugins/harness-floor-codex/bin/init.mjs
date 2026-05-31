#!/usr/bin/env node
// harness-floor-codex install — emits visual-qa-codex + agent-all-codex
// config seeds into the target project. Also prints the Playwright MCP
// snippet (TOML) for the user to merge into ~/.codex/config.toml.
// Codex agent-dispatch hooks are not emitted because current Codex hooks
// do not expose that command surface; the Codex floor port uses
// sequential dispatch.
//
// Usage:
//   node plugins/harness-floor-codex/bin/init.mjs <target> [--ctx ctx.json] [--force] [--only=visual-qa|agent-all]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");

const INSTALL_MAP = {
  "visual-qa": [
    { src: "skills/visual-qa-codex/templates/visual-qa.config.json.hbs", dst: ".visual-qa.json" },
  ],
  "agent-all": [
    { src: "skills/agent-all-codex/templates/agent-all.config.json.hbs", dst: ".agent-all.json" },
  ],
};

const MCP_SNIPPET = "skills/visual-qa-codex/templates/mcp-snippet.toml.hbs";
const VQA_HOOK_SNIPPET = "skills/visual-qa-codex/templates/codex-hooks-snippet.toml.hbs";
const AA_HOOK_SNIPPET = "skills/agent-all-codex/templates/codex-hooks-snippet.toml.hbs";
const DP_HOOK_SNIPPET = "skills/agent-all-codex/templates/decision-protocol-hooks-snippet.toml.hbs";

function parseArgs(argv) {
  const args = { target: null, ctxPath: null, force: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ctx") args.ctxPath = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a.startsWith("--only=")) args.only = a.slice("--only=".length);
    else if (!args.target) args.target = a;
  }
  if (!args.target) {
    console.error("Usage: init.mjs <target> [--ctx ctx.json] [--force] [--only=visual-qa|agent-all]");
    process.exit(1);
  }
  if (args.only && !INSTALL_MAP[args.only]) {
    console.error(`--only must be one of: ${Object.keys(INSTALL_MAP).join(", ")}`);
    process.exit(1);
  }
  return args;
}

function loadCtx(ctxPath) {
  const base = {
    baseUrl: "http://localhost:3000",
    model: "claude-sonnet-4-6",
    maxIter: 10,
    maxCostUSD: 5,
    waveSize: "medium",
    breakCondition: "npm test --silent",
  };
  if (ctxPath) {
    const file = JSON.parse(readFileSync(ctxPath, "utf-8"));
    return { ...base, ...file };
  }
  for (const k of Object.keys(base)) {
    const envKey = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).toUpperCase();
    if (process.env[envKey]) base[k] = process.env[envKey];
  }
  return base;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const ctx = loadCtx(args.ctxPath);

  const buckets = args.only ? [args.only] : Object.keys(INSTALL_MAP);
  const installed = [];

  for (const bucket of buckets) {
    for (const t of INSTALL_MAP[bucket]) {
      const srcPath = resolve(pluginRoot, t.src);
      const dstPath = resolve(target, t.dst);
      if (existsSync(dstPath) && !args.force) {
        console.error(`Refusing to overwrite ${dstPath} (use --force)`);
        process.exit(2);
      }
      mkdirSync(dirname(dstPath), { recursive: true });
      const tpl = readFileSync(srcPath, "utf-8");
      writeFileSync(dstPath, render(tpl, ctx));
      installed.push(dstPath);
      console.log(`wrote ${dstPath}`);
    }
  }

  console.log("\n# Merge the following into ~/.codex/config.toml (or project .codex/config.toml):");

  if (!args.only || args.only === "visual-qa") {
    console.log(render(readFileSync(resolve(pluginRoot, MCP_SNIPPET), "utf-8"), ctx));
    console.log(render(readFileSync(resolve(pluginRoot, VQA_HOOK_SNIPPET), "utf-8"), ctx));
  }
  if (!args.only || args.only === "agent-all") {
    console.log(render(readFileSync(resolve(pluginRoot, AA_HOOK_SNIPPET), "utf-8"), ctx));
    console.log(render(readFileSync(resolve(pluginRoot, DP_HOOK_SNIPPET), "utf-8"), ctx));
  }

  console.log(`\ndone — ${installed.length} file(s) installed`);
}

main();
