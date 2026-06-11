import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFailureSignature,
  evaluateLoop,
  formatMaxIter,
  isUnlimitedMaxIter,
} from "../../../plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs";

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

test("maxIter 0 and null mean unlimited while bounded maxIter still exhausts", () => {
  assert.equal(isUnlimitedMaxIter(0), true);
  assert.equal(isUnlimitedMaxIter(null), true);
  assert.equal(isUnlimitedMaxIter(5), false);
  assert.equal(formatMaxIter(0), "unlimited");

  const state = { iter: 500, consecutivePass: 0, costUSD: 0 };
  let verdict = evaluateLoop(state, { stableIters: 1, maxIter: 0, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "continue");
  assert.equal(verdict.exitCode, 1);
  assert.equal(verdict.loopState.maxIterMode, "unlimited");

  verdict = evaluateLoop(state, { stableIters: 1, maxIter: null, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "break");
});

test("cost budget stops unlimited loop before running break condition", () => {
  let calls = 0;
  const verdict = evaluateLoop(
    { iter: 500, consecutivePass: 0, costUSD: 100 },
    { stableIters: 1, maxIter: 0, maxCostUSD: 100 },
    () => {
      calls++;
      return { exitCode: 0 };
    },
  );

  assert.equal(calls, 0);
  assert.equal(verdict.action, "exhausted");
  assert.equal(verdict.reason, "cost_budget_exhausted");
});

test("cost telemetry summary drives loop budget checks", () => {
  let calls = 0;
  const verdict = evaluateLoop(
    {
      iter: 2,
      consecutivePass: 0,
      costUSD: 0,
      costTelemetry: {
        summary: {
          totalUSD: 10,
          calls: 2,
          budget: { status: "exceeded", maxCostUSD: 10 },
        },
      },
    },
    { stableIters: 1, maxIter: 0, maxCostUSD: 10 },
    () => {
      calls++;
      return { exitCode: 0 };
    },
  );

  assert.equal(calls, 0);
  assert.equal(verdict.action, "exhausted");
  assert.equal(verdict.loopState.costUSD, 10);
  assert.equal(verdict.loopState.costTelemetry.totalUSD, 10);
});

test("time budget stops unlimited loop before running break condition", () => {
  let calls = 0;
  const verdict = evaluateLoop(
    {
      iter: 20,
      consecutivePass: 0,
      costUSD: 0,
      loopStartedAt: "2026-06-11T00:00:00.000Z",
    },
    {
      stableIters: 1,
      maxIter: 0,
      maxCostUSD: 100,
      maxRuntimeSec: 60,
      now: "2026-06-11T00:01:00.000Z",
    },
    () => {
      calls++;
      return { exitCode: 0 };
    },
  );

  assert.equal(calls, 0);
  assert.equal(verdict.action, "exhausted");
  assert.equal(verdict.reason, "time_budget_exhausted");
  assert.equal(verdict.loopState.maxIterMode, "unlimited");
  assert.equal(verdict.loopState.maxRuntimeSec, 60);
  assert.equal(verdict.loopState.elapsedRuntimeSec, 60);
  assert.match(verdict.loopState.nextAction, /wall-clock time/);
});

test("hard policy hook block stops unlimited loop", () => {
  const verdict = evaluateLoop(
    { iter: 500, consecutivePass: 0, costUSD: 0 },
    { stableIters: 1, maxIter: 0, maxCostUSD: 100 },
    () => ({ exitCode: 1, hardPolicyBlocked: true }),
  );

  assert.equal(verdict.action, "blocked");
  assert.equal(verdict.exitCode, 4);
  assert.equal(verdict.reason, "hard_policy_hook_blocked");
  assert.match(verdict.loopState.nextAction, /planner\/user decision|hard policy/i);
});

test("repeated failure signature escalates to planner/user decision", () => {
  const state = {
    iter: 17,
    consecutivePass: 0,
    costUSD: 0,
    loop: { failureSignatures: { "pytest::test_login_timeout": 2 } },
  };
  const verdict = evaluateLoop(
    state,
    { stableIters: 1, maxIter: 0, maxCostUSD: 100, maxRepeatedFailureSignature: 3 },
    () => ({
      exitCode: 1,
      failureSignature: "pytest::test_login_timeout",
      verifierSummary: "pytest failed at login timeout",
      touchedFiles: ["tests/login.test.ts"],
    }),
  );

  assert.equal(verdict.action, "blocked");
  assert.equal(verdict.reason, "repeated_failure_signature");
  assert.equal(verdict.repeatedCount, 3);
  assert.equal(verdict.failureSignatures["pytest::test_login_timeout"], 3);
  assert.equal(verdict.loopState.lastFailureSignature, "pytest::test_login_timeout");
  assert.deepEqual(verdict.loopState.lastTouchedFiles, ["tests/login.test.ts"]);
  assert.match(verdict.nextAction, /planner\/user decision/);
});

test("computes stable failure signature from verifier summary and stderr", () => {
  assert.equal(
    computeFailureSignature({ verifierSummary: "pytest::test_login_timeout\nfull log" }),
    "pytest::test_login_timeout full log",
  );
  assert.equal(
    computeFailureSignature({ exitCode: 2, stderr: "\nTypeError: bad token\nstack" }),
    "TypeError: bad token",
  );
});
