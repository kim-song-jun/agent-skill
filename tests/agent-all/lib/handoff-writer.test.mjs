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

test("embeds machine-readable metadata without fenced raw logs", () => {
  const out = renderHandoff({
    title: "Task 12",
    metadata: {
      schema: "agent-skill/handoff@1",
      taskPath: "docs/tasks/12-x.md",
      nextActions: [{ id: "resume-agent-all" }],
    },
    nextActions: [
      {
        id: "resume-agent-all",
        label: "Resume /agent-all",
        command: "/agent-all docs/tasks/12-x.md --resume",
        reason: "continue from generated artifacts",
        recommended: true,
      },
    ],
  });

  assert.match(out, /agent-handoff-metadata/);
  assert.match(out, /"schema": "agent-skill\/handoff@1"/);
  assert.match(out, /Recommended: Resume \/agent-all/);
  assert.equal(out.includes("```"), false);
});

test("renders loop state for interrupted or exhausted handoffs", () => {
  const out = renderHandoff({
    title: "Loop task",
    loopState: {
      iter: 17,
      maxIter: null,
      maxIterMode: "unlimited",
      consecutivePass: 0,
      costUSD: 12.5,
      maxCostUSD: 80,
      elapsedRuntimeSec: 3600,
      maxRuntimeSec: 3600,
      lastBreakConditionExit: 1,
      lastFailureSignature: "pytest::test_login_timeout",
      failureSignatures: { "pytest::test_login_timeout": 3 },
      lastVerifierSummary: "pytest failed",
      lastTouchedFiles: ["tests/login.test.ts"],
      nextAction: "Escalate to planner/user decision before another implementation iteration.",
    },
  });

  assert.match(out, /## Loop State/);
  assert.match(out, /iter: 17 \/ maxIter: unlimited/);
  assert.match(out, /runtimeSec: 3600 \/ maxRuntimeSec: 3600/);
  assert.match(out, /lastFailureSignature: pytest::test_login_timeout/);
  assert.match(out, /failureSignatures: pytest::test_login_timeout=3/);
  assert.match(out, /nextAction: Escalate to planner\/user decision/);
});

test("renders data artifact and validation evidence when present", () => {
  const out = renderHandoff({
    title: "Analysis",
    dataEvidence: [
      {
        adapter: "verify:notebook-data",
        status: "passed",
        summary: "Notebook clean execution passed",
        artifacts: ["outputs/summary.csv"],
        runId: "data-run",
      },
    ],
  });

  assert.match(out, /## Data Artifacts \/ Evidence/);
  assert.match(out, /verify:notebook-data passed: Notebook clean execution passed/);
  assert.match(out, /outputs\/summary\.csv/);
});

test("renders cost telemetry summary without raw records", () => {
  const out = renderHandoff({
    title: "Costly loop",
    costTelemetry: {
      summary: {
        totalUSD: 8.25,
        calls: 3,
        inputTokens: 1000,
        cachedInputTokens: 200,
        outputTokens: 500,
        totalTokens: 1500,
        bySource: { reported: 8.25 },
        byPlatform: { claude: 5, codex: 3.25 },
        byModel: { unknown: 8.25 },
        budget: { status: "near_limit", maxCostUSD: 10 },
      },
      records: [{ transcript: "SECRET RAW TRANSCRIPT" }],
    },
  });

  assert.match(out, /## Cost Telemetry/);
  assert.match(out, /totalUSD: \$8\.2500/);
  assert.match(out, /budget: near_limit/);
  assert.doesNotMatch(out, /SECRET RAW TRANSCRIPT/);
});
