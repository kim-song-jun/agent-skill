#!/usr/bin/env node
// harness-floor-copilot install — emits visual-qa-copilot + agent-all-copilot
// config seeds into the target project. Copilot CLI doesn't have a workspace
// agent-files directory like Cursor does; its subagent contract is the
// `task` tool itself. So this renderer only writes config seeds + prints
// the Playwright MCP snippet for `~/.copilot/mcp-config.json`.
//
// Usage:
//   node plugins/harness-floor-copilot/bin/init.mjs <target> [--ctx ctx.json] [--force] [--only=visual-qa|agent-all]

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");

const INSTALL_MAP = {
  "visual-qa": [
    { src: "skills/visual-qa-copilot/templates/visual-qa.config.json.hbs", dst: ".visual-qa.json" },
  ],
  "agent-all": [
    { src: "skills/agent-all-copilot/templates/agent-all.config.json.hbs", dst: ".agent-all.json" },
    { src: "skills/agent-all-copilot/templates/decision-protocol.md.hbs", dst: ".github/agent-all/decision-protocol.md" },
  ],
};

const MCP_SNIPPET = "skills/visual-qa-copilot/templates/mcp-snippet.json.hbs";

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
    language: "auto",
  };
  if (ctxPath) {
    const file = JSON.parse(readFileSync(ctxPath, "utf-8"));
    return { ...base, ...file };
  }
  for (const k of Object.keys(base)) {
    const envKey = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).toUpperCase();
    if (process.env[envKey]) base[k] = process.env[envKey];
  }
  if (process.env.AGENT_INIT_LANG) base.language = process.env.AGENT_INIT_LANG;
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

  if (!args.only || args.only === "visual-qa") {
    const mcpSnippet = readFileSync(resolve(pluginRoot, MCP_SNIPPET), "utf-8");
    console.log("\n# Merge the following into ~/.copilot/mcp-config.json:");
    console.log(render(mcpSnippet, ctx));
  }

  console.log(`\ndone — ${installed.length} file(s) installed`);
}

main();
