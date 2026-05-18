// Tests for the cost-accumulator lib (agent-all-gemini and visual-qa-gemini).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AGENT_ALL_COST = "plugins/harness-floor-gemini/skills/agent-all-gemini/lib/cost-accumulator.mjs";
const VISUAL_QA_COST = "plugins/harness-floor-gemini/skills/visual-qa-gemini/lib/cost-accumulator.mjs";

test("vendored copies of cost-accumulator match byte-for-byte", () => {
  const a = readFileSync(resolve(AGENT_ALL_COST), "utf-8");
  const b = readFileSync(resolve(VISUAL_QA_COST), "utf-8");
  assert.equal(a, b, "agent-all-gemini and visual-qa-gemini copies of cost-accumulator diverged");
});

test("extractCost: explicit costUSD field wins", async () => {
  const { extractCost } = await import(`../../${AGENT_ALL_COST}`);
  const c = extractCost({ costUSD: 0.123 });
  assert.equal(c.source, "explicit");
  assert.equal(c.costUSD, 0.123);
});

test("extractCost: snake_case cost_usd also recognised", async () => {
  const { extractCost } = await import(`../../${AGENT_ALL_COST}`);
  const c = extractCost({ cost_usd: 0.456 });
  assert.equal(c.source, "explicit");
  assert.equal(c.costUSD, 0.456);
});

test("extractCost: usage tokens × rate path (gemini-2.5-pro)", async () => {
  const { extractCost, DEFAULT_RATES } = await import(`../../${AGENT_ALL_COST}`);
  const c = extractCost({
    model: "gemini-2.5-pro",
    usage: { input_tokens: 1_000_000, output_tokens: 500_000 },
  });
  assert.equal(c.source, "tokens");
  const expected = 1_000_000 * DEFAULT_RATES["gemini-2.5-pro"].input
    + 500_000 * DEFAULT_RATES["gemini-2.5-pro"].output;
  assert.equal(c.costUSD, expected);
});

test("extractCost: accepts alternate token keys (prompt_tokens, completion_tokens)", async () => {
  const { extractCost } = await import(`../../${AGENT_ALL_COST}`);
  const c = extractCost({
    model: "gemini-2.5-flash",
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  });
  assert.equal(c.source, "tokens");
  assert.ok(c.costUSD > 0);
});

test("extractCost: transcript-length fallback when no tokens/cost", async () => {
  const { extractCost, FALLBACK_CHAR_RATE } = await import(`../../${AGENT_ALL_COST}`);
  const transcript = "x".repeat(1000);
  const c = extractCost({ transcript });
  assert.equal(c.source, "fallback");
  assert.equal(c.costUSD, 1000 * FALLBACK_CHAR_RATE);
});

test("extractCost: empty/null payload → source: none", async () => {
  const { extractCost } = await import(`../../${AGENT_ALL_COST}`);
  assert.equal(extractCost(null).source, "none");
  assert.equal(extractCost({}).source, "none");
});

test("estimateFromTranscript: text length × fallback rate", async () => {
  const { estimateFromTranscript, FALLBACK_CHAR_RATE } = await import(`../../${AGENT_ALL_COST}`);
  const r = estimateFromTranscript("a".repeat(500));
  assert.equal(r.source, "fallback");
  assert.equal(r.costUSD, 500 * FALLBACK_CHAR_RATE);
  assert.equal(estimateFromTranscript("").costUSD, 0);
});

test("CostAccumulator: tracks total and breakdown", async () => {
  const { CostAccumulator } = await import(`../../${AGENT_ALL_COST}`);
  const acc = new CostAccumulator({ maxCostUSD: 1.0 });
  acc.add(1, { costUSD: 0.3 });
  acc.add(2, { costUSD: 0.2 });
  acc.add(3, { transcript: "hello world" });
  const s = acc.summary();
  assert.equal(s.taskCount, 3);
  assert.ok(s.totalUSD >= 0.5);
  assert.equal(s.bySource.explicit, 2);
  assert.equal(s.bySource.fallback, 1);
});

test("CostAccumulator: detects over-budget at first crossing task", async () => {
  const { CostAccumulator } = await import(`../../${AGENT_ALL_COST}`);
  const acc = new CostAccumulator({ maxCostUSD: 0.5 });
  acc.add("a", { costUSD: 0.3 });
  assert.equal(acc.isOverBudget(), false);
  acc.add("b", { costUSD: 0.4 });
  assert.equal(acc.isOverBudget(), true);
  const s = acc.summary();
  assert.equal(s.overBudget, true);
  assert.equal(s.overBudgetAt.taskId, "b");
  // Subsequent adds should NOT clobber overBudgetAt (first-crossing semantics).
  acc.add("c", { costUSD: 0.1 });
  assert.equal(acc.summary().overBudgetAt.taskId, "b");
});

test("accumulate: convenience wrapper returns summary", async () => {
  const { accumulate } = await import(`../../${AGENT_ALL_COST}`);
  const s = accumulate([
    { taskId: 1, payload: { costUSD: 0.1 } },
    { taskId: 2, payload: { costUSD: 0.2 } },
  ], { maxCostUSD: 1.0 });
  assert.equal(s.taskCount, 2);
  assert.equal(s.totalUSD.toFixed(2), "0.30");
});

test("custom modelRates override DEFAULT_RATES", async () => {
  const { extractCost } = await import(`../../${AGENT_ALL_COST}`);
  const c = extractCost(
    { model: "exotic", usage: { input_tokens: 1000, output_tokens: 1000 } },
    { modelRates: { exotic: { input: 1, output: 2 }, default: { input: 0, output: 0 } } },
  );
  assert.equal(c.source, "tokens");
  assert.equal(c.costUSD, 1000 * 1 + 1000 * 2);
});
