#!/usr/bin/env node
// Shell-callable Claude project bootstrapper for release fixtures and
// non-interactive installs. The interactive /agent-init skill remains the
// primary Claude Code entrypoint.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProject } from "../skills/agent-init/lib/detect-stack.mjs";
import {
  FOUNDATION_MARKETPLACES,
  FOUNDATION_PLUGINS,
  scanFoundationState,
} from "../skills/agent-init/lib/foundation-check.mjs";
import { detectGuideDirs } from "../skills/agent-init/lib/folder-guides.mjs";
import { mergeSettings } from "../skills/agent-init/lib/manifest-merge.mjs";
import { render } from "../skills/agent-init/lib/render.mjs";
import { mergeSentinelSection, SENTINEL } from "../skills/agent-init/lib/sentinel-merge.mjs";
import { printHuman, runDoctor } from "../skills/agent-init/lib/doctor-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const repoRoot = resolve(pluginRoot, "../..");
const templatesDir = resolve(pluginRoot, "skills/agent-init/templates");

const BASE_AGENTS = [
  { name: "planner", when: "decompose a request into a plan" },
  { name: "dev", when: "implement a feature/bugfix via TDD" },
  { name: "reviewer", when: "review against the spec before merging" },
];

const OPERATIONAL_AGENTS = [
  { name: "orchestrator", when: "wave ownership and HOT-file detection" },
  { name: "frontend-dev", when: "frontend UI, client logic, styling" },
  { name: "backend-dev", when: "backend APIs, services, migrations" },
  { name: "integration-dev", when: "cross-stack wiring and API contracts" },
  { name: "verification-reviewer", when: "tests, typecheck, lint, diff scope" },
  { name: "qa-reviewer", when: "user-flow and persona validation" },
  { name: "design-reviewer", when: "UI hierarchy and design tokens" },
  { name: "security-reviewer", when: "authz, secrets, destructive actions" },
  { name: "data-reviewer", when: "migrations, seeds, fixtures, backfills" },
];

const OPERATIONAL_WORKSPACE_FILES = [
  "docs/superpowers/specs/.gitkeep",
  "docs/superpowers/plans/.gitkeep",
  "docs/decisions/.gitkeep",
  "docs/tasks/.gitkeep",
];

const LANGUAGE_VALUES = new Set(["en", "ko", "auto"]);
const USAGE = "Usage: init.mjs <target-project-dir> [--ctx <ctx.json>] [--force] [--lite|--theme=lite] [--lang=en|ko|auto] [--dry-run] [--update-foundations] [--no-doctor]";

function printHelp() {
  console.log([
    USAGE,
    "",
    "Options:",
    "  --ctx <ctx.json>        Read scaffold context from a JSON file.",
    "  --force                 Overwrite non-mergeable generated files.",
    "  --lite                  Lightweight scaffold: CLAUDE.md, AGENTS.md, base agents, and non-policy hooks.",
    "  --theme=lite            Legacy alias for --lite.",
    "  --theme=floor           Legacy alias for the default operational profile.",
    "  --lang=en|ko|auto       Persist interaction language in generated guidance.",
    "  --dry-run               Print planned writes without creating files.",
    "  --update-foundations    Update/install approved foundation plugins after printing the plan.",
    "  --no-doctor             Skip the automatic post-install doctor check.",
    "  -h, --help              Show this help.",
  ].join("\n"));
}

