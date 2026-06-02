#!/usr/bin/env node
// harness-thrift-gemini install — automated Phase 0–2 renderer for the
// Gemini CLI port.
//
// Replaces the manual walkthrough of `/thrift-gemini` phases by rendering
// `.thrift.json` + the standard hook scripts into a target project and
// (optionally) patching `~/.gemini/settings.json` so the hooks fire.
//
// Usage:
//   node plugins/harness-thrift-gemini/bin/install.mjs <target> \
//        [--ctx ctx.json] [--force] [--dry-run] [--no-instrument] \
//        [--settings <path>]    # override ~/.gemini/settings.json
//
// What gets installed to <target>:
//   .thrift.json                                       (config seed)
//   .gemini/hooks/thrift-*.mjs                         (4 hook scripts, chmod +x)
//   .gemini/hooks/lib/*.mjs                            (lib modules the hooks import)
//   .gemini/hooks/audit-report.md.hbs                  (audit template)
//
// And — unless --no-instrument:
//   ~/.gemini/settings.json (or --settings target)     (patched via append-only buildStandardThriftGeminiHooks)
//
// Hook import-path rewrite: hook templates `import("../../lib/<x>.mjs")`
// because in the plugin source layout they live at
// `plugins/harness-thrift-gemini/skills/thrift-gemini/templates/hooks/`
// and need to reach `skills/thrift-gemini/lib/`. After install, hooks
// live at `<target>/.gemini/hooks/` and lib siblings at
// `<target>/.gemini/hooks/lib/`. (Currently the rendered hooks don't use
// `../../lib/` paths — they're self-contained — so the rewrite is a
// no-op preserved for future expansion.)

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { render } from "./lib/render.mjs";
import { patchSettings, buildStandardThriftGeminiHooks } from "../skills/thrift-gemini/lib/settings-patcher.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const SKILL_ROOT = resolve(pluginRoot, "skills/thrift-gemini");
const HOOK_TEMPLATES_DIR = resolve(SKILL_ROOT, "templates/hooks");
const CONFIG_TEMPLATE = resolve(SKILL_ROOT, "templates/thrift.config.json.hbs");
const AUDIT_TEMPLATE = resolve(SKILL_ROOT, "templates/audit-report.md.hbs");
const LIB_DIR = resolve(SKILL_ROOT, "lib");
const VENDORED_RENDER = resolve(pluginRoot, "bin/lib/render.mjs");

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {
    target: null,
    ctxPath: null,
    force: false,
    dryRun: false,
    noInstrument: false,
    settingsPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ctx") args.ctxPath = argv[++i];
    else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--no-instrument") args.noInstrument = true;
    else if (a === "--settings") args.settingsPath = argv[++i];
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
    "Usage: install.mjs <target> [--ctx ctx.json] [--force] [--dry-run] [--no-instrument] [--settings <path>]",
  );
}

function loadCtx(ctxPath) {
  const base = {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    summariserModel: "gemini-flash",
    cachePrimingStrategy: "tools-only",
    vertexMinTokenThreshold: 32000,
    vertexStorageTimeHours: 1,
    vertexTier: "paid",
    date: todayISO(),
  };
  if (ctxPath) {
    const file = JSON.parse(readFileSync(ctxPath, "utf-8"));
    return { ...base, ...file };
  }
  return base;
}

function writeRendered({ srcPath, dstPath, ctx, force, dryRun, executable = false, postProcess = null }) {
  if (existsSync(dstPath) && !force) {
    console.error(`Refusing to overwrite ${dstPath} (use --force)`);
    process.exit(2);
  }
  const tpl = readFileSync(srcPath, "utf-8");
  let rendered = render(tpl, ctx);
  if (postProcess) rendered = postProcess(rendered);
  if (dryRun) {
    console.log(`would write ${dstPath} (${rendered.length} bytes)`);
    return;
  }
  mkdirSync(dirname(dstPath), { recursive: true });
  writeFileSync(dstPath, rendered);
  if (executable) {
    try { chmodSync(dstPath, 0o755); } catch { /* non-fatal on platforms without chmod */ }
  }
  console.log(`wrote ${dstPath}`);
}

function copyFile({ srcPath, dstPath, dryRun }) {
  if (dryRun) {
    console.log(`would copy ${srcPath} → ${dstPath}`);
    return;
  }
  mkdirSync(dirname(dstPath), { recursive: true });
  writeFileSync(dstPath, readFileSync(srcPath));
  console.log(`copied ${dstPath}`);
}

