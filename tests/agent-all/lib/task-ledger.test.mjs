import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ledger from "../../../plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs";

const { validateTaskDoc } = ledger;
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

const VALID = `# Task
## Goal
Ship it.
## Acceptance
- [x] in scope done
## Phases
- [x] build
## Decision Matrix
| Decision | Choice |
|---|---|
| A | B |
## Ambiguity Log
None.
## Progress Snapshot
Current phase: gate.
## Verification
- [x] node --test
## Backlog
- [ ] outside current task
## Follow-up
- [ ] outside hard gate
`;

test("valid task doc passes required section and checkbox gates", () => {
  assert.deepEqual(validateTaskDoc(VALID), { ok: true, errors: [] });
});

test("missing required section fails", () => {
  const result = validateTaskDoc(VALID.replace("## Verification", "## Proof"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing section: Verification/);
});

test("unchecked in-scope checkbox fails while Backlog and Follow-up are ignored", () => {
  const result = validateTaskDoc(VALID.replace("- [x] build", "- [ ] build"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unchecked item/);
  assert.doesNotMatch(result.errors.join("\n"), /outside current task/);
  assert.doesNotMatch(result.errors.join("\n"), /outside hard gate/);
});

test("indented unchecked in-scope checkbox fails", () => {
  const result = validateTaskDoc(VALID.replace("- [x] build", "  - [ ] indented build"));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /unchecked item in Phases: indented build/);
});

test("active task path parser normalizes active ledger entries and skips templates", () => {
  assert.equal(typeof ledger.activeTaskPaths, "function");
  const indexText = `# Tasks
## Active
- [1](docs/tasks/1-full.md)
- docs/tasks/2-plain.md
- 3-local.md
- ./4-dot-local.md
- docs/tasks/_template.md
- [_handoff](docs/tasks/_handoff-template.md)
## Done
- docs/tasks/9-done.md
`;

  assert.deepEqual(ledger.activeTaskPaths(indexText), [
    "docs/tasks/1-full.md",
    "docs/tasks/2-plain.md",
    "docs/tasks/3-local.md",
    "docs/tasks/4-dot-local.md",
  ]);
});

test("active task path normalizer accepts supported task path forms", () => {
  assert.equal(typeof ledger.normalizeActiveTaskPath, "function");
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/1-x.md"), "docs/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("1-x.md"), "docs/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("./1-x.md"), "docs/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/1-x.md#notes"), "docs/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/_template.md"), null);
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/_handoff-template.md"), null);
});

test("full task ledger validation catches missing scaffold and active task docs", () => {
  assert.equal(typeof ledger.validateTaskLedger, "function");
  const result = ledger.validateTaskLedger({
    taskPath: "docs/tasks/2-current.md",
    taskText: VALID,
    indexText: `# Tasks
## Active
- [Current](docs/tasks/2-current.md)
- [Missing](docs/tasks/3-missing.md)
`,
    templateExists: false,
    taskExists: (taskPath) => taskPath === "docs/tasks/2-current.md",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing docs\/tasks\/_template\.md/);
  assert.match(result.errors.join("\n"), /missing active task: docs\/tasks\/3-missing\.md/);
});

test("full task ledger validation catches missing index and current task body errors", () => {
  assert.equal(typeof ledger.validateTaskLedger, "function");
  const result = ledger.validateTaskLedger({
    taskPath: "docs/tasks/2-current.md",
    taskText: VALID.replace("## Verification", "## Proof"),
    indexText: null,
    templateExists: true,
    taskExists: () => true,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing docs\/tasks\/index\.md/);
  assert.match(result.errors.join("\n"), /missing section: Verification/);
});

test("phase 1 creates first-task ledger scaffold before reading the index", () => {
  const text = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/1-intent.md"), "utf8");
  const bootstrap = text.indexOf("When Phase 0 allowed first-task scaffold creation");
  const index = text.indexOf("Read `docs/tasks/index.md` as `indexText`");

  assert.notEqual(bootstrap, -1);
  assert.notEqual(index, -1);
  assert.ok(bootstrap < index);
  assert.match(text, /create `docs\/tasks\/`/);
  assert.match(text, /seed `docs\/tasks\/index\.md`/);
  assert.match(text, /seed `docs\/tasks\/_template\.md`/);
});

test("phase 5 validates the full ledger before PR creation", () => {
  const text = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/5-pr.md"), "utf8");
  const validation = text.indexOf("validateTaskLedger");
  const prCreate = text.indexOf("gh pr create");

  assert.notEqual(validation, -1);
  assert.notEqual(prCreate, -1);
  assert.ok(validation < prCreate);
  assert.match(text, /missing index\/template/i);
  assert.match(text, /missing Active tasks/i);
});