function parseLanguageArg(value) {
  if (!LANGUAGE_VALUES.has(value)) {
    console.error("--lang must be one of: en, ko, auto");
    process.exit(1);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    target: null,
    ctxPath: null,
    force: false,
    lite: false,
    dryRun: false,
    updateFoundations: false,
    noDoctor: false,
    lang: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ctx") args.ctxPath = argv[++i];
    else if (arg.startsWith("--ctx=")) args.ctxPath = arg.slice("--ctx=".length);
    else if (arg === "--force") args.force = true;
    else if (arg === "--lite") args.lite = true;
    else if (arg === "--theme=lite") args.lite = true;
    else if (arg === "--theme=floor") args.lite = false;
    else if (arg === "--theme" && argv[i + 1] === "lite") {
      args.lite = true;
      i += 1;
    } else if (arg === "--theme" && argv[i + 1] === "floor") {
      args.lite = false;
      i += 1;
    } else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--update-foundations") args.updateFoundations = true;
    else if (arg === "--no-doctor") args.noDoctor = true;
    else if (arg.startsWith("--lang=")) args.lang = parseLanguageArg(arg.slice("--lang=".length));
    else if (arg === "--lang") args.lang = parseLanguageArg(argv[++i]);
    else if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      console.error(USAGE);
      process.exit(1);
    } else if (!args.target) {
      args.target = arg;
    }
  }
  if (!args.target && !args.help) {
    console.error(USAGE);
    process.exit(1);
  }
  return args;
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

