import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeWaveDecisions } from "../../../plugins/harness-floor/skills/agent-all/lib/decision-router.mjs";
import { validateDecisionPayload } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs";

test("end-to-end: 3 scoping payloads → non-TTY auto-resolve → state file populated → answers usable for re-dispatch", async () => {
  const dir = mkdtempSync(join(tmpdir(), "e2e-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], waves: [], decisions: {}, warnings: [] }));

  const scopingReturns = [
    `\`\`\`decision-payload
{ "status": "NEEDS_DECISIONS", "scope": { "task_id": "task-1", "task_title": "Add OAuth" },
  "decisions": [{ "id": "d1", "title": "Token storage", "context": "...",
    "options": [{"label":"Cookie","description":""},{"label":"localStorage","description":""}],
    "recommended_index": 0, "reasoning": "Aligns with session pattern" }] }
\`\`\``,
    `\`\`\`decision-payload
{ "status": "NO_DECISIONS", "scope": { "task_id": "task-2", "task_title": "Profile UI" } }
\`\`\``,
    `\`\`\`decision-payload
{ "status": "NEEDS_DECISIONS", "scope": { "task_id": "task-3", "task_title": "Refactor auth.ts" },
  "decisions": [{ "id": "d1", "title": "Extraction boundary", "context": "...",
    "options": [{"label":"Per-file","description":""},{"label":"Per-module","description":""},{"label":"Inline","description":""}],
    "recommended_index": 1, "reasoning": "Module boundary" }] }
\`\`\``,
  ];

  const payloads = scopingReturns.map(extractPayload);
  for (const p of payloads) {
    const v = validateDecisionPayload(p);
    assert.equal(v.ok, true, `payload invalid: ${v.errors.join(", ")}`);
  }
  const result = await routeWaveDecisions({ payloads, statePath, isTTY: false, askUser: () => { throw new Error(); } });
  assert.deepEqual(result.answers["task-1"], { d1: 0 });
  assert.deepEqual(result.answers["task-2"], {});
  assert.deepEqual(result.answers["task-3"], { d1: 1 });
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(state.decisions["task-1"].d1.auto_resolved, true);
  assert.equal(state.decisions["task-3"].d1.chosen_index, 1);
});

function extractPayload(text) {
  const m = text.match(/```decision-payload\s*([\s\S]*?)```/);
  return JSON.parse(m[1]);
}
