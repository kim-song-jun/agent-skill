import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeWaveDecisions } from "../../../plugins/harness-floor/skills/agent-all/lib/decision-router.mjs";

function payload(taskId, decisions) {
  return { status: decisions.length ? "NEEDS_DECISIONS" : "NO_DECISIONS",
           scope: { task_id: taskId, task_title: taskId },
           decisions };
}
function dec(id, recIdx) {
  return { id, title: id, context: "ctx",
           options: [{ label: "A", description: "" }, { label: "B", description: "" }],
           recommended_index: recIdx, reasoning: "r" };
}

test("non-TTY mode resolves all decisions to recommended and returns answer map", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ decisions: {} }));
  const result = await routeWaveDecisions({
    payloads: [payload("t1", [dec("d1", 0), dec("d2", 1)]), payload("t2", [dec("d1", 1)])],
    statePath, isTTY: false,
    askUser: async () => { throw new Error("should not call user in non-TTY"); },
  });
  assert.deepEqual(result.answers.t1, { d1: 0, d2: 1 });
  assert.deepEqual(result.answers.t2, { d1: 1 });
});

test("TTY mode calls askUser sequentially per task, per decision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ decisions: {} }));
  const calls = [];
  const result = await routeWaveDecisions({
    payloads: [payload("t1", [dec("d1", 0)]), payload("t2", [dec("d1", 0)])],
    statePath, isTTY: true,
    askUser: async (q) => { calls.push(q.questions[0].header); return 1; }, // user picks index 1 each time
  });
  assert.deepEqual(calls.length, 2);
  assert.equal(result.answers.t1.d1, 1);
  assert.equal(result.answers.t2.d1, 1);
});

test("NO_DECISIONS payloads produce empty answer maps", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ decisions: {} }));
  const result = await routeWaveDecisions({
    payloads: [payload("t1", [])],
    statePath, isTTY: true,
    askUser: async () => { throw new Error("should not call"); },
  });
  assert.deepEqual(result.answers.t1, {});
});
