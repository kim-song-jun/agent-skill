import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCostTracker,
  BudgetExceededError,
} from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/cost-tracker.mjs";

test("recordAgentCost: indexes by pageName", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", pageName: "home", payload: { costUSD: 1 } });
  t.recordAgentCost({ agentId: "b", pageName: "home", payload: { costUSD: 0.5 } });
  t.recordAgentCost({ agentId: "c", pageName: "about", payload: { costUSD: 0.25 } });
  assert.equal(t.pageCost("home"), 1.5);
  assert.equal(t.pageCost("about"), 0.25);
  assert.equal(t.totalCost(), 1.75);
});

test("estimate path runs when costUSD absent", () => {
  const t = createCostTracker();
  const e = t.recordAgentCost({
    agentId: "a", pageName: "home",
    payload: { output: "x".repeat(2000), model: "claude-haiku-4-5" },
  });
  assert.equal(e.source, "estimated");
  assert.ok(e.costUSD > 0);
});

test("checkBudget: throws BudgetExceededError when over", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", pageName: "home", payload: { costUSD: 10 } });
  assert.throws(() => t.checkBudget(5), BudgetExceededError);
});

test("snapshot + restore: round-trip", () => {
  const t = createCostTracker();
  t.recordAgentCost({ agentId: "a", pageName: "home", payload: { costUSD: 1 } });
  const snap = t.snapshot();
  const t2 = createCostTracker();
  t2.restore(snap);
  assert.equal(t2.totalCost(), 1);
  assert.equal(t2.pageCost("home"), 1);
});
