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
## Cost Telemetry
| Current USD | Max USD | Budget Status | Source |
|---:|---:|---|---|
| 0.00 | 100.00 | ok | reported |
## Backlog
- [ ] outside current task
## Follow-up
- [ ] outside hard gate
`;

const VALID_WITH_IDENTITY = `---
id: AS-TASK-01K7P8J7G00000000000000000
display_id: T-20260611-001
github_issue: 18
status: doing
artifact_root: .agent-skill/
---
${VALID}`;

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
- [1](.agent-skill/tasks/1-full.md)
- [T](.agent-skill/tasks/T-20260611-001-canonical.md)
- .agent-skill/tasks/2-plain.md
- 3-local.md
- ./4-dot-local.md
- .agent-skill/tasks/_template.md
- [_handoff](.agent-skill/tasks/_handoff-template.md)
## Done
- docs/tasks/9-done.md
`;

  assert.deepEqual(ledger.activeTaskPaths(indexText), [
    ".agent-skill/tasks/1-full.md",
    ".agent-skill/tasks/T-20260611-001-canonical.md",
    ".agent-skill/tasks/2-plain.md",
    ".agent-skill/tasks/3-local.md",
    ".agent-skill/tasks/4-dot-local.md",
  ]);
});

test("active task path parser ignores prose and inline-code non-task md mentions", () => {
  assert.equal(typeof ledger.activeTaskPaths, "function");
  const indexText = `# Tasks
## Active
Keep notes nearby; see README.md for broader context.
Avoid treating \`scratch.md\` as an active task.
- [One](1-task.md)
- docs/tasks/2-task.md
- ./3-task.md
## Done
- docs/tasks/9-done.md
`;

  assert.deepEqual(ledger.activeTaskPaths(indexText), [
    ".agent-skill/tasks/1-task.md",
    "docs/tasks/2-task.md",
    ".agent-skill/tasks/3-task.md",
  ]);
});