function splitList(value, fallback = ["general"]) {
  const list = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
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
  const fileCtx = ctxPath ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
  const detected = detectProject(target);
  const lite = Boolean(options.lite);
  const interactionLang = resolveLanguage(options.lang ?? fileCtx.language ?? "auto");
  const qaPersonas = Array.isArray(fileCtx.qa_personas)
    ? fileCtx.qa_personas.map(String).map((item) => item.trim()).filter(Boolean)
    : splitList(fileCtx.qa_personas ?? process.env.QA_PERSONAS);
  const foundationState = scanFoundationState({
    installedPluginIds: loadInstalledPluginIds(),
  });
  return {
    purpose: process.env.PURPOSE || "Project",
    size: process.env.SIZE || "medium",
    deploy_targets: process.env.DEPLOY_TARGETS || "",
    constraints: process.env.CONSTRAINTS || "",
    baseUrl: "http://localhost:3000",
    model: "claude-sonnet-4-6",
    maxIter: 10,
    maxCostUSD: 500,
    waveSize: "medium",
    breakCondition: "npm test",
    ...fileCtx,
    ...detected,
    qa_personas: qaPersonas,
    target_path: target,
    interactionLang,
    language: interactionLang,
    operationalProfile: !lite,
    liteProfile: lite,
    floorTheme: !lite,
    degradedFoundations: !lite && foundationState.degraded,
    foundationMissing: foundationState.missing.join(", "),
    foundationUpdateCommand: foundationState.updateCommand,
    foundationInstructions: foundationState.instructions,
    services_str: detected.services.join(", "),
    agents: lite ? BASE_AGENTS : [...BASE_AGENTS, ...OPERATIONAL_AGENTS],
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
  if (rel.startsWith("local-guides/")) return true;
  if (!ctx.liteProfile) return false;
  return rel === "templates/task-ledger/agent-task-ledger-check.mjs"
    || rel.startsWith("task-ledger/")
    || rel === "hooks/agent-policy-hook.mjs"
    || rel.startsWith("agents/orchestrator.")
    || rel.startsWith("agents/integration-dev.")
    || rel.startsWith("agents/verification-reviewer.")
    || rel.startsWith("agents/qa-reviewer.")
    || rel.startsWith("agents/design-reviewer.")
    || rel.startsWith("agents/security-reviewer.")
    || rel.startsWith("agents/data-reviewer.");
}

function agentNames(ctx) {
  return new Set(ctx.agents.map((agent) => agent.name));
}

function relToTarget(rel, ctx) {
  const stripped = rel.replace(/\.hbs$/, "");
  if (stripped === "CLAUDE.md") return "CLAUDE.md";
  if (stripped === "AGENTS.md") return "AGENTS.md";
  if (stripped === "settings.local.json") return ".claude/settings.local.json";
  if (stripped.startsWith("agents/")) {
    const name = stripped.slice("agents/".length).replace(/\.md$/, "");
    if (!agentNames(ctx).has(name)) return false;
    return `.claude/agents/${name}.md`;
  }
  if (stripped === "hooks/context-mode-router.mjs") return ".claude/hooks/context-mode-router.mjs";
  if (stripped === "hooks/session-summary.mjs") return ".claude/hooks/session-summary.mjs";
  if (stripped === "hooks/cache-heal.mjs") return ".claude/hooks/cache-heal.mjs";
  if (stripped === "hooks/agent-policy-hook.mjs") return ".claude/hooks/agent-policy-hook.mjs";
  if (stripped === "task-ledger/CLAUDE.md") return "docs/tasks/CLAUDE.md";
  if (stripped === "task-ledger/index.md") return "docs/tasks/index.md";
  if (stripped === "task-ledger/_template.md") return "docs/tasks/_template.md";
  if (stripped === "task-ledger/_handoff-template.md") return "docs/tasks/_handoff-template.md";
  if (stripped === "task-ledger/agent-task-ledger-check.mjs") return "scripts/agent-task-ledger-check.mjs";
  return `.claude/${stripped}`;
}

function isMergeableGuide(rel) {
  return rel === "CLAUDE.md" || rel === "AGENTS.md" || rel.endsWith("/CLAUDE.md") || rel.endsWith("/AGENTS.md");
}

function stripTemplateSentinel(rendered) {
  const start = rendered.indexOf(SENTINEL.start);
  const end = rendered.indexOf(SENTINEL.end);
  if (start === -1 && end === -1) return rendered;
  if (start === -1 || end === -1 || end < start) {
    throw new Error("incomplete sentinel section in rendered guide");
  }
  return rendered.slice(start + SENTINEL.start.length, end).trim();
}

function finalRenderedGuide(existing, rendered) {
  if (existing === null) return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
  return mergeSentinelSection(existing, stripTemplateSentinel(rendered)).content;
}

function parseJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function buildWrites(target, ctx) {
  const planned = [];
  for (const template of listTemplates(templatesDir)) {
    if (shouldSkipTemplate(template.rel, ctx)) continue;
    const rel = relToTarget(template.rel, ctx);
    if (rel === false) continue;
    const tpl = readFileSync(template.full, "utf-8");
    planned.push({
      rel,
      outPath: resolve(target, rel),
      rendered: template.rel.endsWith(".mjs") ? tpl : render(tpl, ctx),
      kind: rel === ".claude/settings.local.json" ? "settings" : "text",
    });
  }

  if (ctx.operationalProfile) {
    for (const rel of OPERATIONAL_WORKSPACE_FILES) {
      planned.push({ rel, outPath: resolve(target, rel), rendered: "", kind: "text" });
    }
    const claudeGuide = readFileSync(resolve(templatesDir, "local-guides/CLAUDE.md.hbs"), "utf-8");
    const agentsGuide = readFileSync(resolve(templatesDir, "local-guides/AGENTS.md.hbs"), "utf-8");
    for (const guide of detectGuideDirs(target)) {
      planned.push({
        rel: `${guide.path}/CLAUDE.md`,
        outPath: resolve(target, guide.path, "CLAUDE.md"),
        rendered: render(claudeGuide, { ...ctx, guidePath: guide.path, guide_path: guide.path, guide_reason: guide.reason }),
        kind: "text",
      });
      planned.push({
        rel: `${guide.path}/AGENTS.md`,
        outPath: resolve(target, guide.path, "AGENTS.md"),
        rendered: render(agentsGuide, { ...ctx, guidePath: guide.path, guide_path: guide.path, guide_reason: guide.reason }),
        kind: "text",
      });
    }
    planned.push({
      rel: ".visual-qa.json",
      outPath: resolve(target, ".visual-qa.json"),
      rendered: render(readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs"), "utf-8"), ctx),
      kind: "text",
    });
    planned.push({
      rel: ".agent-all.json",
      outPath: resolve(target, ".agent-all.json"),
      rendered: render(readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs"), "utf-8"), ctx),
      kind: "text",
    });
  }

  return planned.map((write) => {
    if (write.kind === "settings" && existsSync(write.outPath)) {
      const current = parseJsonFile(write.outPath, write.rel);
      const additions = JSON.parse(write.rendered);
      return {
        ...write,
        rendered: `${JSON.stringify(mergeSettings(current, additions), null, 2)}\n`,
        action: "merge",
        merged: true,
      };
    }
    if (isMergeableGuide(write.rel) && existsSync(write.outPath)) {
      return {
        ...write,
        rendered: finalRenderedGuide(readFileSync(write.outPath, "utf-8"), write.rendered),
        action: "merge",
        merged: true,
      };
    }
    return { ...write, action: "write", merged: false };
  });
}

function printFoundationUpdatePlan({ dryRun = false } = {}) {
  console.log("foundation update plan");
  console.log(`  - refresh approved foundation marketplaces: ${FOUNDATION_MARKETPLACES.join(", ")}`);
  console.log(`  - update/install approved foundations: ${FOUNDATION_PLUGINS.join(", ")}`);
  console.log("  - no global CLI config files are patched by this command");
  if (!dryRun) return;
  for (const marketplace of FOUNDATION_MARKETPLACES) {
    console.log(`DRY-RUN: claude plugin marketplace update ${marketplace}`);
  }
  for (const plugin of FOUNDATION_PLUGINS) {
    console.log(`DRY-RUN: claude plugin install ${plugin}`);
  }
}

function runClaudePlugin(args, { allowFailure = false } = {}) {
  const result = spawnSync("claude", ["plugin", ...args], { encoding: "utf-8" });
  if (result.error?.code === "ENOENT") {
    console.error("Error: 'claude' binary not found in PATH.");
    console.error("Install Claude Code first, or run these commands inside Claude Code:");
    for (const marketplace of FOUNDATION_MARKETPLACES) console.error(`  /plugin marketplace update ${marketplace}`);
    for (const plugin of FOUNDATION_PLUGINS) console.error(`  /plugin install ${plugin}`);
    process.exit(1);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (!allowFailure && result.status !== 0) return false;
  return true;
}

function runFoundationUpdates(installedPluginIds = []) {
  let failed = false;
  for (const marketplace of FOUNDATION_MARKETPLACES) {
    failed = !runClaudePlugin(["marketplace", "update", marketplace]) || failed;
  }
  for (const plugin of FOUNDATION_PLUGINS) {
    if (installedPluginIds.includes(plugin)) {
      runClaudePlugin(["uninstall", plugin], { allowFailure: true });
    }
    failed = !runClaudePlugin(["install", plugin]) || failed;
  }
  if (failed) {
    console.error("Error: one or more approved foundation plugin updates failed.");
    process.exit(1);
  }
}

function runPostInstallDoctor(target, profile) {
  console.log("");
  console.log("Post-install doctor");
  const result = runDoctor({ target, platform: "claude", profile });
  printHuman(result);
  if (!result.ok) process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const ctx = loadCtx(args.ctxPath, target, { lite: args.lite, lang: args.lang });
  if (args.updateFoundations) printFoundationUpdatePlan({ dryRun: args.dryRun });

  const writes = buildWrites(target, ctx);
  if (!args.force && !args.dryRun) {
    const conflict = writes.find(({ outPath, merged }) => !merged && existsSync(outPath));
    if (conflict) {
      console.error(`Refusing to overwrite ${conflict.outPath} (use --force)`);
      process.exit(2);
    }
  }

  for (const { outPath, rendered, action, merged } of writes) {
    if (args.dryRun) {
      console.log(`dry-run: would ${merged ? action : "write"} ${outPath}`);
      continue;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rendered);
    console.log(`wrote ${outPath}`);
  }

  if (args.updateFoundations && !args.dryRun) {
    runFoundationUpdates(loadInstalledPluginIds());
  }

  if (!args.noDoctor && !args.dryRun) {
    runPostInstallDoctor(target, args.lite ? "lite" : "operational");
  }

  console.log(`done - detected ${ctx.stack}${ctx.runtime ? ` (on ${ctx.runtime})` : ""}`);
}

main();
