import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentHandoff } from "../../plugins/harness-floor/skills/agent-handoff/lib/agent-handoff-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

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
| 1.25 | 100.00 | ok | reported |
## Handoff
None yet.
`;

function fixtureDir() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-handoff-"));
  mkdirSync(join(cwd, "docs/tasks"), { recursive: true });
  writeFileSync(join(cwd, "docs/tasks/12-fix-flaky-login.md"), TASK);
  writeFileSync(join(cwd, ".agent-all-state.json"), JSON.stringify({
    iter: 2,
    costUSD: 1.25,
    lastBreakConditionExit: 1,
    phases: [{ phase: 2, status: "completed" }],
  }));
  return cwd;
}

function identityFixtureDir() {
  const cwd = mkdtempSync(join(tmpdir(), "agent-handoff-identity-"));
  mkdirSync(join(cwd, ".agent-skill/tasks"), { recursive: true });
  writeFileSync(join(cwd, ".agent-skill/tasks/T-20260611-001-fix-flaky-login.md"), `---
id: AS-TASK-01K7P8J7G00000000000000000
display_id: T-20260611-001
github_issue: 18
status: doing
artifact_root: .agent-skill/
---
${TASK}`);
  return cwd;
}

function writeDataEvidence(cwd) {
  mkdirSync(join(cwd, ".agent-skill/runs/data-run"), { recursive: true });
  writeFileSync(join(cwd, ".agent-skill/runs/data-run/verification-evidence.jsonl"), `${JSON.stringify({
    schemaVersion: "verification-evidence/v1",
    adapter: "verify:notebook-data",
    status: "passed",
    summary: "Notebook clean execution passed",
    artifacts: ["outputs/summary.csv"],
    timestamp: "2026-06-10T00:00:00.000Z",
  })}\n`);
}

function fakeGitState() {
  return {
    branch: "feature/login",
    statusLines: [" M src/login.ts"],
    logLines: ["abc1234 test commit"],
    summary: "feature/login; 1 changed file(s)",
  };
}

test("agent-handoff runner writes handoff, session prompt, metadata, and non-TTY audit", () => {
  const cwd = fixtureDir();
  writeDataEvidence(cwd);
  const result = runAgentHandoff({
    cwd,
    taskPath: "docs/tasks/12-fix-flaky-login.md",
    strict: true,
    nonInteractive: true,
    now: new Date("2026-06-10T00:00:00.000Z"),
    collectGitState: fakeGitState,
  });

  assert.equal(result.wrote, true);
  assert.equal(result.handoffPath, ".agent-skill/handoff/12-fix-flaky-login.handoff.md");
  assert.equal(result.sessionPath, ".agent-skill/handoff/12-fix-flaky-login.session.md");
  assert.equal(result.selectedNextAction.id, "resume-agent-all");

  const handoff = readFileSync(join(cwd, result.handoffPath), "utf8");
  const session = readFileSync(join(cwd, result.sessionPath), "utf8");
  assert.match(handoff, /agent-handoff-metadata/);
  assert.match(handoff, /"schema": "agent-skill\/handoff@1"/);
  assert.match(handoff, /\/agent-all docs\/tasks\/12-fix-flaky-login\.md --resume/);
  assert.match(handoff, /## Data Artifacts \/ Evidence/);
  assert.match(handoff, /outputs\/summary\.csv/);
  assert.equal(result.dataEvidence[0].adapter, "verify:notebook-data");
  assert.match(session, /agent-session-metadata/);
  assert.match(session, /User approval required \/ 사용자 승인 필요: docker volume rm/);
  assert.match(session, /Inspect docs\/tasks\/12-fix-flaky-login\.md, \.agent-skill\/handoff\/12-fix-flaky-login\.handoff\.md/);

  const auditPath = join(cwd, ".agent-skill/runs/handoff-audit.jsonl");
  assert.equal(existsSync(auditPath), true);
  const audit = JSON.parse(readFileSync(auditPath, "utf8").trim());
  assert.equal(audit.event, "non_tty_next_action_auto_selected");
  assert.equal(audit.selectedAction, "resume-agent-all");

  const interactionPath = join(cwd, result.interactionLogPath);
  assert.equal(existsSync(interactionPath), true);
  const interactionEntry = JSON.parse(readFileSync(interactionPath, "utf8").trim());
  assert.equal(interactionEntry.schemaVersion, "agent-interaction-log/v1");
  assert.equal(interactionEntry.source, "agent-handoff");
  assert.equal(interactionEntry.interaction.kind, "resume");
  assert.equal(interactionEntry.result.selectedOptionId, "resume-agent-all");
});

test("agent-handoff runner preserves canonical task identity metadata", () => {
  const cwd = identityFixtureDir();
  const result = runAgentHandoff({
    cwd,
    taskPath: ".agent-skill/tasks/T-20260611-001-fix-flaky-login.md",
    nonInteractive: true,
    now: new Date("2026-06-10T00:00:00.000Z"),
    collectGitState: fakeGitState,
  });

  assert.equal(result.handoffPath, ".agent-skill/handoff/T-20260611-001-fix-flaky-login.handoff.md");
  assert.equal(result.sessionPath, ".agent-skill/handoff/T-20260611-001-fix-flaky-login.session.md");

  const handoff = readFileSync(join(cwd, result.handoffPath), "utf8");
  const session = readFileSync(join(cwd, result.sessionPath), "utf8");
  assert.match(handoff, /"taskId": "AS-TASK-01K7P8J7G00000000000000000"/);
  assert.match(handoff, /"displayId": "T-20260611-001"/);
  assert.match(handoff, /"githubIssue": "18"/);
  assert.match(handoff, /\/agent-all \.agent-skill\/tasks\/T-20260611-001-fix-flaky-login\.md --resume/);
  assert.match(session, /\.agent-skill\/registry\/tasks\.json/);
  assert.match(session, /"schema": "agent-skill\/session-prompt@1"/);
});

test("agent-handoff dry-run returns content without writing files", () => {
  const cwd = fixtureDir();
  const result = runAgentHandoff({
    cwd,
    taskPath: "docs/tasks/12-fix-flaky-login.md",
    dryRun: true,
    nonInteractive: true,
    collectGitState: fakeGitState,
  });

  assert.equal(result.wrote, false);
  assert.match(result.handoff, /# Handoff: Fix flaky login/);
  assert.equal(existsSync(join(cwd, result.handoffPath)), false);
  assert.equal(existsSync(join(cwd, result.sessionPath)), false);
  assert.equal(existsSync(join(cwd, result.auditPath)), false);
});

test("agent-handoff runner honors configured artifact root", () => {
  const cwd = fixtureDir();
  mkdirSync(join(cwd, ".ops/runs/data-run"), { recursive: true });
  writeFileSync(join(cwd, ".ops/runs/data-run/verification-evidence.jsonl"), `${JSON.stringify({
    schemaVersion: "verification-evidence/v1",
    adapter: "verify:sql-db",
    status: "passed",
    summary: "SQL validation passed",
    artifacts: ["outputs/report.csv"],
    timestamp: "2026-06-10T00:00:00.000Z",
  })}\n`);

  const result = runAgentHandoff({
    cwd,
    taskPath: "docs/tasks/12-fix-flaky-login.md",
    artifactRoot: ".ops",
    nonInteractive: true,
    now: new Date("2026-06-10T00:00:00.000Z"),
    collectGitState: fakeGitState,
  });

  assert.equal(result.handoffPath, ".ops/handoff/12-fix-flaky-login.handoff.md");
  assert.equal(result.sessionPath, ".ops/handoff/12-fix-flaky-login.session.md");
  assert.equal(result.auditPath, ".ops/runs/handoff-audit.jsonl");
  assert.equal(result.interactionLogPath, ".ops/runs/handoff/interactions.jsonl");
  assert.equal(existsSync(join(cwd, result.handoffPath)), true);
  assert.equal(result.dataEvidence[0].adapter, "verify:sql-db");
});

test("agent-handoff redaction gate blocks high severity secrets before writing artifacts", () => {
  const cwd = fixtureDir();
  writeFileSync(
    join(cwd, "docs/tasks/12-fix-flaky-login.md"),
    TASK.replace("- [x] npm test", "- [x] npm test\n- [x] Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"),
  );

  assert.throws(
    () => runAgentHandoff({
      cwd,
      taskPath: "docs/tasks/12-fix-flaky-login.md",
      nonInteractive: true,
      now: new Date("2026-06-10T00:00:00.000Z"),
      collectGitState: fakeGitState,
    }),
    /redaction gate blocked/,
  );

  assert.equal(existsSync(join(cwd, ".agent-skill/handoff/12-fix-flaky-login.handoff.md")), false);
  assert.equal(existsSync(join(cwd, ".agent-skill/handoff/12-fix-flaky-login.session.md")), false);

  const auditPath = join(cwd, ".agent-skill/runs/handoff/redaction-audit.jsonl");
  assert.equal(existsSync(auditPath), true);
  const auditText = readFileSync(auditPath, "utf8");
  assert.match(auditText, /"rule":"bearer-token"/);
  assert.match(auditText, /"blocked":true/);
  assert.doesNotMatch(auditText, /abcdefghijklmnopqrstuvwxyz123456/);
});

test("agent-handoff strict mode rejects malformed task docs", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-handoff-strict-"));
  mkdirSync(join(cwd, "docs/tasks"), { recursive: true });
  writeFileSync(join(cwd, "docs/tasks/13-bad.md"), "# Bad\n## Goal\nMissing sections.\n");

  assert.throws(
    () => runAgentHandoff({
      cwd,
      taskPath: "docs/tasks/13-bad.md",
      strict: true,
      collectGitState: fakeGitState,
    }),
    /strict task doc validation failed/,
  );
});

test("agent-handoff skill docs expose phases, dry-run, strict, resume metadata, and audit requirements", () => {
  const skill = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-handoff/SKILL.md"), "utf8");
  assert.match(skill, /--dry-run/);
  assert.match(skill, /--strict/);
  assert.match(skill, /agent-skill\/handoff@1/);
  assert.match(skill, /\.agent-skill\/runs\/handoff-audit\.jsonl/);
  assert.match(skill, /\.agent-skill\/runs\/handoff\/interactions\.jsonl/);

  for (const phase of ["0-preflight.md", "1-collect.md", "2-render.md", "3-verify.md"]) {
    assert.equal(existsSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-handoff/phases", phase)), true);
  }
});

test("agent-all resume phase documents handoff artifact auto-discovery", () => {
  const phase0 = readFileSync(resolve(repoRoot, "plugins/harness-floor/skills/agent-all/phases/0-preflight.md"), "utf8");
  assert.match(phase0, /discoverResumeArtifacts/);
  assert.match(phase0, /\.handoff\.md/);
  assert.match(phase0, /\.session\.md/);
  assert.match(phase0, /handoff-audit\.jsonl/);
  assert.match(phase0, /handoff\/interactions\.jsonl/);
});
