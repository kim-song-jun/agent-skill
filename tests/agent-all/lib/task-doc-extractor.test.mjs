import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractTaskDoc,
  taskTitleFromText,
  validateTaskDocShape,
} from "../../../plugins/harness-floor/skills/agent-all/lib/task-doc-extractor.mjs";

const TASK = `# Fix flaky login
## Goal
Stabilize login test.
## Acceptance
- [x] Reproduce failure
- [ ] Make retry deterministic
## Phases
- [x] Phase 1
- [ ] Phase 2
## Decision Matrix
| Decision | Choice |
|---|---|
| Retry source | Clock |
## Ambiguity Log
None.
## Progress Snapshot
Implementation paused after first test pass.
## Verification
- [x] npm test
## Cost Telemetry
| Current USD | Max USD | Budget Status | Source |
|---:|---:|---|---|
| 0.00 | 100.00 | ok | reported |
## Backlog
- [ ] future cleanup
`;

test("extracts task title, status, checked, unchecked, and verification summary", () => {
  const out = extractTaskDoc({
    taskPath: "docs/tasks/12-fix-flaky-login.md",
    taskText: TASK,
    state: { phases: [{ phase: 2, status: "completed" }] },
  });

  assert.equal(taskTitleFromText(TASK), "Fix flaky login");
  assert.equal(out.title, "Fix flaky login");
  assert.match(out.goal, /Stabilize login test/);
  assert.ok(out.completed.some((item) => /Acceptance: Reproduce failure/.test(item)));
  assert.ok(out.completed.some((item) => /Phase 2/.test(item)));
  assert.ok(out.remaining.some((item) => /Acceptance: Make retry deterministic/.test(item)));
  assert.ok(out.remaining.every((item) => !/future cleanup/.test(item)));
  assert.match(out.validation, /npm test/);
  assert.deepEqual(out.ssot, [
    "docs/tasks/12-fix-flaky-login.md",
    ".agent-skill/registry/tasks.json",
    ".agent-all-state.json",
    ".agent-skill/handoff/12-fix-flaky-login.handoff.md",
    ".agent-skill/handoff/12-fix-flaky-login.session.md",
  ]);
});

test("extracts canonical identity frontmatter when present", () => {
  const out = extractTaskDoc({
    taskPath: ".agent-skill/tasks/T-20260611-001-fix-flaky-login.md",
    taskText: `---
id: AS-TASK-01K7P8J7G00000000000000000
display_id: T-20260611-001
github_issue: 18
status: doing
artifact_root: .agent-skill/
---
${TASK}`,
  });

  assert.equal(out.id, "AS-TASK-01K7P8J7G00000000000000000");
  assert.equal(out.displayId, "T-20260611-001");
  assert.equal(out.githubIssue, "18");
});

test("strict shape validation checks sections but not unfinished checkboxes", () => {
  const result = validateTaskDocShape(TASK);
  assert.deepEqual(result, { ok: true, errors: [] });

  const missing = validateTaskDocShape(TASK.replace("## Verification", "## Proof"));
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join("\n"), /missing section: Verification/);
});
