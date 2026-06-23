// tests/agent-all/lib/memory-agent-checkpoint.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { flushCheckpoint, recallLatestCheckpoint } from "../../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";
import { makeFileMirror } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";

function freshEnv() {
  const cwd = mkdtempSync(join(tmpdir(), "memory-agent-chk-"));
  mkdirSync(join(cwd, ".agent-skill/memory"), { recursive: true });
  return { cwd, fileMirror: makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") }) };
}

test("G4-1: flushCheckpoint persists scoping payload to BOTH history key AND LATEST pointer; returns recoverable:true", async () => {
  const { cwd, fileMirror } = freshEnv();
  const mp = { taskId: "AS-TASK-001", title: "Add login form", files: ["src/login.ts"], role: "dev" };
  const result = await flushCheckpoint({
    cwd,
    runId: "run-test-001",
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
  assert.equal(typeof latest.flushedAt, "string");
});

test("G4-2: JSONL entry has schemaVersion memory-log/v1 and correct fields", async () => {
  const { cwd, fileMirror } = freshEnv();
  await flushCheckpoint({
    cwd,
    runId: "run-schema-check",
    wave: 1,
    iter: 2,
    phase: "3a",
    inFlight: true,
    taskIds: ["AS-TASK-002"],
    miniPlans: [{ taskId: "AS-TASK-002", title: "Fix bug", files: [], role: "dev" }],
    requiredAgents: [],
    fileMirror,
  });
  const logPath = join(cwd, ".agent-skill/runs/run-schema-check/memory-log.jsonl");
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

// G4-3: GENUINE round-trip test — mid-3a death reconstructs in-flight scoping FROM DISK
// via the real Phase-0 resume path (recallLatestCheckpoint).
// The two halves share ONE data path. No handoff md involved.
test("G4-3 (rewritten): mid-3a death reconstructs in-flight scoping FROM DISK via recallLatestCheckpoint", async () => {
  // === HALF 1: WRITE PHASE (simulate alive session reaching 3a.0) ===
  const { cwd, fileMirror } = freshEnv();

  const result = await flushCheckpoint({
    cwd,
    runId: "run-rt",
    wave: 2,
    iter: 3,
    phase: "3a",
    inFlight: true,
    taskIds: ["AS-TASK-003"],
    miniPlans: [{
      taskId: "AS-TASK-003",
      title: "Round-trip",
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
  // and critically does NOT know wave=2/iter=3.
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

test("G4-4: two flushes produce two JSONL lines (append-only) and LATEST is overwritten", async () => {
  const { cwd, fileMirror } = freshEnv();
  await flushCheckpoint({
    cwd,
    runId: "run-multi",
    wave: 0,
    iter: 1,
    phase: "3a",
    inFlight: true,
    taskIds: ["T1"],
    miniPlans: [{ taskId: "T1", title: "Task 1", files: [], role: "dev" }],
    requiredAgents: [],
    fileMirror,
  });
  await flushCheckpoint({
    cwd,
    runId: "run-multi",
    wave: 0,
    iter: 2,
    phase: "3-complete",
    inFlight: false,
    miniPlans: [],
    taskIds: [],
    requiredAgents: [],
    fileMirror,
  });
  const lines = readFileSync(join(cwd, ".agent-skill/runs/run-multi/memory-log.jsonl"), "utf-8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).iter, 1);
  assert.equal(JSON.parse(lines[1]).iter, 2);

  // LATEST should point to the most recent flush
  const latest = JSON.parse(fileMirror.read("checkpoint/LATEST"));
  assert.equal(latest.iter, 2);
  assert.equal(latest.inFlight, false);
  assert.equal(latest.pointerTo, "checkpoint/wave-0-iter-2");
});

// TEETH CHECK: proves the test detects a missing/empty checkpoint
test("G4-5 (teeth check a): flush without fileMirror returns ok:false, recoverable:false", async () => {
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

test("G4-6 (teeth check b): recallLatestCheckpoint on pristine cwd returns found:false", async () => {
  const emptyCwd = mkdtempSync(join(tmpdir(), "memory-agent-empty-"));
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

// T6-1: dirtySnapshot round-trip — checkpoint persists protected paths so --resume restores PROTECT mode
test("T6-1: dirtySnapshot survives flush→recall round-trip (PROTECT mode persists across resume)", async () => {
  const { cwd, fileMirror } = freshEnv();
  const snapshot = ["src/app.ts", "config/local.json", "README.md"];

  const result = await flushCheckpoint({
    cwd,
    runId: "run-dirty-rt",
    wave: 1,
    iter: 0,
    phase: "3a",
    inFlight: true,
    taskIds: ["AS-TASK-010"],
    miniPlans: [{ taskId: "AS-TASK-010", title: "Dirty-tree task", files: [], role: "dev" }],
    requiredAgents: [],
    dirtySnapshot: snapshot,
    fileMirror,
  });
  assert.equal(result.ok, true);
  assert.equal(result.recoverable, true);

  // Simulate session death: build a fresh mirror from disk only
  const freshMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
  const latest = await recallLatestCheckpoint({ fileMirror: freshMirror, toolCaller: null });

  assert.equal(latest.found, true);
  assert.equal(latest.source, "file");
  // dirtySnapshot must survive the round-trip intact
  assert.deepEqual(latest.checkpoint.dirtySnapshot, snapshot,
    "dirtySnapshot must be restored from disk so Phase 0 resume can re-enter PROTECT mode");
});
