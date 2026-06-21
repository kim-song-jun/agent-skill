#!/usr/bin/env node
// harness-floor-codex install — emits visual-qa + agent-all + wiki
// config seeds into the target project. Also prints the Playwright MCP
// snippet (TOML) for the user to merge into ~/.codex/config.toml.
// Codex agent-dispatch hooks are not emitted because current Codex hooks
// do not expose that command surface; the Codex floor port uses
// sequential dispatch.
//
// Wiki bucket: writes hook files into .codex/hooks/ and PRINTS a
// sentinel-bracketed TOML snippet for the user to merge into config.toml
// manually (no auto-patch). This matches all other floor-codex buckets.
//
// Usage:
//   node plugins/harness-floor-codex/bin/init.mjs <target> [--ctx ctx.json] [--force] [--only=visual-qa|agent-all|wiki]

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");

const INSTALL_MAP = {
  "visual-qa": [
    { src: "skills/visual-qa-codex/templates/visual-qa.config.json.hbs", dst: ".visual-qa.json" },
    { src: "skills/visual-qa-codex/templates/skills/visual-qa-page/SKILL.md.hbs", dst: ".codex/skills/visual-qa-page/SKILL.md" },
  ],
  "agent-all": [
    { src: "skills/agent-all-codex/templates/agent-all.config.json.hbs", dst: ".agent-all.json" },
  ],
  "wiki": [],
};

const SKILL_DIR_MAP = {
  "visual-qa": [
    { srcDir: "skills/visual-qa-codex", dstDir: ".codex/skills/visual-qa" },
  ],
  "agent-all": [
    { srcDir: "skills/agent-all-codex", dstDir: ".codex/skills/agent-all" },
  ],
  "wiki": [
    { srcDir: "skills/wiki-codex", dstDir: ".codex/skills/wiki" },
  ],
};

const MCP_SNIPPET = "skills/visual-qa-codex/templates/mcp-snippet.toml.hbs";
const VQA_HOOK_SNIPPET = "skills/visual-qa-codex/templates/codex-hooks-snippet.toml.hbs";
const AA_HOOK_SNIPPET = "skills/agent-all-codex/templates/codex-hooks-snippet.toml.hbs";
const DP_HOOK_SNIPPET = "skills/agent-all-codex/templates/decision-protocol-hooks-snippet.toml.hbs";
const WIKI_HOOK_TEMPLATES_DIR = resolve(pluginRoot, "skills/wiki-codex/templates/hooks");

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
    console.error("Usage: init.mjs <target> [--ctx ctx.json] [--force] [--only=visual-qa|agent-all|wiki]");
    process.exit(1);
  }
  if (args.only && !INSTALL_MAP[args.only]) {
    console.error(`--only must be one of: ${Object.keys(INSTALL_MAP).join(", ")}`);
    process.exit(1);
  }
  return args;
}

function loadCtx(ctxPath, extra = {}) {
  const base = {
    baseUrl: "http://localhost:3000",
    model: "claude-sonnet-4-6",
    maxIter: 10,
    maxCostUSD: 5,
    waveSize: "medium",
    breakCondition: "npm test --silent",
    language: "auto",
    ...extra,
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

function renderWikiHooks(target, ctx, force) {
  const hooksDir = resolve(target, ".codex/hooks");
  const hookFiles = readdirSync(WIKI_HOOK_TEMPLATES_DIR);
  const tomlFiles = hookFiles.filter((n) => n.endsWith(".toml.hbs"));
  const mjsFiles = hookFiles.filter((n) => n.endsWith(".mjs.hbs"));
  const snippets = {};

  for (const f of tomlFiles) {
    const dstName = f.replace(/\.hbs$/, "");
    const dstPath = resolve(hooksDir, dstName);
    if (existsSync(dstPath) && !force) {
      console.error(`Refusing to overwrite ${dstPath} (use --force)`);
      process.exit(2);
    }
    mkdirSync(hooksDir, { recursive: true });
    const rendered = render(readFileSync(resolve(WIKI_HOOK_TEMPLATES_DIR, f), "utf-8"), ctx);
    writeFileSync(dstPath, rendered);
    console.log(`wrote ${dstPath}`);
    snippets[dstName.replace(/\.toml$/, "")] = rendered;
  }

  for (const f of mjsFiles) {
    const dstPath = resolve(hooksDir, f.replace(/\.hbs$/, ""));
    if (existsSync(dstPath) && !force) {
      console.error(`Refusing to overwrite ${dstPath} (use --force)`);
      process.exit(2);
    }
    mkdirSync(hooksDir, { recursive: true });
    const rendered = render(readFileSync(resolve(WIKI_HOOK_TEMPLATES_DIR, f), "utf-8"), ctx);
    writeFileSync(dstPath, rendered);
    console.log(`wrote ${dstPath}`);
  }

  return snippets;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const hooksDir = resolve(target, ".codex/hooks");
  const ctx = loadCtx(args.ctxPath, { hooksDir });

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

    for (const t of SKILL_DIR_MAP[bucket] ?? []) {
      const srcPath = resolve(pluginRoot, t.srcDir);
      const dstPath = resolve(target, t.dstDir);
      if (existsSync(dstPath) && !args.force) {
        console.error(`Refusing to overwrite ${dstPath} (use --force)`);
        process.exit(2);
      }
      if (args.force) rmSync(dstPath, { recursive: true, force: true });
      mkdirSync(dirname(dstPath), { recursive: true });
      cpSync(srcPath, dstPath, { recursive: true });
      installed.push(dstPath);
      console.log(`wrote ${dstPath}`);
    }

    // Wiki bucket: render hook pair into .codex/hooks/.
    if (bucket === "wiki") {
      renderWikiHooks(target, ctx, args.force);
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
  if (!args.only || args.only === "wiki") {
    console.log("\n# Wiki PreToolUse first-call digest hook (merge into ~/.codex/config.toml):");
    const wikiTomlSrc = resolve(WIKI_HOOK_TEMPLATES_DIR, "wiki-pretool-first-call-digest.toml.hbs");
    console.log(render(readFileSync(wikiTomlSrc, "utf-8"), ctx));
  }

  console.log(`\ndone — ${installed.length} file(s) installed`);
}

main();
