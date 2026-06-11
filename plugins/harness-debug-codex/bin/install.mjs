#!/usr/bin/env node
// harness-debug-codex install — seeds the harness into a target project.
//
// Unlike harness-thrift (which patches settings.local.json with hooks),
// harness-debug-codex is fundamentally a per-session skill. The persistent file
// `.debug-state.json` is created on first `/debug` run, not at install
// time. So this installer primarily:
//
//   1. Verifies the target is a git repo (warn-only).
//   2. Installs `.codex/skills/debug-codex/` into the target project.
//   3. Creates `.debug-artifacts/` and `.agent-skill/reports/debug/` directories so
//      Phase 1 and Phase 5 have somewhere to write.
//   4. Writes a `.gitignore` entry for `.debug-artifacts/` so the
//      raw logs don't pollute commits.
//   5. Optionally seeds `.agent-skill/reports/debug/index.md`.
//
// Usage:
//   node plugins/harness-debug-codex/bin/install.mjs <target> [--ctx <path>]
//                                                             [--dry-run]
//                                                             [--no-gitignore]
//                                                             [--force]

import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_SOURCE = resolve(SCRIPT_DIR, "..", "skills", "debug-codex");

function parseArgs(argv) {
  const args = { target: null, ctx: null, dryRun: false, noGitignore: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-gitignore") args.noGitignore = true;
    else if (a === "--force") args.force = true;
    else if (a === "--ctx") {
      const next = argv[++i];
      if (!next || next.startsWith("--")) {
        console.error("Missing value for --ctx");
        printUsage();
        process.exit(1);
      }
      args.ctx = next;
    }
    else if (a.startsWith("--ctx=")) args.ctx = a.slice("--ctx=".length);
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
  console.error("Usage: install.mjs <target> [--ctx <path>] [--dry-run] [--no-gitignore] [--force]");
}

function ensureDir(target, sub, dryRun) {
  const p = resolve(target, sub);
  if (existsSync(p)) {
    console.log(`exists ${p}`);
    return;
  }
  if (dryRun) {
    console.log(`would create ${p}`);
    return;
  }
  mkdirSync(p, { recursive: true });
  console.log(`created ${p}`);
}

function installSkill(target, { dryRun, force }) {
  const dest = resolve(target, ".codex/skills/debug-codex");
  if (!existsSync(SKILL_SOURCE)) {
    console.error(`Error: source skill directory missing: ${SKILL_SOURCE}`);
    process.exit(2);
  }
  if (existsSync(dest) && !force) {
    console.log(`exists ${dest}`);
    return;
  }
  if (dryRun) {
    console.log(`${existsSync(dest) ? "would replace" : "would install"} ${dest}`);
    return;
  }
  mkdirSync(resolve(target, ".codex/skills"), { recursive: true });
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(SKILL_SOURCE, dest, { recursive: true });
  console.log(`${force ? "replaced" : "installed"} ${dest}`);
}

const GITIGNORE_BLOCK = `
# harness-debug-codex raw artifacts (state file IS tracked; raw logs are not)
.debug-artifacts/
.debug-state.json.tmp-*
`;

function patchGitignore(target, dryRun) {
  const gi = resolve(target, ".gitignore");
  let existing = "";
  if (existsSync(gi)) {
    existing = readFileSync(gi, "utf-8");
    if (existing.includes(".debug-artifacts/")) {
      console.log(`skip .gitignore (already patched)`);
      return;
    }
  }
  const next = existing + (existing.endsWith("\n") || existing.length === 0 ? "" : "\n") + GITIGNORE_BLOCK;
  if (dryRun) {
    console.log(`would patch ${gi} (+${GITIGNORE_BLOCK.length} bytes)`);
    return;
  }
  writeFileSync(gi, next);
  console.log(`patched ${gi}`);
}

function seedDebugIndex(target, dryRun) {
  const p = resolve(target, ".agent-skill/reports/debug/index.md");
  if (existsSync(p)) {
    console.log(`exists ${p}`);
    return;
  }
  const content = `# Debug log index

Each entry below was produced by Phase 5 of the \`/debug\` skill.
Search this file with grep before opening a fresh investigation —
prior root causes often repeat across related bugs.

<!-- entries appended chronologically by /debug Phase 5 -->
`;
  if (dryRun) {
    console.log(`would write ${p}`);
    return;
  }
  writeFileSync(p, content);
  console.log(`wrote ${p}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const gitDir = join(target, ".git");
  if (!existsSync(gitDir)) {
    console.warn(`warn: ${target} is not a git repo (tree-hash checkpoints will be skipped)`);
  }

  ensureDir(target, ".debug-artifacts", args.dryRun);
  ensureDir(target, ".agent-skill/reports/debug", args.dryRun);
  installSkill(target, { dryRun: args.dryRun, force: args.force });

  if (!args.noGitignore) {
    patchGitignore(target, args.dryRun);
  }

  seedDebugIndex(target, args.dryRun);

  console.log("");
  console.log("Debug install summary:");
  console.log(`  target:       ${target}`);
  console.log(`  skill:        .codex/skills/debug-codex/`);
  console.log(`  artifacts:    .debug-artifacts/   (raw logs land here at Phase 1)`);
  console.log(`  docs:         .agent-skill/reports/debug/         (debug-log.md land here at Phase 5)`);
  console.log(`  gitignore:    ${args.noGitignore ? "skipped" : "patched (.debug-artifacts/)"}`);
  console.log(`  state file:   .debug-state.json   (created on first /debug run)`);
  console.log(`  dry-run:      ${args.dryRun ? "yes" : "no"}`);
  console.log(`  force:        ${args.force ? "yes" : "no"}`);
  console.log("");
  console.log("Type run /debug \"<failing command>\" in Codex to start an investigation.");
}

main();
