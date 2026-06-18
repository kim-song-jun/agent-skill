#!/usr/bin/env node
// harness-thrift-codex install — automated Phase 0–2 renderer.
//
// Renders `.thrift.json` (Phase 1) + the TOML hook snippets (Phase 2)
// into a target project + optionally patches `~/.codex/config.toml`
// (or a user-supplied path via --config) so the hooks register.
//
// Usage:
//   node plugins/harness-thrift-codex/bin/install.mjs <target> \
//        [--ctx ctx.json] [--config <path-to-codex-config.toml>] \
//        [--force] [--dry-run] [--no-instrument]
//
// What gets installed to <target>:
//   .thrift.json                                       (config seed)
//   .codex/skills/thrift/                              (project-local skill)
//   .codex/hooks/thrift-*.toml                         (rendered TOML snippets — for reference)
//
// And — unless --no-instrument:
//   <codex-config.toml>                                (append-patched with the 5 thrift hook snippets)
//
// Note: this installer renders the project-local config seed and TOML
// registration snippets. Global Codex config patching remains explicit:
// pass --config or run without --no-instrument only after the target
// config exists and command-hook instrumentation is approved.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { render } from "./lib/render.mjs";
import { patchCodexConfig, buildStandardThriftCodexHooks } from "../skills/thrift-codex/lib/settings-patcher.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const SKILL_ROOT = resolve(pluginRoot, "skills/thrift-codex");
const SKILL_DEST = ".codex/skills/thrift";
const HOOK_TEMPLATES_DIR = resolve(SKILL_ROOT, "templates/hooks");
const CONFIG_TEMPLATE = resolve(SKILL_ROOT, "templates/thrift.config.json.hbs");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    target: null,
    ctxPath: null,
    configPath: null,
    force: false,
    dryRun: false,
    noInstrument: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ctx") args.ctxPath = argv[++i];
    else if (a === "--config") args.configPath = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-instrument") args.noInstrument = true;
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
    "Usage: install.mjs <target> [--ctx ctx.json] [--config <path>] [--force] [--dry-run] [--no-instrument]",
  );
}

function loadCtx(ctxPath, { hooksDir }) {
  const base = {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    summariserModel: "gpt-5-nano",
    cachePrimingStrategy: "tools-only",
    date: todayISO(),
    hooksDir,
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
    return rendered;
  }
  mkdirSync(dirname(dstPath), { recursive: true });
  writeFileSync(dstPath, rendered);
  console.log(`wrote ${dstPath}`);
  return rendered;
}

function installSkill({ target, force, dryRun }) {
  const dstPath = resolve(target, SKILL_DEST);
  if (existsSync(dstPath) && !force) {
    console.error(`Refusing to overwrite ${dstPath} (use --force)`);
    process.exit(2);
  }
  if (dryRun) {
    console.log(`${existsSync(dstPath) ? "would replace" : "would install"} ${dstPath}`);
    return;
  }
  mkdirSync(dirname(dstPath), { recursive: true });
  if (existsSync(dstPath)) rmSync(dstPath, { recursive: true, force: true });
  cpSync(SKILL_ROOT, dstPath, { recursive: true });
  console.log(`${force ? "replaced" : "installed"} ${dstPath}`);
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

  installSkill({ target, force: args.force, dryRun: args.dryRun });

  // 1. Render config seed
  writeRendered({
    srcPath: CONFIG_TEMPLATE,
    dstPath: resolve(target, ".thrift.json"),
    ctx,
    force: args.force,
    dryRun: args.dryRun,
  });

  // 2. Render TOML hook snippets (for reference + as the source of
  //    truth for what was patched into config.toml).
  const hookFiles = readdirSync(HOOK_TEMPLATES_DIR).filter((n) => n.endsWith(".toml.hbs"));
  const renderedSnippets = {};
  for (const f of hookFiles) {
    const dstName = f.replace(/\.hbs$/, "");
    const rendered = writeRendered({
      srcPath: resolve(HOOK_TEMPLATES_DIR, f),
      dstPath: resolve(hooksDir, dstName),
      ctx,
      force: args.force,
      dryRun: args.dryRun,
    });
    // Key by the filename without extension; matches the sentinel name.
    const key = dstName.replace(/\.toml$/, "");
    renderedSnippets[key] = rendered;
  }

  // 2b. Render the executable hook bodies. The TOML snippets register
  //     `node "<hooksDir>/thrift-*.mjs"`, so these .mjs files must exist or
  //     every hook fails with "Cannot find module". They are self-contained
  //     (no plugin-lib imports) so they run from the project's .codex/hooks/.
  const hookBodies = readdirSync(HOOK_TEMPLATES_DIR).filter((n) => n.endsWith(".mjs.hbs"));
  for (const f of hookBodies) {
    writeRendered({
      srcPath: resolve(HOOK_TEMPLATES_DIR, f),
      dstPath: resolve(hooksDir, f.replace(/\.hbs$/, "")),
      ctx,
      force: args.force,
      dryRun: args.dryRun,
    });
  }

  // 3. Patch ~/.codex/config.toml (or --config <path>) with the snippets.
  let patched = false;
  let applied = 0;
  let skipped = 0;
  const codexConfigPath = args.configPath
    ? resolve(args.configPath)
    : resolve(homedir(), ".codex/config.toml");

  if (!args.noInstrument) {
    if (!existsSync(codexConfigPath)) {
      console.error(
        `Cannot patch ${codexConfigPath}: file does not exist. Run \`codex\` once to seed it, then re-run with --no-instrument removed (or pass --config <path>).`,
      );
      process.exit(3);
    }
    if (args.dryRun) {
      const res = patchCodexConfig({ configPath: codexConfigPath, hooksToAdd: renderedSnippets, dryRun: true });
      applied = res.applied;
      skipped = res.skipped;
      console.log(`would patch ${codexConfigPath}: applied=${applied}, skipped=${skipped}`);
    } else {
      const res = patchCodexConfig({ configPath: codexConfigPath, hooksToAdd: renderedSnippets });
      applied = res.applied;
      skipped = res.skipped;
      console.log(`patched ${codexConfigPath}: applied=${applied}, skipped=${skipped}`);
    }
    patched = true;
  }

  console.log("");
  console.log("Thrift-codex install summary:");
  console.log(`  target:       ${target}`);
  console.log(`  skill:        ${SKILL_DEST}/`);
  console.log(`  config:       .thrift.json`);
  console.log(`  snippets:     ${hookFiles.length} TOML snippet(s) + ${hookBodies.length} hook body .mjs in .codex/hooks/`);
  console.log(`  codex config: ${codexConfigPath}`);
  console.log(`  instrument:   ${patched ? `yes (applied=${applied}, skipped=${skipped})` : "no (--no-instrument)"}`);
  console.log(`  dry-run:      ${args.dryRun ? "yes" : "no"}`);
  console.log("");
  console.log("Next steps:");
  if (patched) {
    console.log("  - Inspect the applied thrift sentinels in the Codex config before relying on them.");
    console.log("  - Run a small Codex command-hook smoke test for this machine.");
  } else {
    console.log("  - Review the generated TOML snippets in .codex/hooks/.");
    console.log("  - Merge them into Codex config only after global command-hook instrumentation is approved.");
  }
}

main();
