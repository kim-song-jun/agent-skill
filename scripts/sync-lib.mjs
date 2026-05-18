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

const FILES = ["render.mjs", "detect-stack.mjs"];

function readOrNull(path) {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function checkMode() {
  const drift = [];
  for (const file of FILES) {
    const sourcePath = resolve(SOURCE_LIB, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source lib missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of VENDORED_LIBS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent == null) {
        drift.push({ file, dest: destPath, reason: "missing" });
      } else if (destContent !== sourceContent) {
        drift.push({ file, dest: destPath, reason: "diverged" });
      }
    }
  }
  if (drift.length > 0) {
    console.error("Vendor drift detected:");
    for (const d of drift) {
      console.error(`  ${d.reason}: ${d.dest}`);
    }
    console.error("\nRun: node scripts/sync-lib.mjs");
    process.exit(1);
  }
  console.log(`OK — ${FILES.length * VENDORED_LIBS.length} vendored files match source.`);
}

function syncMode() {
  let copied = 0;
  for (const file of FILES) {
    const sourcePath = resolve(SOURCE_LIB, file);
    const sourceContent = readOrNull(sourcePath);
    if (sourceContent == null) {
      console.error(`Source lib missing: ${sourcePath}`);
      process.exit(2);
    }
    for (const dest of VENDORED_LIBS) {
      const destPath = resolve(dest, file);
      const destContent = readOrNull(destPath);
      if (destContent !== sourceContent) {
        writeFileSync(destPath, sourceContent);
        console.log(`synced ${destPath}`);
        copied++;
      }
    }
  }
  if (copied === 0) {
    console.log(`OK — already in sync (${FILES.length * VENDORED_LIBS.length} files checked).`);
  } else {
    console.log(`Synced ${copied} file(s).`);
  }
}

const args = process.argv.slice(2);
if (args.includes("--check")) checkMode();
else syncMode();
