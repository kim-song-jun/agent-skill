#!/usr/bin/env node
// Sync vendored lib files from harness-builder/agent-init/lib/ to each
// cross-platform plugin's vendored lib directory. Run after touching any
// of the shared lib files.
//
// Usage:
//   node scripts/sync-lib.mjs           # copy + report
//   node scripts/sync-lib.mjs --check   # exit non-zero if any vendored copy diverges
//
// The shared lib lives in harness-builder by convention. If a future iteration
// promotes it to a top-level _core/ package, update SOURCE_LIB below.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const SOURCE_LIB = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib",
);

const VENDORED_LIBS = [
  "plugins/harness-builder-codex/skills/codex-init/lib",
  "plugins/harness-builder-copilot/skills/copilot-init/lib",
  "plugins/harness-builder-gemini/skills/gemini-init/lib",
  "plugins/harness-builder-cursor/skills/cursor-init/lib",
].map((p) => resolve(repoRoot, p));

// harness-floor-* plugins keep render.mjs at bin/lib/ (only used by
// bin/init.mjs install renderer; detect-stack not needed there).
const VENDORED_RENDER_ONLY = [
  "plugins/harness-floor-cursor/bin/lib",
  "plugins/harness-floor-copilot/bin/lib",
  "plugins/harness-floor-codex/bin/lib",
  "plugins/harness-floor-gemini/bin/lib",
  "plugins/harness-thrift/bin/lib",
].map((p) => resolve(repoRoot, p));

const FILES = ["render.mjs", "detect-stack.mjs"];
const RENDER_ONLY_FILES = ["render.mjs"];

function readOrNull(path) {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function collectDrift() {
  const drift = [];
  const all = [
    { files: FILES, dests: VENDORED_LIBS },
    { files: RENDER_ONLY_FILES, dests: VENDORED_RENDER_ONLY },
  ];
  for (const { files, dests } of all) {
    for (const file of files) {
      const sourcePath = resolve(SOURCE_LIB, file);
      const sourceContent = readOrNull(sourcePath);
      if (sourceContent == null) {
        console.error(`Source lib missing: ${sourcePath}`);
        process.exit(2);
      }
      for (const dest of dests) {
        const destPath = resolve(dest, file);
        const destContent = readOrNull(destPath);
        if (destContent == null) {
          drift.push({ file, dest: destPath, reason: "missing", sourceContent });
        } else if (destContent !== sourceContent) {
          drift.push({ file, dest: destPath, reason: "diverged", sourceContent });
        }
      }
    }
  }
  return drift;
}

function totalChecked() {
  return FILES.length * VENDORED_LIBS.length + RENDER_ONLY_FILES.length * VENDORED_RENDER_ONLY.length;
}

function checkMode() {
  const drift = collectDrift();
  if (drift.length > 0) {
    console.error("Vendor drift detected:");
    for (const d of drift) {
      console.error(`  ${d.reason}: ${d.dest}`);
    }
    console.error("\nRun: node scripts/sync-lib.mjs");
    process.exit(1);
  }
  console.log(`OK — ${totalChecked()} vendored files match source.`);
}

function syncMode() {
  const drift = collectDrift();
  if (drift.length === 0) {
    console.log(`OK — already in sync (${totalChecked()} files checked).`);
    return;
  }
  for (const d of drift) {
    writeFileSync(d.dest, d.sourceContent);
    console.log(`synced ${d.dest}`);
  }
  console.log(`Synced ${drift.length} file(s).`);
}

const args = process.argv.slice(2);
if (args.includes("--check")) checkMode();
else syncMode();
