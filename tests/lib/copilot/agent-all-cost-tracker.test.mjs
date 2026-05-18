import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCostTracker,
  BudgetExceededError,
  __internal,
} from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/cost-tracker.mjs";

test("recordAgentCost: uses declared costUSD when present", () => {
  const t = createCostTracker();
  const e = t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { costUSD: 0.42 } });
  assert.equal(e.source, "declared");
  assert.equal(e.costUSD, 0.42);
  assert.equal(t.waveCost(0), 0.42);
});

test("recordAgentCost: accepts alternate cost_usd / cost field", () => {
  const t = createCostTracker();
  const e1 = t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { cost_usd: 0.10 } });
  const e2 = t.recordAgentCost({ agentId: "b", waveIndex: 0, payload: { cost: 0.05 } });
  assert.equal(e1.source, "declared");
  assert.equal(e2.source, "declared");
  // Float-tolerant: 0.10 + 0.05 may surface as 0.15000000000000002.
  assert.ok(Math.abs(t.waveCost(0) - 0.15) < 1e-9);
});

test("recordAgentCost: estimates when costUSD absent", () => {
  const t = createCostTracker();
  const e = t.recordAgentCost({
    agentId: "a",
    waveIndex: 1,
    payload: { output: "x".repeat(10000), model: "claude-sonnet-4-6" },
  });
  assert.equal(e.source, "estimated");
  assert.ok(e.costUSD > 0);
});

test("recordAgentCost: declines negative or non-finite costUSD → estimate", () => {
  const t = createCostTracker();
  const eNeg = t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { costUSD: -1, output: "abc" } });
  assert.equal(eNeg.source, "estimated");
  const eNaN = t.recordAgentCost({ agentId: "b", waveIndex: 0, payload: { costUSD: NaN, output: "abc" } });
  assert.equal(eNaN.source, "estimated");
});

test("waveCost + totalCost: aggregate across waves", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { costUSD: 1 } });
  t.recordAgentCost({ agentId: "b", waveIndex: 0, payload: { costUSD: 2 } });
  t.recordAgentCost({ agentId: "c", waveIndex: 1, payload: { costUSD: 0.5 } });
  assert.equal(t.waveCost(0), 3);
  assert.equal(t.waveCost(1), 0.5);
  assert.equal(t.totalCost(), 3.5);
});

test("checkBudget: throws BudgetExceededError when over", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { costUSD: 10 } });
  assert.throws(() => t.checkBudget(5), BudgetExceededError);
  assert.equal(t.checkBudget(20), 10);
});

test("checkBudget: returns total when maxCostUSD not a number", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { costUSD: 1 } });
  assert.equal(t.checkBudget(), 1);
});

test("snapshot + restore: round-trips totals", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", waveIndex: 0, payload: { costUSD: 1.5 } });
  t.recordAgentCost({ agentId: "b", waveIndex: 1, payload: { costUSD: 2.0 } });
  const snap = t.snapshot();
  assert.equal(snap.totalCost, 3.5);

  const t2 = createCostTracker();
  t2.restore(snap);
  assert.equal(t2.totalCost(), 3.5);
  assert.equal(t2.waveCost(1), 2.0);
});

test("recordAgentCost: requires agentId", () => {
  const t = createCostTracker();
  assert.throws(() => t.recordAgentCost({ waveIndex: 0, payload: {} }), /agentId/);
});

test("estimateCost: uses default rate for unknown model", () => {
  const rate = __internal.DEFAULT_RATE_PER_KCHAR.default;
  const cost = __internal.estimateCost({ output: "x".repeat(1000), model: "weird-model" }, __internal.DEFAULT_RATE_PER_KCHAR);
  assert.ok(Math.abs(cost - rate) < 1e-6);
});
