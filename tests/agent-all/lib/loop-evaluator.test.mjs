import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLoop } from "../../../plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs";

function mockRunner(exitSequence) {
  let i = 0;
  return () => ({ exitCode: exitSequence[i++] });
}

test("breakCondition exits 0 once, stableIters=1 → break after 1 pass", () => {
  const state = { iter: 0, consecutivePass: 0, costUSD: 0 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "break");
});

test("breakCondition exits non-0 → continue", () => {
  const state = { iter: 0, consecutivePass: 0, costUSD: 0 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "continue");
  assert.equal(verdict.consecutivePass, 0);
});

test("stableIters=2 requires 2 consecutive passes", () => {
  let state = { iter: 0, consecutivePass: 0, costUSD: 0 };
  let verdict = evaluateLoop(state, { stableIters: 2, maxIter: 5, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "continue");
  assert.equal(verdict.consecutivePass, 1);

  state = { ...state, consecutivePass: 1, iter: 1 };
  verdict = evaluateLoop(state, { stableIters: 2, maxIter: 5, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "break");
});

test("maxIter exhausted → exhausted action with exit code 3", () => {
  const state = { iter: 5, consecutivePass: 0, costUSD: 0 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "exhausted");
  assert.equal(verdict.exitCode, 3);
});

test("maxCostUSD exceeded → exhausted with exit code 3", () => {
  const state = { iter: 1, consecutivePass: 0, costUSD: 101 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "exhausted");
});
