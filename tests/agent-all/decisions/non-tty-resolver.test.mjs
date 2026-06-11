import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  const markdownPath = join(dir, ".agent-skill/runs/default/decisions.md");
  assert.equal(existsSync(markdownPath), true);
  const markdown = readFileSync(markdownPath, "utf-8");
  assert.match(markdown, /# Auto-resolved decisions - iter 0 - 2026-05-21T00:00:00Z/);
  assert.match(markdown, /Chosen: \*\*B\*\* \(recommended\)/);
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

test("blocks high-risk recommended options in non-TTY mode and logs interaction", () => {
  const dir = mkdtempSync(join(tmpdir(), "ntr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], decisions: {} }));
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "High risk task" },
    decisions: [
      {
        id: "d1",
        title: "Delete production data?",
        context: "The recommended option is irreversible.",
        options: [
          { label: "Delete", description: "Drop production tables", risk: "high" },
          { label: "Pause", description: "Ask the user first", risk: "low" },
        ],
        recommended_index: 0,
        reasoning: "Cleanup was requested.",
      },
    ],
  };

  const resolved = autoResolveAndLog(payload, {
    statePath,
    cwd: dir,
    runId: "run-13",
    now: () => "2026-06-11T00:00:00Z",
  });

  assert.deepEqual(resolved, {});
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(state.decisions.t1.d1.chosen_index, null);
  assert.equal(state.decisions.t1.d1.auto_resolved, false);
  assert.equal(state.decisions.t1.d1.blocked, true);
  assert.equal(state.interactions.t1.d1.action, "blocked");
  assert.equal(state.interactions.t1.d1.selectedOptionId, null);

  const logPath = join(dir, ".agent-skill/runs/run-13/interactions.jsonl");
  assert.equal(existsSync(logPath), true);
  const entry = JSON.parse(readFileSync(logPath, "utf-8").trim());
  assert.equal(entry.schemaVersion, "agent-interaction-log/v1");
  assert.equal(entry.result.action, "blocked");
  assert.match(entry.result.reason, /high-risk/);

  const markdown = readFileSync(join(dir, ".agent-skill/runs/run-13/decisions.md"), "utf-8");
  assert.match(markdown, /Blocked: high-risk option cannot be auto-selected in non-TTY mode: Delete/);
});
