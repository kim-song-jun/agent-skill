import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { autoResolveAndLog } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/non-tty-resolver.mjs";

test("picks recommended index for each decision and writes state file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ntr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], decisions: {} }));
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [
      { id: "d1", title: "T1", context: "C1",
        options: [{ label: "A", description: "" }, { label: "B", description: "" }],
        recommended_index: 1, reasoning: "R1" },
      { id: "d2", title: "T2", context: "C2",
        options: [{ label: "X", description: "" }, { label: "Y", description: "" }],
        recommended_index: 0, reasoning: "R2" },
    ],
  };
  const resolved = autoResolveAndLog(payload, { statePath, now: () => "2026-05-21T00:00:00Z" });
  assert.deepEqual(resolved, { d1: 1, d2: 0 });
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(state.decisions.t1.d1.chosen_index, 1);
  assert.equal(state.decisions.t1.d1.auto_resolved, true);
  assert.equal(state.decisions.t1.d1.timestamp, "2026-05-21T00:00:00Z");
  assert.equal(state.decisions.t1.d2.chosen_index, 0);
});

test("returns empty when payload is NO_DECISIONS", () => {
  const dir = mkdtempSync(join(tmpdir(), "ntr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], decisions: {} }));
  const resolved = autoResolveAndLog(
    { status: "NO_DECISIONS", scope: { task_id: "t1", task_title: "X" } },
    { statePath, now: () => "2026-05-21T00:00:00Z" }
  );
  assert.deepEqual(resolved, {});
});
