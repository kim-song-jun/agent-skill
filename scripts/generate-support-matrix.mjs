#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "../plugins/harness-core/capabilities/catalog.mjs";
import { renderSupportMatrix } from "../plugins/harness-core/lib/platform-adapters/renderer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const target = resolve(repoRoot, "SUPPORT_MATRIX.md");
const expected = renderSupportMatrix({ capabilities: CAPABILITIES });

if (process.argv.includes("--print")) {
  process.stdout.write(expected);
} else if (process.argv.includes("--check")) {
  const current = existsSync(target) ? readFileSync(target, "utf-8") : "";
  if (current !== expected) {
    console.error("SUPPORT_MATRIX.md is stale. Run `node scripts/generate-support-matrix.mjs`.");
    process.exit(1);
  }
} else {
  writeFileSync(target, expected);
}
