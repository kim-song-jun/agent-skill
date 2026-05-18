#!/usr/bin/env node
// harness-thrift-copilot install — automated Phase 0–2 renderer.
//
// Replaces the manual walkthrough of `/thrift-copilot` phases by rendering
// `.thrift.json` + the standard hook scripts into a target project and
// (optionally) patching `.github/hooks/thrift-*.json` so the hooks fire.
//
// Usage:
//   node plugins/harness-thrift-copilot/bin/install.mjs <target> \
//        [--ctx ctx.json] [--force] [--dry-run] [--no-instrument]
//
// What gets installed to <target>:
//   .thrift.json                                              (config seed)
//   .github/hooks/thrift-<event>.json                         (4 hook registrations)
//   .github/hooks/scripts/thrift-*.mjs                        (5 hook scripts, chmod +x)
//   .github/hooks/scripts/lib/*.mjs                           (lib modules the hooks import)
//   .github/hooks/scripts/audit-report.md.hbs                 (audit template the audit hook reads)
//
// Important note on hook import paths:
//   The hook script templates `import("../../lib/<x>.mjs")` because in
//   the plugin source layout they live at
//   `plugins/harness-thrift-copilot/skills/thrift-copilot/templates/hooks/scripts/`
//   and need to reach `plugins/.../skills/thrift-copilot/lib/`. After
//   install, hooks live at `<target>/.github/hooks/scripts/` and their
//   lib siblings live at `<target>/.github/hooks/scripts/lib/`, so we
//   string-replace `"../../lib/` to `"./lib/` in the rendered hook
//   output. Same trick for `"../audit-report.md.hbs"` →
//   `"./audit-report.md.hbs"`.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, chmodSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./lib/render.mjs";
import { patchHooks, buildStandardThriftHooks } from "../skills/thrift-copilot/lib/settings-patcher.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const SKILL_ROOT = resolve(pluginRoot, "skills/thrift-copilot");
const HOOK_REG_TEMPLATES_DIR = resolve(SKILL_ROOT, "templates/hooks");
const HOOK_SCRIPT_TEMPLATES_DIR = resolve(SKILL_ROOT, "templates/hooks/scripts");
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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ctx") args.ctxPath = argv[++i];
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
    "Usage: install.mjs <target> [--ctx ctx.json] [--force] [--dry-run] [--no-instrument]",
  );
}

function loadCtx(ctxPath) {
  const base = {
    everyNTurns: 25,
    everyMTokensOutput: 30000,
    summariserModel: "gpt-5-nano",
    cachePrimingStrategy: "intermediated",
    storeMemoryEnabled: true,
    storeMemoryScope: "repository",
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
  const hooksDir = resolve(target, ".github/hooks");
  const scriptsDir = resolve(hooksDir, "scripts");

  const scriptTemplates = readdirSync(HOOK_SCRIPT_TEMPLATES_DIR).filter((n) => n.endsWith(".mjs.hbs"));
  for (const f of scriptTemplates) {
    const dstName = f.replace(/\.hbs$/, "");
    writeRendered({
      srcPath: resolve(HOOK_SCRIPT_TEMPLATES_DIR, f),
      dstPath: resolve(scriptsDir, dstName),
      ctx,
      force: args.force,
      dryRun: args.dryRun,
      executable: true,
      postProcess: rewriteHookImports,
    });
  }

  // 3. Copy lib modules (raw, no rendering) so the hooks'
  //    rewritten `import("./lib/<x>.mjs")` resolves at runtime.
  const libDst = join(scriptsDir, "lib");
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

  // 4. Copy audit-report template (audit hook reads it at runtime).
  copyFile({
    srcPath: AUDIT_TEMPLATE,
    dstPath: resolve(scriptsDir, "audit-report.md.hbs"),
    dryRun: args.dryRun,
  });

  // 5. Patch .github/hooks/thrift-*.json with the standard thrift hooks (Phase 2).
  let patched = false;
  let applied = 0;
  let skipped = 0;
  if (!args.noInstrument) {
    const hooks = buildStandardThriftHooks({ hooksScriptsDir: scriptsDir });
    if (args.dryRun) {
      const res = patchHooks({ hooksDir, hooksToAdd: hooks, dryRun: true });
      applied = res.applied;
      skipped = res.skipped;
      console.log(`would patch ${hooksDir}/thrift-*.json: applied=${applied}, skipped=${skipped}`);
    } else {
      mkdirSync(hooksDir, { recursive: true });
      const res = patchHooks({ hooksDir, hooksToAdd: hooks });
      applied = res.applied;
      skipped = res.skipped;
      console.log(`patched ${hooksDir}/thrift-*.json: applied=${applied}, skipped=${skipped}`);
    }
    patched = true;
  }

  console.log("");
  console.log("Thrift-copilot install summary:");
  console.log(`  target:        ${target}`);
  console.log(`  config:        .thrift.json`);
  console.log(`  hook scripts:  ${scriptTemplates.length} script(s) in .github/hooks/scripts/`);
  console.log(`  lib copied:    ${libFiles.length + 1} module(s) in .github/hooks/scripts/lib/`);
  console.log(`  instrument:    ${patched ? `yes (applied=${applied}, skipped=${skipped})` : "no (--no-instrument)"}`);
  console.log(`  dry-run:       ${args.dryRun ? "yes" : "no"}`);
}

main();
