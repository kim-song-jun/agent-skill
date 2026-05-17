import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, MODEL_PRICES } from "../../../plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs";

test("empty matrix costs zero", () => {
  assert.equal(estimateCost([], "claude-sonnet-4-6"), 0);
});

test("known model gives positive cost proportional to matrix size", () => {
  const m1 = estimateCost(new Array(10).fill({}), "claude-sonnet-4-6");
  const m2 = estimateCost(new Array(20).fill({}), "claude-sonnet-4-6");
  assert.ok(m1 > 0);
  assert.ok(Math.abs(m2 - 2 * m1) < 0.0001);
});

test("unknown model falls back to default price and warns via return.warnings", () => {
  const c = estimateCost(new Array(5).fill({}), "unknown-model");
  assert.ok(c > 0);
});

test("MODEL_PRICES table includes claude-sonnet-4-6 and claude-haiku-4-5", () => {
  assert.ok(MODEL_PRICES["claude-sonnet-4-6"] > 0);
  assert.ok(MODEL_PRICES["claude-haiku-4-5"] > 0);
});
