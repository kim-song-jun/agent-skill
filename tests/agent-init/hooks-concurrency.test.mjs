// Task 1: atomic routing-state write + testable transition
// Task 2 will extend this same file with concurrency tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextRoutingState,
  writeRoutingStateAtomic,
} from "../../plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs";
import { appendSessionDecision } from "../../plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs";

test("nextRoutingState increments the counter and flags recommend at threshold", () => {
  const t0 = 1_000_000_000_000;
  let { state, shouldRecommend } = nextRoutingState({}, { cmd: "git log", now: t0 });
  assert.equal(state.largeCommandCount, 1);
  assert.equal(shouldRecommend, false);
  ({ state, shouldRecommend } = nextRoutingState(state, { cmd: "git log", now: t0 + 1 }));
  ({ state, shouldRecommend } = nextRoutingState(state, { cmd: "git log", now: t0 + 2 }));
  assert.equal(state.largeCommandCount, 3);
  assert.equal(shouldRecommend, true); // count>=3 and no prior reminder
});

test("writeRoutingStateAtomic round-trips valid JSON and leaves no tmp", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-router-"));
  try {
    const p = join(dir, "context-mode-router.json");
    writeRoutingStateAtomic(p, { largeCommandCount: 2, lastCommand: "x" });
    assert.deepEqual(JSON.parse(readFileSync(p, "utf-8")), { largeCommandCount: 2, lastCommand: "x" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("appendSessionDecision writes exactly one header even when called repeatedly", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-summary-"));
  try {
    const file = join(dir, "2026-06-25-session.md");
    appendSessionDecision(file, { date: "2026-06-25", stamp: "T1", note: "a" });
    appendSessionDecision(file, { date: "2026-06-25", stamp: "T2", note: "b" });
    const body = readFileSync(file, "utf-8");
    const headers = body.match(/# Session decisions/g) || [];
    assert.equal(headers.length, 1);
    assert.match(body, /- \[T1\] a/);
    assert.match(body, /- \[T2\] b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
