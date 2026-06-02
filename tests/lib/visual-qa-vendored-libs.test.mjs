// Cross-platform vendoring check for the 6 new comprehensive-mode libs.
// Each platform sibling (cursor / copilot / codex / gemini) must carry
// a byte-identical copy of the source-of-truth file. Drift catches
// silent staleness when someone edits the source without re-syncing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LIBS = [
  "crawler.mjs",
  "dom-walker.mjs",
  "shallow-clicker.mjs",
  "dom-hash.mjs",
  "git-diff-scoper.mjs",
  "verdict.mjs",
];

const PLATFORMS = ["cursor", "copilot", "codex", "gemini"];
const CODEX_CORE_LIBS = [
  "config-loader.mjs",
  "matrix-builder.mjs",
  "cost-estimator.mjs",
  "diff-runs.mjs",
];

function sourcePath(lib) {
  return resolve("plugins/harness-floor/skills/visual-qa/lib", lib);
}
function vendoredPath(platform, lib) {
  return resolve(`plugins/harness-floor-${platform}/skills/visual-qa-${platform}/lib`, lib);
}

for (const platform of PLATFORMS) {
  for (const lib of LIBS) {
    test(`visual-qa-${platform}/lib/${lib} matches source-of-truth byte-for-byte`, () => {
      const src = readFileSync(sourcePath(lib), "utf-8");
      const ven = readFileSync(vendoredPath(platform, lib), "utf-8");
      assert.equal(ven, src, `visual-qa-${platform}/lib/${lib} drifted from source`);
    });
  }
}

for (const lib of CODEX_CORE_LIBS) {
  test(`visual-qa-codex/lib/${lib} carries the source-of-truth runtime helper`, () => {
    const src = readFileSync(sourcePath(lib), "utf-8");
    const ven = readFileSync(vendoredPath("codex", lib), "utf-8");
    assert.equal(ven, src, `visual-qa-codex/lib/${lib} missing or drifted from source`);
  });
}
