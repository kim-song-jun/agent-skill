#!/usr/bin/env node
// Shell-callable installer for harness-builder-gemini.
//
// Mirrors the harness-builder-cursor/bin/init.mjs pattern but writes
// Gemini CLI–specific paths:
//   templates/GEMINI.md.hbs                  -> <target>/GEMINI.md
//   templates/skills/<role>/SKILL.md.hbs     -> <target>/.gemini/skills/<role>/SKILL.md
//   templates/gemini-settings.json.hbs       -> printed to stdout (merge into
//                                               ~/.gemini/settings.json or
//                                               <target>/.gemini/settings.json)
//
// Gemini's settings snippet currently contains only mcpServers. We render to stdout
// rather than writing because users typically have an existing
// ~/.gemini/settings.json they need to merge into.
//
// Usage:
//   init.mjs <target-project-dir> [--ctx <ctx.json>] [--force]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../skills/gemini-init/lib/detect-stack.mjs";
import { render } from "../skills/gemini-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const templatesDir = resolve(pluginRoot, "skills/gemini-init/templates");

// Templates emitted to stdout (not written to disk) — user merges manually.
const STDOUT_TEMPLATES = new Set(["gemini-settings.json.hbs"]);

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
      { name: "planner",  when: "all planning" },
      { name: "dev",      when: "implementation" },
      { name: "reviewer", when: "final review" },
    ],
    mcp_servers_json_body:     "",
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

// Map a template's path (relative to templatesDir) to its target path on disk.
// Returns null for stdout-only templates.
function relToTarget(rel) {
  const base = rel.split("/").pop();
  if (STDOUT_TEMPLATES.has(base)) return null;
  const stripped = rel.replace(/\.hbs$/, "");
  if (stripped === "GEMINI.md") return "GEMINI.md";
  if (stripped.startsWith("skills/")) return `.gemini/${stripped}`;
  // Unknown layout — drop under .gemini/ to be safe.
  return `.gemini/${stripped}`;
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
  const stdoutChunks = [];
  for (const t of templates) {
    const tpl = readFileSync(t.full, "utf-8");
    const rendered = render(tpl, ctx);
    const rel = relToTarget(t.rel);
    if (rel === null) {
      stdoutChunks.push({ name: t.rel, body: rendered });
      continue;
    }
    const outPath = resolve(target, rel);
    if (existsSync(outPath) && !args.force) {
      console.error(`Refusing to overwrite ${outPath} (use --force)`);
      process.exit(2);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rendered);
    console.log(`wrote ${outPath}`);
  }
  for (const chunk of stdoutChunks) {
    console.log(`\n# ----- ${chunk.name} (merge into ~/.gemini/settings.json) -----`);
    console.log(chunk.body);
  }
  console.log(`done — detected ${ctx.stack}${ctx.runtime ? ` (on ${ctx.runtime})` : ""}`);
}

main();
