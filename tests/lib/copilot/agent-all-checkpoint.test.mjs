// tests/lib/copilot/agent-all-checkpoint.test.mjs
// Real flushCheckpoint/recallLatestCheckpoint round-trip tests against the
// COPILOT-vendored memory-agent + copilot-LOCAL memory-bridge. The import paths
// here assert that the import-rewrite landed and the LOCAL copilot bridge resolves.
// Zero fake/shape-only assertions. Each test fails on a genuine regression.
// NOTE: the pure-JS module + fs I/O IS real behavior (tests here). The live
// mid-wave-death + --resume on a running Copilot CLI is spec-level and
// live-CLI-unverified (#27) until the Copilot CLI spike.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Import from copilot-LOCAL memory-bridge — asserts the import-rewrite landed.
// If the CC cross-plugin path were vendored verbatim this import would fail with
// ERR_MODULE_NOT_FOUND on a system without a matching cross-plugin path.
import { makeFileMirror } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";

// Import from copilot-vendored memory-agent (which must resolve ./memory-bridge.mjs locally).
import { flushCheckpoint, recallLatestCheckpoint } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-agent.mjs";

function freshEnv() {
  const cwd = mkdtempSync(join(tmpdir(), "copilot-memory-chk-"));
  mkdirSync(join(cwd, ".agent-skill/memory"), { recursive: true });
  return { cwd, fileMirror: makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") }) };
}

test("copilot-checkpoint: flushCheckpoint writes BOTH history key AND LATEST pointer; returns recoverable:true", async () => {
  const { cwd, fileMirror } = freshEnv();
  const mp = { taskId: "AS-TASK-001", title: "Add login form", files: ["src/login.ts"], role: "dev" };
  const result = await flushCheckpoint({
    cwd,
    runId: "run-copilot-001",
    wave: 0,
    iter: 1,
    phase: "3a",
    inFlight: true,
    taskIds: ["AS-TASK-001"],
    miniPlans: [mp],
    requiredAgents: [],
    fileMirror,
  });
  assert.equal(result.ok, true);
  assert.equal(result.recoverable, true);
  assert.ok(result.logPath.endsWith("memory-log.jsonl"));
  assert.equal(result.historyKey, "checkpoint/wave-0-iter-1");
  assert.equal(result.latestKey, "checkpoint/LATEST");

  // History key is written
  const parsed = JSON.parse(fileMirror.read("checkpoint/wave-0-iter-1"));
  assert.equal(parsed.wave, 0);
  assert.equal(parsed.iter, 1);
  assert.deepEqual(parsed.miniPlans, [mp]);
  assert.deepEqual(parsed.taskIds, ["AS-TASK-001"]);
  assert.deepEqual(parsed.requiredAgents, []);
  assert.equal(typeof parsed.flushedAt, "string");

  // LATEST pointer is also written
  const latest = JSON.parse(fileMirror.read("checkpoint/LATEST"));
  assert.equal(latest.wave, 0);
  assert.equal(latest.iter, 1);
  assert.equal(latest.phase, "3a");
  assert.equal(latest.inFlight, true);
  assert.equal(latest.pointerTo, "checkpoint/wave-0-iter-1");
});

test("copilot-checkpoint: JSONL entry has schemaVersion memory-log/v1 and correct fields", async () => {
  const { cwd, fileMirror } = freshEnv();
  await flushCheckpoint({
    cwd,
    runId: "run-copilot-schema",
    wave: 1,
    iter: 2,
    phase: "3a",
    inFlight: true,
    taskIds: ["AS-TASK-002"],
    miniPlans: [{ taskId: "AS-TASK-002", title: "Fix bug", files: [], role: "dev" }],
    requiredAgents: [],
    fileMirror,
  });
  const logPath = join(cwd, ".agent-skill/runs/run-copilot-schema/memory-log.jsonl");
  assert.ok(existsSync(logPath));
  const line = JSON.parse(readFileSync(logPath, "utf-8").trim().split("\n").at(-1));
  assert.equal(line.schemaVersion, "memory-log/v1");
  assert.equal(line.wave, 1);
  assert.equal(line.iter, 2);
  assert.equal(line.event, "checkpoint");
  assert.ok(Array.isArray(line.miniPlans));
  assert.ok(Array.isArray(line.taskIds));
  assert.ok(Array.isArray(line.requiredAgents));
});

// GENUINE mid-wave death round-trip: flush inFlight:true → DROP all in-memory
// state → make a FRESH fileMirror from disk → recallLatestCheckpoint WITHOUT
// passing wave/iter → assert full payload reconstructed from disk.
// This is the real Phase-0 5b resume path with no handoff context.
test("copilot-checkpoint: genuine mid-wave death round-trip reconstructs in-flight scoping FROM DISK", async () => {
  // === HALF 1: WRITE PHASE (simulate alive orchestrator reaching step 3a.0) ===
  const { cwd, fileMirror } = freshEnv();

  const result = await flushCheckpoint({
    cwd,
    runId: "run-copilot-rt",
    wave: 2,
    iter: 3,
    phase: "3a",
    inFlight: true,
    taskIds: ["AS-TASK-003"],
    miniPlans: [{
      taskId: "AS-TASK-003",
      title: "Round-trip test",
      files: ["a.ts"],
      role: "dev",
    }],
    requiredAgents: ["dev"],
    decisionsSoFar: { "AS-TASK-003": { d1: { chosen_index: 0 } } },
    fileMirror,
  });
  assert.equal(result.ok, true);
  assert.equal(result.recoverable, true);

  // === HALF 2: DISCARD IN-MEMORY STATE (simulate session death) ===
  // Drop the fileMirror handle and ALL in-memory vars. Reconstruct a NEW
  // fileMirror from disk only. Post-death session has ONLY cwd + disk,
  // critically does NOT know wave=2/iter=3.
  const freshMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });

  // === RUN THE ACTUAL RESUME RECONSTRUCTION PATH ===
  // Use the SAME function Phase 0 step 5b calls.
  // Must NOT pass wave/iter — must reach payload via fixed LATEST pointer alone.
  const latest = await recallLatestCheckpoint({ fileMirror: freshMirror, toolCaller: null });

  // === ASSERT in-flight payload was reconstructed FROM DISK ===
  assert.equal(latest.found, true);
  assert.equal(latest.source, "file");
  assert.equal(latest.checkpoint.inFlight, true);
  assert.equal(latest.checkpoint.wave, 2);
  assert.equal(latest.checkpoint.iter, 3);
  assert.deepEqual(latest.checkpoint.taskIds, ["AS-TASK-003"]);
  assert.equal(latest.checkpoint.miniPlans[0].taskId, "AS-TASK-003");
  assert.deepEqual(latest.checkpoint.requiredAgents, ["dev"]);
  assert.deepEqual(latest.checkpoint.decisionsSoFar["AS-TASK-003"].d1.chosen_index, 0);
  // Recovered key must resolve to the history key
  assert.equal(latest.key, "checkpoint/wave-2-iter-3");
});

// Teeth: flush without fileMirror → ok:false, recoverable:false
test("copilot-checkpoint: flush without fileMirror returns ok:false, recoverable:false", async () => {
  const { cwd } = freshEnv();
  const r = await flushCheckpoint({
    cwd,
    runId: "x",
    wave: 0,
    iter: 0,
    phase: "3a",
    inFlight: true,
    miniPlans: [],
    taskIds: [],
    requiredAgents: [],
    fileMirror: undefined,
  });
  assert.equal(r.ok, false);
  assert.equal(r.recoverable, false);
});

// Teeth: recall on pristine directory → found:false, source:null
test("copilot-checkpoint: recallLatestCheckpoint on pristine cwd returns found:false", async () => {
  const emptyCwd = mkdtempSync(join(tmpdir(), "copilot-memory-empty-"));
  mkdirSync(join(emptyCwd, ".agent-skill/memory"), { recursive: true });
  const none = await recallLatestCheckpoint({
    fileMirror: makeFileMirror({ rootDir: join(emptyCwd, ".agent-skill/memory") }),
    toolCaller: null,
  });
  assert.equal(none.found, false);
  assert.equal(none.checkpoint, null);
  assert.equal(none.key, null);
  assert.equal(none.source, null);
});