function printManualHooksSnippet(hooks) {
  console.log("");
  console.log("# Merge the following into ~/.gemini/settings.json (hooks):");
  console.log(JSON.stringify({ hooks }, null, 2));
}

function rewriteHookImports(src) {
  return src
    .replace(/"\.\.\/\.\.\/lib\//g, '"./lib/')
    .replace(/"\.\.\/audit-report\.md\.hbs"/g, '"./audit-report.md.hbs"');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = resolve(args.target);
  if (!existsSync(target)) {
    console.error(`Error: target directory does not exist: ${target}`);
    process.exit(1);
  }
  const ctx = loadCtx(args.ctxPath);

  // 1. Render config seed
  writeRendered({
    srcPath: CONFIG_TEMPLATE,
    dstPath: resolve(target, ".thrift.json"),
    ctx,
    force: args.force,
    dryRun: args.dryRun,
  });

  // 2. Render hook scripts (with import path rewrite) + chmod
  const hooksDir = resolve(target, ".gemini/hooks");
  const hookFiles = readdirSync(HOOK_TEMPLATES_DIR).filter((n) => n.endsWith(".mjs.hbs"));
  for (const f of hookFiles) {
    const dstName = f.replace(/\.hbs$/, "");
    writeRendered({
      srcPath: resolve(HOOK_TEMPLATES_DIR, f),
      dstPath: resolve(hooksDir, dstName),
      ctx,
      force: args.force,
      dryRun: args.dryRun,
      executable: true,
      postProcess: rewriteHookImports,
    });
  }

  // 3. Copy lib modules (raw, no rendering).
  const libDst = join(hooksDir, "lib");
  const libFiles = readdirSync(LIB_DIR).filter((n) => n.endsWith(".mjs"));
  for (const f of libFiles) {
    copyFile({
      srcPath: resolve(LIB_DIR, f),
      dstPath: resolve(libDst, f),
      dryRun: args.dryRun,
    });
  }
  copyFile({
    srcPath: VENDORED_RENDER,
    dstPath: resolve(libDst, "render.mjs"),
    dryRun: args.dryRun,
  });

  // 4. Copy audit-report template.
  copyFile({
    srcPath: AUDIT_TEMPLATE,
    dstPath: resolve(hooksDir, "audit-report.md.hbs"),
    dryRun: args.dryRun,
  });

  // 5. Patch ~/.gemini/settings.json with the standard thrift-gemini hooks.
  let patched = false;
  let applied = 0;
  let skipped = 0;
  if (!args.noInstrument) {
    const settingsPath = args.settingsPath
      ? resolve(args.settingsPath)
      : resolve(homedir(), ".gemini", "settings.json");
    const hooks = buildStandardThriftGeminiHooks({ hooksDir });
    if (args.dryRun) {
      try {
        const res = patchSettings({ settingsPath, hooksToAdd: hooks, dryRun: true });
        applied = res.applied;
        skipped = res.skipped;
      } catch (e) {
        console.error(`patch (dry-run) failed: ${e.message}`);
      }
      console.log(`would patch ${settingsPath}: applied=${applied}, skipped=${skipped}`);
    } else {
      mkdirSync(dirname(settingsPath), { recursive: true });
      const res = patchSettings({ settingsPath, hooksToAdd: hooks });
      applied = res.applied;
      skipped = res.skipped;
      console.log(`patched ${settingsPath}: applied=${applied}, skipped=${skipped}`);
    }
    patched = true;
  } else {
    const hooks = buildStandardThriftGeminiHooks({ hooksDir });
    printManualHooksSnippet(hooks);
  }

  console.log("");
  console.log("Thrift-gemini install summary:");
  console.log(`  target:      ${target}`);
  console.log(`  config:      .thrift.json`);
  console.log(`  hooks:       ${hookFiles.length} script(s) in .gemini/hooks/`);
  console.log(`  lib copied:  ${libFiles.length + 1} module(s) in .gemini/hooks/lib/`);
  console.log(`  instrument:  ${patched ? `yes (applied=${applied}, skipped=${skipped})` : "no (--no-instrument)"}`);
  console.log(`  dry-run:     ${args.dryRun ? "yes" : "no"}`);
  if (patched && !args.dryRun) {
    console.log("");
    console.log("  NOTE: ~/.gemini/settings.json is USER-SCOPE. Hooks now");
    console.log("  affect ALL Gemini sessions, not just this project.");
    console.log("  Revert via: /thrift-gemini uninstall (or unpatchSettings).");
  }
}

main();
