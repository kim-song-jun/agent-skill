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

// harness-floor-* and harness-thrift-* plugins keep render.mjs at bin/lib/
// (only used by bin/init.mjs install renderer; detect-stack not needed there).
const VENDORED_RENDER_ONLY = [
  "plugins/harness-floor-cursor/bin/lib",
  "plugins/harness-floor-copilot/bin/lib",
  "plugins/harness-floor-codex/bin/lib",
  "plugins/harness-floor-gemini/bin/lib",
  "plugins/harness-thrift/bin/lib",
  "plugins/harness-thrift-cursor/bin/lib",
  "plugins/harness-thrift-copilot/bin/lib",
  "plugins/harness-thrift-codex/bin/lib",
  "plugins/harness-thrift-gemini/bin/lib",
  "plugins/harness-explore/bin/lib",
  "plugins/harness-debug/bin/lib",
].map((p) => resolve(repoRoot, p));

const FILES = ["render.mjs", "detect-stack.mjs", "sentinel-merge.mjs", "folder-guides.mjs"];
const RENDER_ONLY_FILES = ["render.mjs"];

// Phase D config-loader.mjs propagation: canonical lives in harness-floor;
// vendored copies in agent-all-cursor and agent-all-copilot must match
// line-for-line per `tests/lib/cursor-agent-all-config-loader.test.mjs`.
const CONFIG_LOADER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/config-loader.mjs",
);
const CONFIG_LOADER_TARGETS = [
  "plugins/harness-floor-cursor/skills/agent-all-cursor/lib/config-loader.mjs",
  "plugins/harness-floor-copilot/skills/agent-all-copilot/lib/config-loader.mjs",
].map((p) => resolve(repoRoot, p));

// Codex keeps its own agent-all-codex skill path, but the changed-file
// classifier should remain line-for-line compatible with Claude agent-all.
const CHANGED_FILE_CLASSIFIER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs",
);
const CHANGED_FILE_CLASSIFIER_TARGETS = [
  "plugins/harness-floor-codex/skills/agent-all-codex/lib/changed-file-classifier.mjs",
].map((p) => resolve(repoRoot, p));

const FOUNDATION_CHECK_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/foundation-check.mjs",
);
const FOUNDATION_CHECK_TARGETS = [
  "plugins/harness-builder-codex/skills/codex-init/lib/foundation-check.mjs",
].map((p) => resolve(repoRoot, p));

const DOCTOR_CORE_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/doctor-core.mjs",
);
const DOCTOR_CORE_TARGETS = [
  "plugins/harness-builder-codex/skills/codex-init/lib/doctor-core.mjs",
].map((p) => resolve(repoRoot, p));

const HARNESS_CLEANER_SOURCE = resolve(
  repoRoot,
  "plugins/harness-builder/skills/agent-init/lib/harness-cleaner.mjs",
);
const HARNESS_CLEANER_TARGETS = [
  "plugins/harness-builder-codex/skills/codex-init/lib/harness-cleaner.mjs",
].map((p) => resolve(repoRoot, p));

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
  // agent-all config-loader.mjs (one source → two vendored copies).
  const cfgSrc = readOrNull(CONFIG_LOADER_SOURCE);
  if (cfgSrc == null) {
    console.error(`Source missing: ${CONFIG_LOADER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of CONFIG_LOADER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "config-loader.mjs", dest: destPath, reason: "missing", sourceContent: cfgSrc });
    } else if (destContent !== cfgSrc) {
      drift.push({ file: "config-loader.mjs", dest: destPath, reason: "diverged", sourceContent: cfgSrc });
    }
  }
  // agent-all changed-file-classifier.mjs (Claude source → Codex vendored copy).
  const classifierSrc = readOrNull(CHANGED_FILE_CLASSIFIER_SOURCE);
  if (classifierSrc == null) {
    console.error(`Source missing: ${CHANGED_FILE_CLASSIFIER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of CHANGED_FILE_CLASSIFIER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "changed-file-classifier.mjs", dest: destPath, reason: "missing", sourceContent: classifierSrc });
    } else if (destContent !== classifierSrc) {
      drift.push({ file: "changed-file-classifier.mjs", dest: destPath, reason: "diverged", sourceContent: classifierSrc });
    }
  }
  // foundation-check.mjs (Claude source → Codex init copy).
  const foundationSrc = readOrNull(FOUNDATION_CHECK_SOURCE);
  if (foundationSrc == null) {
    console.error(`Source missing: ${FOUNDATION_CHECK_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of FOUNDATION_CHECK_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "foundation-check.mjs", dest: destPath, reason: "missing", sourceContent: foundationSrc });
    } else if (destContent !== foundationSrc) {
      drift.push({ file: "foundation-check.mjs", dest: destPath, reason: "diverged", sourceContent: foundationSrc });
    }
  }
  // doctor-core.mjs (Claude source → Codex init copy).
  const doctorCoreSrc = readOrNull(DOCTOR_CORE_SOURCE);
  if (doctorCoreSrc == null) {
    console.error(`Source missing: ${DOCTOR_CORE_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of DOCTOR_CORE_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "doctor-core.mjs", dest: destPath, reason: "missing", sourceContent: doctorCoreSrc });
    } else if (destContent !== doctorCoreSrc) {
      drift.push({ file: "doctor-core.mjs", dest: destPath, reason: "diverged", sourceContent: doctorCoreSrc });
    }
  }
  // harness-cleaner.mjs (Claude source → Codex init copy).
  const cleanerSrc = readOrNull(HARNESS_CLEANER_SOURCE);
  if (cleanerSrc == null) {
    console.error(`Source missing: ${HARNESS_CLEANER_SOURCE}`);
    process.exit(2);
  }
  for (const destPath of HARNESS_CLEANER_TARGETS) {
    const destContent = readOrNull(destPath);
    if (destContent == null) {
      drift.push({ file: "harness-cleaner.mjs", dest: destPath, reason: "missing", sourceContent: cleanerSrc });
    } else if (destContent !== cleanerSrc) {
      drift.push({ file: "harness-cleaner.mjs", dest: destPath, reason: "diverged", sourceContent: cleanerSrc });
    }
  }
  return drift;
}

function totalChecked() {
  return FILES.length * VENDORED_LIBS.length
    + RENDER_ONLY_FILES.length * VENDORED_RENDER_ONLY.length
    + CONFIG_LOADER_TARGETS.length
    + CHANGED_FILE_CLASSIFIER_TARGETS.length
    + FOUNDATION_CHECK_TARGETS.length
    + DOCTOR_CORE_TARGETS.length
    + HARNESS_CLEANER_TARGETS.length;
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
