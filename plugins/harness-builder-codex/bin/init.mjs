#!/usr/bin/env node
// Shell-callable installer for harness-builder-codex.
//
// Mirrors the harness-builder-cursor/bin/init.mjs pattern but writes
// Codex-specific paths:
//   templates/AGENTS.md.hbs                  -> <target>/AGENTS.md
//   templates/skills/<role>/SKILL.md.hbs     -> <target>/.codex/skills/<role>/SKILL.md
//   templates/hooks/agent-policy-hook.mjs    -> <target>/.codex/hooks/agent-policy-hook.mjs
//   templates/codex-config.toml.hbs          -> printed to stdout (merge into
//                                               ~/.codex/config.toml)
//
// Quirk: Codex CLI does not have a separate settings file. All hook + MCP
// wiring lives in config.toml. We emit it to stdout so the user can review
// + merge into their existing config rather than blindly overwriting it.
//
// Usage:
//   init.mjs <target-project-dir> [--ctx <ctx.json>] [--force] [--lite|--theme=lite] [--lang=en|ko|auto] [--dry-run]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../skills/codex-init/lib/detect-stack.mjs";
import { scanFoundationState } from "../skills/codex-init/lib/foundation-check.mjs";
import { detectGuideDirs } from "../skills/codex-init/lib/folder-guides.mjs";
import { render } from "../skills/codex-init/lib/render.mjs";
import { mergeSentinelSection } from "../skills/codex-init/lib/sentinel-merge.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const templatesDir = resolve(pluginRoot, "skills/codex-init/templates");

// Templates emitted to stdout (not written to disk) — user merges manually.
const STDOUT_TEMPLATES = new Set(["codex-config.toml.hbs"]);
const FOLDER_GUIDE_TEMPLATE_REL = "folder-guides/AGENTS.md.hbs";
const OPERATIONAL_WORKSPACE_FILES = [
  "docs/superpowers/specs/.gitkeep",
  "docs/superpowers/plans/.gitkeep",
  "docs/decisions/.gitkeep",
  "docs/tasks/.gitkeep",
];

const BASE_AGENTS = [
  { name: "planner",  when: "all planning" },
  { name: "dev",      when: "implementation" },
  { name: "reviewer", when: "final review" },
];

const OPERATIONAL_AGENTS = [
  { name: "orchestrator",          when: "wave ownership and shared-tree safety" },
  { name: "verification-reviewer", when: "tests, typecheck, lint, diff scope" },
  { name: "qa-reviewer",           when: "user-flow and persona validation" },
  { name: "design-reviewer",       when: "UI hierarchy and design tokens" },
  { name: "security-reviewer",     when: "authz, secrets, destructive actions" },
  { name: "data-reviewer",         when: "migrations, seeds, fixtures, backfills" },
  { name: "integration-dev",        when: "cross-stack wiring and API contracts" },
];

const OPERATIONAL_SKILL_RE = /^skills\/(orchestrator|verification-reviewer|qa-reviewer|design-reviewer|security-reviewer|data-reviewer|integration-dev)\//;

const LANGUAGE_VALUES = new Set(["en", "ko", "auto"]);

function parseLanguageArg(value) {
  if (!LANGUAGE_VALUES.has(value)) {
    console.error("--lang must be one of: en, ko, auto");
    process.exit(1);
  }
  return value;
}

function detectLanguageFromEnv() {
  const explicit = process.env.AGENT_INIT_LANG;
  if (explicit === "en" || explicit === "ko") return explicit;
  const locale = [process.env.LANG, process.env.LC_ALL, process.env.LC_MESSAGES]
    .filter(Boolean)
    .join(" ");
  return /(^|[_.-])ko([_.-]|$)|Korean/i.test(locale) ? "ko" : "en";
}

function resolveLanguage(value) {
  if (!value || value === "auto") return detectLanguageFromEnv();
  return parseLanguageArg(value);
}

function parseArgs(argv) {
  const args = { target: null, ctxPath: null, force: false, lite: false, dryRun: false, lang: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ctx") args.ctxPath = argv[++i];
    else if (argv[i] === "--force") args.force = true;
    else if (argv[i] === "--lite") args.lite = true;
    else if (argv[i] === "--theme=lite") args.lite = true;
    else if (argv[i] === "--theme" && argv[i + 1] === "lite") {
      args.lite = true;
      i++;
    }
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i].startsWith("--lang=")) args.lang = parseLanguageArg(argv[i].slice("--lang=".length));
    else if (argv[i] === "--lang") args.lang = parseLanguageArg(argv[++i]);
    else if (!args.target) args.target = argv[i];
  }
  if (!args.target) {
    console.error("Usage: init.mjs <target-project-dir> [--ctx <ctx.json>] [--force] [--lite|--theme=lite] [--lang=en|ko|auto] [--dry-run]");
    process.exit(1);
  }
  return args;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function loadInstalledPluginIds(homeDir = process.env.HOME || process.env.USERPROFILE || "") {
  if (!homeDir) return [];
  const installedPath = resolve(homeDir, ".claude/plugins/installed_plugins.json");
  if (!existsSync(installedPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(installedPath, "utf-8"));
    const plugins = parsed && typeof parsed.plugins === "object" ? parsed.plugins : parsed;
    return plugins && typeof plugins === "object" ? Object.keys(plugins) : [];
  } catch {
    return [];
  }
}

