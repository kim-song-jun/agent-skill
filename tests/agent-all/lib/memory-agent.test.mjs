import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  makeMemoryAgent,
  MEMORY_LOG_SCHEMA_VERSION,
} from "../../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";

function tempDir() { return mkdtempSync(join(tmpdir(), "memory-agent-")); }

test("MEMORY_LOG_SCHEMA_VERSION is exactly memory-log/v1", () => {
  assert.equal(MEMORY_LOG_SCHEMA_VERSION, "memory-log/v1");
});

test("store writes file mirror + JSONL; recall after adapter null returns ok, source='file', round-trip", async () => {
  const dir = tempDir();
  const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "test-run-1", cwd: dir });
  const payload = { taskId: "T-42", iter: 3, openDecisions: ["decide-auth"], scratchpad: "tried A, rejected. Next: B." };
  let adapterCalled = false;
  async function liveToolCaller() { adapterCalled = true; return null; }
  const storeResult = await agent.store("phase-3a-state", payload, liveToolCaller);
  assert.equal(storeResult.ok, true);
  assert.ok(adapterCalled, "live adapter should have been called during store");

  // Verify JSONL was written
  const logFile = agent.logPath();
  assert.ok(existsSync(logFile), "JSONL log file must exist");
  const lines = readFileSync(logFile, "utf-8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.schemaVersion, "memory-log/v1");
  assert.equal(entry.runId, "test-run-1");
  assert.ok(entry.timestamp);
  assert.equal(entry.key, "phase-3a-state");
  assert.deepEqual(entry.value, payload);

  // Simulate context reset by recalling with null adapter — must come from file mirror only
  const recall = await agent.recall("phase-3a-state", null);
  assert.equal(recall.ok, true);
  assert.equal(recall.source, "file");
  assert.deepEqual(recall.value, payload);
  assert.equal(recall.value.scratchpad, payload.scratchpad);

  // DISK-ONLY CONTRACT PROOF (teeth): build a FRESH makeMemoryAgent from the same
  // rootDir — simulates a new process where no in-memory fileMirror handle survives.
  // A mutant that fabricates source:'file' without reading disk would fail here because
  // this fresh instance has never stored anything in memory.
  const rootDir = join(dir, ".agent-skill", "memory");
  const agentFresh = makeMemoryAgent({ rootDir, runId: "test-run-1-fresh", cwd: dir });
  const recallFresh = await agentFresh.recall("phase-3a-state", null);
  assert.equal(recallFresh.ok, true, "fresh agent must read payload from disk");
  assert.equal(recallFresh.source, "file", "fresh agent recall source must be 'file'");
  assert.deepEqual(recallFresh.value, payload, "fresh agent must return the same payload from disk");

  // NEGATIVE PROOF: deleting the on-disk mirror file causes recall to fail.
  // This directly proves the disk-only dependency — a fabricating mutant cannot pass this.
  const mirrorFile = join(rootDir, "phase-3a-state.json");
  assert.ok(existsSync(mirrorFile), "mirror file must exist on disk before deletion");
  rmSync(mirrorFile);
  const recallAfterDelete = await agentFresh.recall("phase-3a-state", null);
  assert.equal(recallAfterDelete.ok, false, "recall must fail after mirror file is deleted");
  assert.equal(recallAfterDelete.value, null, "recall value must be null when mirror file is gone");
});

test("store with no adapter still writes file mirror + JSONL", async () => {
  const dir = tempDir();
  const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "no-adapter-run", cwd: dir });
  const result = await agent.store("key-no-adapter", { x: 1, scratchpad: "note" }, null);
  assert.equal(result.ok, true);
  assert.equal(result.source, "file");
  const line = JSON.parse(readFileSync(agent.logPath(), "utf-8").trim());
  assert.equal(line.schemaVersion, "memory-log/v1");
  assert.equal(line.key, "key-no-adapter");
});

test("recall returns ok=false / value=null when key absent and adapter null", async () => {
  const dir = tempDir();
  const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "absent-key-run", cwd: dir });
  const result = await agent.recall("never-stored", null);
  assert.equal(result.ok, false);
  assert.equal(result.value, null);
});

test("JSONL entry round-trips the scratchpad field", async () => {
  const dir = tempDir();
  const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "scratchpad-run", cwd: dir });
  await agent.store("scratch-key", { scratchpad: "model reasoning captured", iter: 7 }, null);
  const entry = JSON.parse(readFileSync(agent.logPath(), "utf-8").trim());
  assert.equal(entry.value.scratchpad, "model reasoning captured");
});
