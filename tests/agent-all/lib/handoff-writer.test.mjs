import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHandoff } from "../../../plugins/harness-floor/skills/agent-all/lib/handoff-writer.mjs";

test("renders concise handoff without raw logs", () => {
  const out = renderHandoff({
    title: "Task 3",
    completed: ["Phase 1 task doc", "Phase 2 plan"],
    remaining: ["Phase 3 implementation"],
    blockers: ["None"],
    validation: "node --test tests/agent-all/lib/task-ledger.test.mjs PASS",
    gitState: "main ahead 1",
    nextAction: "Run Phase 3",
  });

  assert.match(out, /# Handoff: Task 3/);
  assert.match(out, /Run Phase 3/);
  assert.equal(out.includes("```"), false);
});

test("collapses multiline items and renders defaults for empty handoff fields", () => {
  const out = renderHandoff({
    completed: ["Phase 1\nwith multiline detail"],
    remaining: [],
    blockers: [],
  });

  assert.match(out, /- Phase 1 with multiline detail/);
  assert.doesNotMatch(out, /- Phase 1\nwith multiline detail/);
  assert.match(out, /## Remaining\n- None/);
  assert.match(out, /## Blockers\n- None/);
  assert.match(out, /## Latest Validation Evidence\n- Not run/);
  assert.match(out, /## Current Git State\n- Unknown/);
  assert.match(out, /## Next Action\n- Resume from the next incomplete phase/);
});

test("truncates long raw-log-shaped items without dumping the full payload", () => {
  const rawPayload = [
    "```",
    "FAIL tests/agent-all/lib/task-ledger.test.mjs",
    "stderr line ".repeat(80),
    "full payload sentinel should not survive truncation",
    "```",
  ].join("\n");
  const out = renderHandoff({
    completed: [rawPayload],
  });

  assert.equal(out.includes("```"), false);
  assert.match(out, /\[truncated\]/);
  assert.equal(out.includes("full payload sentinel should not survive truncation"), false);
  assert.ok(out.length < 900);
});
