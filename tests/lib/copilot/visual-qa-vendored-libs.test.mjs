// Vendored-lib sync check for visual-qa-copilot.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = ["config-loader.mjs", "matrix-builder.mjs", "cost-estimator.mjs", "diff-runs.mjs"];
const SOURCE = "plugins/harness-floor/skills/visual-qa/lib";
const VENDORED = "plugins/harness-floor-copilot/skills/visual-qa-copilot/lib";

for (const f of FILES) {
  test(`visual-qa-copilot vendored ${f} matches source-of-truth`, () => {
    const src = readFileSync(resolve(SOURCE, f), "utf-8");
    const dst = readFileSync(resolve(VENDORED, f), "utf-8");
    assert.equal(dst, src, `${f} diverged — re-vendor from ${SOURCE}`);
  });
}

test("visual-qa-copilot matrix-builder: builds matrix from config", async () => {
  const { buildMatrix } = await import(`../../../${VENDORED}/matrix-builder.mjs`);
  const m = buildMatrix({
    breakpoints: [{ name: "desktop", width: 1280, height: 800 }],
    pages: [{ name: "home", path: "/", components: [] }],
  });
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, "page");
});

test("visual-qa-copilot cost-estimator: returns positive cost", async () => {
  const { estimateCost } = await import(`../../../${VENDORED}/cost-estimator.mjs`);
  assert.ok(estimateCost([{}, {}, {}], "claude-sonnet-4-6") > 0);
});

test("visual-qa-copilot diff-runs: detects new/resolved/unchanged", async () => {
  const { diffRuns } = await import(`../../../${VENDORED}/diff-runs.mjs`);
  const current = [
    { page: "p", component: "c", state: "default", bp: "d", category: "a11y", description: "x" },
  ];
  const prior = { issues: [
    { page: "p", component: "c", state: "default", bp: "d", category: "layout", description: "y" },
  ] };
  const d = diffRuns(current, prior);
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 1);
  assert.equal(d.unchanged.length, 0);
});
