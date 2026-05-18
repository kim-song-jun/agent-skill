#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../skills/cursor-init/lib/detect-stack.mjs";
import { render } from "../skills/cursor-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const templatesDir = resolve(pluginRoot, "skills/cursor-init/templates");

function parseArgs(argv) {
  const args = { target: null, ctxPath: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ctx") args.ctxPath = argv[++i];
    else if (argv[i] === "--force") args.force = true;
    else if (!args.target) args.target = argv[i];
  }
  if (!args.target) {
    console.error("Usage: init.mjs <target-project-dir> [--ctx <ctx.json>] [--force]");
    process.exit(1);
  }
  return args;
}

function loadCtx(ctxPath, target) {
  let ctx;
  if (ctxPath) {
    ctx = JSON.parse(readFileSync(ctxPath, "utf-8"));
  } else {
    ctx = {
      purpose: process.env.PURPOSE || "Project",
      size: process.env.SIZE || "medium",
      qa_personas: (process.env.QA_PERSONAS || "general").split(",").map((s) => s.trim()),
      deploy_targets: process.env.DEPLOY_TARGETS || "",
      constraints: process.env.CONSTRAINTS || "",
    };
  }
  const detected = detectProject(target);
  return {
    ...ctx,
    ...detected,
    services_str: detected.services.join(", "),
    agents: [
      { name: "planner", description: "Drafts a plan before non-trivial changes." },
      { name: "dev", description: "Implements after a plan is confirmed." },
      { name: "reviewer", description: "Reviews the diff before final acceptance." },
    ],
  };
}

function listTemplates(dir, baseRel = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listTemplates(full, rel));
    else if (entry.name.endsWith(".hbs")) out.push({ full, rel });
  }
  return out;
}

function relToTarget(rel) {
  const stripped = rel.replace(/\.hbs$/, "");
  return `.cursor/${stripped}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const ctx = loadCtx(args.ctxPath, target);
  const templates = listTemplates(templatesDir);
  for (const t of templates) {
    const outPath = resolve(target, relToTarget(t.rel));
    if (existsSync(outPath) && !args.force) {
      console.error(`Refusing to overwrite ${outPath} (use --force)`);
      process.exit(2);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    const tpl = readFileSync(t.full, "utf-8");
    const rendered = render(tpl, ctx);
    writeFileSync(outPath, rendered);
    console.log(`wrote ${outPath}`);
  }
  console.log(`done — detected ${ctx.stack}${ctx.runtime ? ` (on ${ctx.runtime})` : ""}`);
}

main();
