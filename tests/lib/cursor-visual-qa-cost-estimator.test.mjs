import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estimateCost, MODEL_PRICES } from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/cost-estimator.mjs";

const SOURCE = resolve("plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs");
const VENDORED = resolve("plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/cost-estimator.mjs");

test("vendored copy retains source code", () => {
  const src = readFileSync(SOURCE, "utf-8");
  const ven = readFileSync(VENDORED, "utf-8");
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    assert.ok(ven.includes(line), `vendored cost-estimator.mjs missing: ${line}`);
  }
});

test("empty matrix = 0", () => {
  assert.equal(estimateCost([], "claude-sonnet-4-6"), 0);
});

test("MODEL_PRICES includes sonnet + haiku", () => {
  assert.ok(MODEL_PRICES["claude-sonnet-4-6"] > 0);
  assert.ok(MODEL_PRICES["claude-haiku-4-5"] > 0);
});

test("unknown model falls back to default price", () => {
  // DEFAULT_PRICE is 0.012 — contract is that unknown models use the same
  // per-capture rate as sonnet, not just any positive number.
  const c = estimateCost(new Array(5).fill({}), "unknown-model");
  assert.equal(c, 5 * MODEL_PRICES["claude-sonnet-4-6"],
    "unknown model should fall back to the same price as claude-sonnet-4-6 (DEFAULT_PRICE)");
});
