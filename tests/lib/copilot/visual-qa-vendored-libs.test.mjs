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
  assert.deepEqual(m[0], { kind: "page", page: "home", bp: "desktop" });
});

test("visual-qa-copilot cost-estimator: returns model-specific per-capture cost", async () => {
  const { estimateCost, MODEL_PRICES } = await import(`../../../${VENDORED}/cost-estimator.mjs`);
  // 3 captures × sonnet rate — confirms model lookup and multiplication, not just any positive number.
  const sonnetRate = MODEL_PRICES["claude-sonnet-4-6"];
  assert.equal(estimateCost([{}, {}, {}], "claude-sonnet-4-6"), 3 * sonnetRate);
  // Verify a different model produces a different (and correct) cost.
  const haikuRate = MODEL_PRICES["claude-haiku-4-5"];
  assert.equal(estimateCost([{}], "claude-haiku-4-5"), haikuRate);
});

test("visual-qa-copilot diff-runs: detects new/resolved/unchanged", async () => {
  const { diffRuns } = await import(`../../../${VENDORED}/diff-runs.mjs`);
  const currentIssue = { page: "p", component: "c", state: "default", bp: "d", category: "a11y", description: "x" };
  const priorIssue = { page: "p", component: "c", state: "default", bp: "d", category: "layout", description: "y" };
  const current = [currentIssue];
  const prior = { issues: [priorIssue] };
  const d = diffRuns(current, prior);
  // Counts correct.
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 1);
  assert.equal(d.unchanged.length, 0);
  // Items are correctly bucketed — the a11y issue is new, the layout issue is resolved.
  assert.equal(d.new[0].category, "a11y", "new bucket must contain the current a11y issue");
  assert.equal(d.resolved[0].category, "layout", "resolved bucket must contain the prior layout issue");
});