test("active task path normalizer accepts supported task path forms", () => {
  assert.equal(typeof ledger.normalizeActiveTaskPath, "function");
  assert.equal(ledger.normalizeActiveTaskPath(".agent-skill/tasks/1-x.md"), ".agent-skill/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath(".agent-skill/tasks/T-20260611-001-x.md"), ".agent-skill/tasks/T-20260611-001-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("1-x.md"), ".agent-skill/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("./1-x.md"), ".agent-skill/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath(".agent-skill/tasks/1-x.md#notes"), ".agent-skill/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath(".agent-skill/tasks/_template.md"), null);
  assert.equal(ledger.normalizeActiveTaskPath(".agent-skill/tasks/_handoff-template.md"), null);
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/1-x.md"), "docs/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/1-x.md#notes"), "docs/tasks/1-x.md");
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/_template.md"), null);
  assert.equal(ledger.normalizeActiveTaskPath("docs/tasks/_handoff-template.md"), null);
});

test("task identity frontmatter can be required for new tasks", () => {
  assert.equal(typeof ledger.validateTaskIdentity, "function");
  assert.deepEqual(ledger.validateTaskIdentity(VALID_WITH_IDENTITY, { requireIdentity: true }).errors, []);
  assert.match(
    ledger.validateTaskDoc(VALID, { requireIdentity: true }).errors.join("\n"),
    /missing task identity frontmatter/,
  );
  assert.match(
    ledger.validateTaskDoc(
      VALID_WITH_IDENTITY.replace("display_id: T-20260611-001", "display_id: 18"),
      { requireIdentity: true },
    ).errors.join("\n"),
    /invalid task display_id/,
  );
});

test("full task ledger validation trusts supplied task text without default missing-file error", () => {
  assert.equal(typeof ledger.validateTaskLedger, "function");
  const result = ledger.validateTaskLedger({
    taskPath: ".agent-skill/tasks/T-20260611-001-current.md",
    taskText: VALID_WITH_IDENTITY,
    indexText: `# Tasks
## Active
- [Current](.agent-skill/tasks/T-20260611-001-current.md)
`,
    templateExists: true,
    requireIdentity: true,
  });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test("full task ledger validation catches missing scaffold and active task docs", () => {
  assert.equal(typeof ledger.validateTaskLedger, "function");
  const result = ledger.validateTaskLedger({
    taskPath: ".agent-skill/tasks/T-20260611-001-current.md",
    taskText: VALID_WITH_IDENTITY,
    indexText: `# Tasks
## Active
- [Current](.agent-skill/tasks/T-20260611-001-current.md)
- [Missing](.agent-skill/tasks/3-missing.md)
`,
    templateExists: false,
    requireIdentity: true,
    taskExists: (taskPath) => taskPath === ".agent-skill/tasks/T-20260611-001-current.md",
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing \.agent-skill\/tasks\/_template\.md/);
  assert.match(result.errors.join("\n"), /missing active task: \.agent-skill\/tasks\/3-missing\.md/);
});

test("full task ledger validation reports duplicate active task entries", () => {
  assert.equal(typeof ledger.validateTaskLedger, "function");
  const result = ledger.validateTaskLedger({
    taskPath: ".agent-skill/tasks/T-20260611-001-current.md",
    taskText: VALID_WITH_IDENTITY,
    indexText: `# Tasks
## Active
- [Current](.agent-skill/tasks/T-20260611-001-current.md)
- ./T-20260611-001-current.md
`,
    templateExists: true,
    requireIdentity: true,
    taskExists: () => true,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /duplicate active task: \.agent-skill\/tasks\/T-20260611-001-current\.md/);
});

test("full task ledger validation catches missing index and current task body errors", () => {
  assert.equal(typeof ledger.validateTaskLedger, "function");
  const result = ledger.validateTaskLedger({
    taskPath: ".agent-skill/tasks/T-20260611-001-current.md",
    taskText: VALID_WITH_IDENTITY.replace("## Verification", "## Proof"),
    indexText: null,
    templateExists: true,
    requireIdentity: true,
    taskExists: () => true,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /missing \.agent-skill\/tasks\/index\.md/);
  assert.match(result.errors.join("\n"), /missing section: Verification/);
});

test("legacy docs/tasks ledger remains valid when selected as tasksDir", () => {
  const result = ledger.validateTaskLedger({
    taskPath: "docs/tasks/2-current.md",
    taskText: VALID,
    indexText: `# Tasks
## Active
- [Current](docs/tasks/2-current.md)
- ./3-legacy-local.md
`,
    templateExists: true,
    tasksDir: "docs/tasks",
    taskExists: (taskPath) => taskPath === "docs/tasks/2-current.md" || taskPath === "docs/tasks/3-legacy-local.md",
  });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test("phase 1 creates first-task ledger scaffold before reading the index", () => {
  const text = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/1-intent.md"), "utf8");
  const bootstrap = text.indexOf("When Phase 0 allowed first-task scaffold creation");
  const index = text.indexOf("Read `.agent-skill/tasks/index.md` as `indexText`");

  assert.notEqual(bootstrap, -1);
  assert.notEqual(index, -1);
  assert.ok(bootstrap < index);
  assert.match(text, /create `\.agent-skill\/tasks\/`/);
  assert.match(text, /seed `\.agent-skill\/tasks\/index\.md`/);
  assert.match(text, /seed `\.agent-skill\/tasks\/_template\.md`/);
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

test("phase 5 validates the full ledger before branch creation and push", () => {
  const text = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/5-pr.md"), "utf8");
  const validation = text.indexOf("validateTaskLedger");
  const branchCreate = text.indexOf("git rev-parse --verify <branch>");
  const push = text.indexOf("git push -u origin <branch>");

  assert.notEqual(validation, -1);
  assert.notEqual(branchCreate, -1);
  assert.notEqual(push, -1);
  assert.ok(validation < branchCreate);
  assert.ok(validation < push);
});
