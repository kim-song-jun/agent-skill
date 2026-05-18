#!/usr/bin/env node
// harness-floor-cursor install — emits visual-qa-cursor + agent-all-cursor
// kit into a target project's `.cursor/` and root config files.
//
// Usage:
//   node plugins/harness-floor-cursor/bin/init.mjs <target> [--ctx ctx.json] [--force] [--only=visual-qa|agent-all]
//
// What gets installed to the target:
//   .visual-qa.json                                            (visual-qa config seed)
//   .agent-all.json                                            (agent-all config seed)
//   .cursor/rules/agent-all.mdc                                (alwaysApply rule)
//   .cursor/agents/visual-qa-page.md                           (is_background: true)
//   .cursor/agents/agent-all-coordinator.md                    (parent)
//   .cursor/agents/agent-all-implementer.md                    (is_background: true)
//   .cursor/agents/agent-all-reviewer.md                       (is_background: true)
//
// Also printed to stdout: Playwright MCP snippet for `.cursor/mcp.json`.
// Runtime templates (analysis-prompt, report, pr-body, page-prompt) stay
// in the plugin — the skills render them at run time.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");

const INSTALL_MAP = {
  "visual-qa": [
    { src: "skills/visual-qa-cursor/templates/visual-qa.config.json.hbs", dst: ".visual-qa.json" },
    { src: "skills/visual-qa-cursor/templates/agents/visual-qa-page.md.hbs", dst: ".cursor/agents/visual-qa-page.md" },
  ],
  "agent-all": [
    { src: "skills/agent-all-cursor/templates/agent-all.config.json.hbs", dst: ".agent-all.json" },
    { src: "skills/agent-all-cursor/templates/rules/agent-all.mdc.hbs", dst: ".cursor/rules/agent-all.mdc" },
    { src: "skills/agent-all-cursor/templates/agents/agent-all-coordinator.md.hbs", dst: ".cursor/agents/agent-all-coordinator.md" },
    { src: "skills/agent-all-cursor/templates/agents/agent-all-implementer.md.hbs", dst: ".cursor/agents/agent-all-implementer.md" },
    { src: "skills/agent-all-cursor/templates/agents/agent-all-reviewer.md.hbs", dst: ".cursor/agents/agent-all-reviewer.md" },
  ],
};

const MCP_SNIPPET = "skills/visual-qa-cursor/templates/mcp-snippet.json.hbs";

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
  // Env-var overrides
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
      const rendered = render(tpl, ctx);
      writeFileSync(dstPath, rendered);
      installed.push(dstPath);
      console.log(`wrote ${dstPath}`);
    }
  }

  // Print MCP snippet to stdout (user merges into .cursor/mcp.json manually)
  if (!args.only || args.only === "visual-qa") {
    const mcpSnippet = readFileSync(resolve(pluginRoot, MCP_SNIPPET), "utf-8");
    console.log("\n# Merge the following into .cursor/mcp.json (or ~/.cursor/mcp.json):");
    console.log(render(mcpSnippet, ctx));
  }

  console.log(`\ndone — ${installed.length} file(s) installed`);
}

main();
