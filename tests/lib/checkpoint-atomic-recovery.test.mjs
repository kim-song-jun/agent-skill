// Atomic checkpoint write + corrupt-LATEST recovery (2026-06-22 adversarial
// round, defect #7). The fixed `checkpoint/LATEST` pointer is rewritten every
// flush, so it is the file most likely caught mid-write by a crash/OOM/compaction
// death. These tests use a real on-disk file mirror (no mocks) to assert:
//   (a) write() is atomic — it leaves no ".tmp" sibling and the file always parses;
//   (b) recallLatestCheckpoint recovers from the newest per-wave history checkpoint
//       when LATEST is truncated/corrupt — the very crash-recovery this targets.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFileMirror } from "../../plugins/harness-floor/skills/agent-all/lib/memory-bridge.mjs";
import {
  flushCheckpoint,
  recallLatestCheckpoint,
} from "../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";

function freshMirror() {
  const root = mkdtempSync(join(tmpdir(), "ckpt-atomic-"));
  return { root, fileMirror: makeFileMirror({ rootDir: root }) };
}

async function flush(fileMirror, root, wave, iter) {
  return flushCheckpoint({
    cwd: root, runId: "r1", wave, iter, phase: "3a", inFlight: true,
    taskIds: [`t${wave}`], miniPlans: [], requiredAgents: [], decisionsSoFar: {},
    fileMirror, config: {},
  });
}

test("checkpoint write is atomic — no .tmp leftover, LATEST recalls the newest flush", async () => {
  const { root, fileMirror } = freshMirror();
  try {
    await flush(fileMirror, root, 0, 0);
    await flush(fileMirror, root, 1, 2);

    const tmpLeftovers = readdirSync(root).filter((f) => f.endsWith(".tmp"));
    assert.deepEqual(tmpLeftovers, [], "atomic write must leave no .tmp sibling behind");

    const r = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
    assert.equal(r.found, true);
    assert.equal(r.checkpoint.wave, 1, "LATEST must point at the newest flush");
    assert.equal(r.checkpoint.iter, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recallLatestCheckpoint recovers from per-wave history when LATEST is corrupt", async () => {
  const { root, fileMirror } = freshMirror();
  try {
    await flush(fileMirror, root, 0, 0);
    await flush(fileMirror, root, 1, 2);

    // Simulate a crash that truncated the always-rewritten LATEST pointer.
    writeFileSync(join(root, "checkpoint_LATEST.json"), '{"wave": 1, "iter": 2, "pointe');

    const r = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
    assert.equal(r.found, true, "recall must still find a usable checkpoint via fallback");
    assert.equal(r.recoveredFrom, "wave-history", "recovery must come from the per-wave history scan");
    assert.equal(r.checkpoint.wave, 1, "fallback must pick the newest per-wave checkpoint (wave 1)");
    assert.equal(r.checkpoint.iter, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recallLatestCheckpoint returns not-found when nothing is recoverable", async () => {
  const { root, fileMirror } = freshMirror();
  try {
    // No flush at all, and a corrupt LATEST with no per-wave history to fall back to.
    writeFileSync(join(root, "checkpoint_LATEST.json"), "{ truncated");
    const r = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
    assert.equal(r.found, false, "no usable checkpoint anywhere → found:false (not a corrupt string)");
    assert.equal(r.checkpoint, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("makeFileMirror.listKeys enumerates stored checkpoint keys", () => {
  const { root, fileMirror } = freshMirror();
  try {
    fileMirror.write("checkpoint/wave-0-iter-0", { wave: 0 });
    fileMirror.write("checkpoint/LATEST", { wave: 0 });
    const keys = fileMirror.listKeys().sort();
    assert.deepEqual(keys, ["checkpoint_LATEST", "checkpoint_wave-0-iter-0"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
