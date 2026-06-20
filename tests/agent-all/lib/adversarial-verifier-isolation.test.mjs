// tests/agent-all/lib/adversarial-verifier-isolation.test.mjs
//
// G5 — Composition proof: G1 (adversarialVerify) + G4 (flushCheckpoint / recallLatestCheckpoint).
//
// Self-contained: no deleted-fixture dependency. Uses _runner injection so
// no real child process is spawned. Three tests, all must exit 0.
//
// Run: node --test tests/agent-all/lib/adversarial-verifier-isolation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { adversarialVerify } from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs";
import {
  flushCheckpoint,
  recallLatestCheckpoint,
} from "../../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";
import { makeFileMirror } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";

// ---------------------------------------------------------------------------
// G1-A: a failing break-condition makes adversarialVerify return the BLOCK path
// ---------------------------------------------------------------------------
test("G1-A: failing break condition → exitCode 1 and audit 'VERIFICATION_AUDIT: failed'", async () => {
  const dir = mkdtempSync(join(tmpdir(), "g5-av-fail-"));
  const failRunner = async () => ({
    exitCode: 1,
    stdout: "",
    stderr: "FAIL: a required test file was deleted",
  });

  const result = await adversarialVerify({
    diff: "--- a/tests/some-critical.test.mjs\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-import { test } from 'node:test';\n-test('critical', () => {});",
    acceptanceCriteria: ["No test files may be deleted"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: failRunner,
  });

  assert.equal(result.exitCode, 1, "exitCode must be 1 on a failing break-condition");
  assert.equal(
    result.audit,
    "VERIFICATION_AUDIT: failed",
    "audit literal must be exactly 'VERIFICATION_AUDIT: failed'",
  );
  assert.ok(result.evidence && typeof result.evidence === "object", "evidence must be an object");
  assert.equal(
    result.evidence.schemaVersion,
    "verification-evidence/v1",
    "evidence.schemaVersion must be verification-evidence/v1",
  );
  assert.equal(result.evidence.status, "failed", "evidence.status must be 'failed'");
});

// ---------------------------------------------------------------------------
// G1-B: a passing break-condition returns the PASS path
// ---------------------------------------------------------------------------
test("G1-B: passing break condition → exitCode 0 and audit 'VERIFICATION_AUDIT: passed'", async () => {
  const dir = mkdtempSync(join(tmpdir(), "g5-av-pass-"));
  const passRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });

  const result = await adversarialVerify({
    diff: "--- /dev/null\n+++ b/src/new-feature.mjs\n@@ -0,0 +1,1 @@\n+export const greet = () => 'hi';",
    acceptanceCriteria: ["No test files may be deleted"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: passRunner,
  });

  assert.equal(result.exitCode, 0, "exitCode must be 0 on a passing break-condition");
  assert.equal(
    result.audit,
    "VERIFICATION_AUDIT: passed",
    "audit literal must be exactly 'VERIFICATION_AUDIT: passed'",
  );
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "passed");
});

// ---------------------------------------------------------------------------
// G4: mid-3a flushCheckpoint round-trips the in-flight payload FROM DISK via
//     recallLatestCheckpoint — no wave/iter coordinate supplied to the recall.
//     Also asserts: flushCheckpoint without fileMirror returns ok:false.
// ---------------------------------------------------------------------------
test("G4: mid-3a checkpoint round-trips miniPlans/taskIds/iter from disk; flush without fileMirror returns ok:false", async () => {
  // === Setup temp env ===
  const cwd = mkdtempSync(join(tmpdir(), "g5-chk-"));
  mkdirSync(join(cwd, ".agent-skill/memory"), { recursive: true });
  const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });

  // === Part A: flush without fileMirror returns ok:false ===
  const noMirrorResult = await flushCheckpoint({
    cwd,
    runId: "g5-no-mirror",
    wave: 0,
    iter: 0,
    phase: "3a",
    inFlight: true,
    miniPlans: [],
    taskIds: [],
    requiredAgents: [],
    fileMirror: undefined,
  });
  assert.equal(noMirrorResult.ok, false, "flushCheckpoint without fileMirror must return ok:false");
  assert.equal(
    noMirrorResult.recoverable,
    false,
    "flushCheckpoint without fileMirror must return recoverable:false",
  );

  // === Part B: mid-3a flush (inFlight:true) ===
  const miniPlan = { taskId: "G5-TASK-001", title: "G5 proof task", files: ["src/g5.mjs"], role: "dev" };
  const flushResult = await flushCheckpoint({
    cwd,
    runId: "g5-proof-run",
    wave: 0,
    iter: 1,
    phase: "3a",
    inFlight: true,
    taskIds: ["G5-TASK-001"],
    miniPlans: [miniPlan],
    requiredAgents: ["dev"],
    decisionsSoFar: { "G5-TASK-001": { d1: { chosen_index: 0 } } },
    fileMirror,
  });
  assert.equal(flushResult.ok, true, "flushCheckpoint must return ok:true");
  assert.equal(flushResult.recoverable, true);

  // === Part C: simulate session death — build a FRESH fileMirror from disk only ===
  // No wave/iter coordinates are passed to recallLatestCheckpoint.
  const freshMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
  const latest = await recallLatestCheckpoint({ fileMirror: freshMirror, toolCaller: null });

  // === Assert in-flight payload round-tripped FROM DISK ===
  assert.equal(latest.found, true, "recallLatestCheckpoint must find the checkpoint written by flushCheckpoint");
  assert.equal(latest.source, "file", "source must be 'file' — recovered from disk, not in-memory");
  assert.equal(latest.checkpoint.inFlight, true, "inFlight flag must round-trip");
  assert.equal(latest.checkpoint.wave, 0, "wave must round-trip");
  assert.equal(latest.checkpoint.iter, 1, "iter must round-trip");
  assert.deepEqual(latest.checkpoint.taskIds, ["G5-TASK-001"], "taskIds must round-trip exactly");
  assert.equal(
    latest.checkpoint.miniPlans[0].taskId,
    "G5-TASK-001",
    "miniPlans[0].taskId must round-trip",
  );
  assert.equal(latest.key, "checkpoint/wave-0-iter-1", "recovered key must match the history key");

  // The memory-log.jsonl must NOT exist for the no-mirror run (blocked early return),
  // but MUST exist for the successful flush run.
  assert.equal(
    existsSync(join(cwd, ".agent-skill/runs/g5-no-mirror/memory-log.jsonl")),
    false,
    "no-mirror run must produce no JSONL file",
  );
  assert.equal(
    existsSync(join(cwd, ".agent-skill/runs/g5-proof-run/memory-log.jsonl")),
    true,
    "successful flush must produce a JSONL file",
  );
});