function loadCtx(ctxPath, target, options = {}) {
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
  const lite = Boolean(options.lite);
  const language = resolveLanguage(options.lang ?? ctx.language ?? "auto");
  const foundationState = scanFoundationState({
    installedPluginIds: loadInstalledPluginIds(),
  });
  return {
    ...ctx,
    ...detected,
    target_path: target,
    language,
    operationalProfile: !lite,
    liteProfile: lite,
    degradedFoundations: !lite && foundationState.degraded,
    foundationMissing: foundationState.missing.join(", "),
    foundationInstructions: foundationState.instructions,
    services_str: detected.services.join(", "),
    agents: lite ? BASE_AGENTS : [...BASE_AGENTS, ...OPERATIONAL_AGENTS],
    hook_command_pretool_toml: tomlString(`node "$(git rev-parse --show-toplevel)/.codex/hooks/agent-policy-hook.mjs"`),
    hook_command_pretool_windows_toml: tomlString(`powershell -NoProfile -ExecutionPolicy Bypass -Command "node (Join-Path (git rev-parse --show-toplevel) '.codex/hooks/agent-policy-hook.mjs')"`),
    mcp_servers_block:         "",
  };
}

function listTemplates(dir, baseRel = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listTemplates(full, rel));
    else if (entry.name.endsWith(".hbs") || entry.name.endsWith(".mjs")) out.push({ full, rel });
  }
  return out;
}

function shouldSkipTemplate(rel, ctx) {
  if (rel === FOLDER_GUIDE_TEMPLATE_REL) return true;
  if (!ctx.liteProfile) return false;
  return rel.startsWith("hooks/")
    || rel.startsWith("local-guides/")
    || rel.startsWith("task-ledger/")
    || OPERATIONAL_SKILL_RE.test(rel);
}

function isMergeableGuide(rel) {
  return rel === "AGENTS.md" || rel.endsWith("/AGENTS.md");
}

// Map a template's path (relative to templatesDir) to its target path on disk.
// Returns null for stdout-only templates.
function relToTarget(rel) {
  const base = rel.split("/").pop();
  if (STDOUT_TEMPLATES.has(base)) return null;
  const stripped = rel.replace(/\.hbs$/, "");
  if (stripped === "AGENTS.md") return "AGENTS.md";
  if (stripped.startsWith("skills/")) return `.codex/${stripped}`;
  if (stripped === "hooks/agent-policy-hook.mjs") return ".codex/hooks/agent-policy-hook.mjs";
  if (stripped === "local-guides/AGENTS.md") return ".codex/AGENTS.md";
  if (stripped === "task-ledger/AGENTS.md") return "docs/tasks/AGENTS.md";
  if (stripped === "task-ledger/index.md") return "docs/tasks/index.md";
  if (stripped === "task-ledger/_template.md") return "docs/tasks/_template.md";
  if (stripped === "task-ledger/_handoff-template.md") return "docs/tasks/_handoff-template.md";
  if (stripped === "task-ledger/agent-task-ledger-check.mjs") return "scripts/agent-task-ledger-check.mjs";
  // Unknown layout — drop under .codex/ to be safe.
  return `.codex/${stripped}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const ctx = loadCtx(args.ctxPath, target, { lite: args.lite, lang: args.lang });
  const templates = listTemplates(templatesDir);
  const stdoutChunks = [];
  const plannedWrites = [];
  let skippedLiteConfig = false;
  for (const t of templates) {
    if (shouldSkipTemplate(t.rel, ctx)) continue;
    if (ctx.liteProfile && STDOUT_TEMPLATES.has(t.rel.split("/").pop())) {
      skippedLiteConfig = true;
      continue;
    }
    const tpl = t.body ?? readFileSync(t.full, "utf-8");
    const rendered = render(tpl, ctx);
    const rel = relToTarget(t.rel);
    if (rel === null) {
      stdoutChunks.push({ name: t.rel, body: rendered });
      continue;
    }
    const outPath = resolve(target, rel);
    plannedWrites.push({ rel, outPath, rendered });
  }
  if (ctx.operationalProfile) {
    for (const rel of OPERATIONAL_WORKSPACE_FILES) {
      plannedWrites.push({ rel, outPath: resolve(target, rel), rendered: "" });
    }

    const folderGuideTemplate = readFileSync(resolve(templatesDir, FOLDER_GUIDE_TEMPLATE_REL), "utf-8");
    for (const guide of detectGuideDirs(target)) {
      const rel = `${guide.path}/AGENTS.md`;
      plannedWrites.push({
        rel,
        outPath: resolve(target, rel),
        rendered: render(folderGuideTemplate, { ...ctx, guide_path: guide.path, guide_reason: guide.reason }),
      });
    }
  }

  const finalWrites = plannedWrites.map(({ rel, outPath, rendered }) => {
    if (isMergeableGuide(rel) && existsSync(outPath)) {
      const merged = mergeSentinelSection(readFileSync(outPath, "utf-8"), rendered);
      return { rel, outPath, rendered: merged.content, action: merged.action, merged: true };
    }
    return { rel, outPath, rendered, action: "write", merged: false };
  });

  if (!args.force && !args.dryRun) {
    const conflict = finalWrites.find(({ outPath, merged }) => !merged && existsSync(outPath));
    if (conflict) {
      console.error(`Refusing to overwrite ${conflict.outPath} (use --force)`);
      process.exit(2);
    }
  }

  for (const { outPath, rendered, action, merged } of finalWrites) {
    if (args.dryRun) {
      console.log(`dry-run: would ${merged ? action : "write"} ${outPath}`);
      continue;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rendered);
    console.log(`wrote ${outPath}`);
  }
  for (const chunk of stdoutChunks) {
    console.log(`\n# ----- ${chunk.name} (merge into ~/.codex/config.toml) -----`);
    console.log(chunk.body);
  }
  if (skippedLiteConfig) {
    console.log("lite mode: skipped Codex global config patch output");
  }
  console.log(`done — detected ${ctx.stack}${ctx.runtime ? ` (on ${ctx.runtime})` : ""}`);
}

main();
