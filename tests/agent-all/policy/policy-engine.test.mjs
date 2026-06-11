import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluatePolicyEvent } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/policy-engine.mjs";
import { policyLogPath } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/audit-log-writer.mjs";
import { validatePolicyResult } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/result-schema.mjs";

function tempProject() {
  return mkdtempSync(join(tmpdir(), "policy-engine-"));
}

test("rejects invalid policy event schema", () => {
  const result = evaluatePolicyEvent({ event: "Nope", platform: "claude" });
  assert.equal(result.ok, false);
  assert.equal(result.action, "deny");
  assert.match(result.results[0].reason, /invalid policy event/);
});

test("accepts verification lifecycle events and rewrite prompt policy results", () => {
  const result = evaluatePolicyEvent({
    event: "AfterVerification",
    platform: "codex",
    runId: "verify-run",
    payload: {
      verificationEvidence: { adapter: "verify:cli", status: "passed", summary: "CLI passed" },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.event.event, "AfterVerification");
  assert.deepEqual(validatePolicyResult({
    schemaVersion: "agent-policy-result/v1",
    policyId: "prompt-normalizer",
    action: "rewrite_prompt",
    severity: "warning",
    reason: "host prompt needs policy addendum",
  }).errors, []);
});

test("denies implementer DONE result without verification evidence", () => {
  const result = evaluatePolicyEvent({
    event: "AfterAgentReturn",
    platform: "claude",
    agent: { role: "implementer", reason: "Implement Task 1", budgetImpactUSD: 0 },
    payload: { resultText: "STATUS: DONE\nTests probably pass." },
  });

  assert.equal(result.ok, false);
  assert.equal(result.results[0].policyId, "missing-verification-token");
  assert.match(result.results[0].reason, /verification_passed/);
});

test("denies reviewer result without audit token", () => {
  const result = evaluatePolicyEvent({
    event: "AfterAgentReturn",
    platform: "claude",
    agent: { role: "reviewer", reason: "Review Task 1", budgetImpactUSD: 0 },
    payload: { resultText: "Looks fine." },
  });

  assert.equal(result.ok, false);
  assert.equal(result.results[0].policyId, "missing-reviewer-audit-token");
  assert.match(result.results[0].reason, /VERIFICATION_AUDIT/);
});

test("denies dynamic spawn without role reason and budget", () => {
  const result = evaluatePolicyEvent({
    event: "BeforeAgentSpawn",
    platform: "claude",
    agent: {},
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "deny");
  assert.deepEqual(
    result.results.map((entry) => entry.policyId),
    [
      "dynamic-agent-spawn-role",
      "dynamic-agent-spawn-reason",
      "dynamic-agent-spawn-budget",
    ],
  );
});

test("denies dynamic spawns beyond wave and same-role caps", () => {
  const waveCap = evaluatePolicyEvent({
    event: "BeforeAgentSpawn",
    platform: "claude",
    agent: { role: "frontend-dev", reason: "UI changed", budgetImpactUSD: 1 },
    payload: { waveSpawnCount: 3 },
  }, { policy: { maxDynamicAgentsPerWave: 2 } });

  assert.equal(waveCap.ok, false);
  assert.equal(waveCap.results[0].policyId, "dynamic-agent-spawn-cap");

  const roleRepeat = evaluatePolicyEvent({
    event: "BeforeAgentSpawn",
    platform: "claude",
    agent: { role: "frontend-dev", reason: "Retry UI implementation", budgetImpactUSD: 1 },
    payload: { sameRoleSpawnCount: 3 },
  }, { policy: { maxDynamicSpawnsPerRole: 2 } });

  assert.equal(roleRepeat.ok, false);
  assert.equal(roleRepeat.results[0].policyId, "dynamic-agent-spawn-role-repeat");
  assert.match(roleRepeat.results[0].nextAction, /planner\/user decision/);
});

test("denies hard blocked command and pathspec commit through common result schema", () => {
  const hard = evaluatePolicyEvent({
    event: "BeforeToolUse",
    platform: "claude",
    toolName: "Bash",
    payload: { command: "git reset --hard", commandAnalysis: { blocked: true, reason: "git reset --hard" } },
  });
  assert.equal(hard.ok, false);
  assert.equal(hard.results[0].policyId, "hard-blocked-command");

  const pathspec = evaluatePolicyEvent({
    event: "BeforeCommit",
    platform: "codex",
    toolName: "shell_command",
    payload: {
      command: "git commit -m msg",
      commandAnalysis: { blocked: true, reason: "git commit requires explicit pathspec after --" },
    },
  });
  assert.equal(pathspec.ok, false);
  assert.equal(pathspec.results[0].policyId, "commit-without-pathspec");
});

test("denies destructive SQL/data operations unless explicitly approved", () => {
  const blocked = evaluatePolicyEvent({
    event: "BeforeToolUse",
    platform: "claude",
    toolName: "SQL",
    payload: { sql: "DELETE FROM users;", destructiveSources: ["queries/delete.sql"] },
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.results[0].policyId, "destructive-data-operation");

  const approved = evaluatePolicyEvent({
    event: "BeforeToolUse",
    platform: "claude",
    toolName: "SQL",
    payload: { sql: "DELETE FROM users;", allowDestructive: true },
  });

  assert.equal(approved.ok, true);
});

test("stops loop on cost and repeated failure signature policies", () => {
  const cost = evaluatePolicyEvent({
    event: "BeforeLoopIteration",
    platform: "claude",
    iteration: 2,
    costUSD: 12,
    breakCondition: "npm test",
    payload: { maxIter: 0 },
  }, { policy: { maxCostUSD: 12 } });
  assert.equal(cost.ok, false);
  assert.equal(cost.action, "stop_loop");
  assert.equal(cost.results[0].policyId, "max-cost-exceeded");

  const repeated = evaluatePolicyEvent({
    event: "AfterBreakCondition",
    platform: "claude",
    payload: {
      failureSignature: "TypeError: boom",
      failureSignatures: { "TypeError: boom": 3 },
    },
  }, { policy: { maxRepeatedFailureSignature: 3 } });
  assert.equal(repeated.ok, false);
  assert.equal(repeated.action, "stop_loop");
  assert.equal(repeated.results[0].policyId, "repeated-failure-signature");
});

test("asks for user decision when cost telemetry reaches warning threshold", () => {
  const result = evaluatePolicyEvent({
    event: "BeforeLoopIteration",
    platform: "claude",
    iteration: 4,
    breakCondition: "npm test",
    payload: {
      maxIter: 0,
      costTelemetry: {
        summary: {
          totalUSD: 8.1,
          budget: { maxCostUSD: 10, warnAtRatio: 0.8 },
        },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "ask_user");
  assert.equal(result.results[0].policyId, "cost-budget-near-limit");
});

test("stops loop when cost telemetry summary exceeds budget", () => {
  const result = evaluatePolicyEvent({
    event: "BeforeLoopIteration",
    platform: "claude",
    iteration: 4,
    breakCondition: "npm test",
    payload: {
      maxIter: 0,
      costTelemetry: {
        records: [
          { platform: "claude", costUSD: 6 },
          { platform: "codex", costUSD: 4 },
        ],
      },
    },
  }, { policy: { maxCostUSD: 10 } });

  assert.equal(result.ok, false);
  assert.equal(result.action, "stop_loop");
  assert.equal(result.results[0].policyId, "max-cost-exceeded");
  assert.equal(result.results[0].details.costUSD, 10);
});

test("denies non-TTY auto decision when audit log marker is missing", () => {
  const result = evaluatePolicyEvent({
    event: "NonTTYDecision",
    platform: "claude",
    payload: { nonTTYAutoDecision: true },
  });

  assert.equal(result.ok, false);
  assert.equal(result.results[0].policyId, "non-tty-auto-decision-log");
});

test("quality debt gate scans changed files before commit", () => {
  const result = evaluatePolicyEvent({
    event: "BeforeCommit",
    platform: "claude",
    changedFiles: ["src/auth.ts", "tests/auth.test.ts"],
    payload: {
      fileContents: {
        "src/auth.ts": "export const token = fallbackToken as any;\n",
        "tests/auth.test.ts": "test('coverage only', () => { expect(true).toBe(true); });\n",
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "deny");
  assert.equal(result.results[0].policyId, "quality-debt-gate");
  assert.match(result.results[0].reason, /quality debt|fallback|meaningless/i);
});

test("quality debt gate accepts task-doc exceptions with issue and expiry", () => {
  const result = evaluatePolicyEvent({
    event: "BeforeCommit",
    platform: "claude",
    changedFiles: ["src/legacy.ts"],
    payload: {
      fileContents: {
        "src/legacy.ts": "export const token = fallbackToken;\n",
      },
      taskDocText: [
        "## Quality Debt Exceptions",
        "",
        "| Item | Reason | Owner | Follow-up issue | Expiry |",
        "|---|---|---|---|---|",
        "| fallback in src/legacy.ts | legacy API migration | @owner | #123 | 2026-06-30 |",
      ].join("\n"),
    },
  }, {
    now: new Date("2026-06-11T00:00:00Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.results[0].policyId, "default-allow");
});

test("redaction policy denies high severity secret candidates in PR body", () => {
  const result = evaluatePolicyEvent({
    event: "BeforePRCreate",
    platform: "claude",
    runId: "run-1",
    payload: {
      prBody: "Debug header used Bearer abcdefghijklmnopqrstuvwxyz123456",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.action, "deny");
  assert.equal(result.results[0].policyId, "secret-redaction-gate");
  assert.match(result.results[0].reason, /secret\/privacy candidate/);
  const serialized = JSON.stringify(result.results[0]);
  assert.match(serialized, /bearer-token/);
  assert.doesNotMatch(serialized, /abcdefghijklmnopqrstuvwxyz123456/);
});

test("redaction policy honors rule allowlist without value allowlist", () => {
  const result = evaluatePolicyEvent({
    event: "BeforePRCreate",
    platform: "claude",
    runId: "run-1",
    payload: {
      prBody: "Debug header used Bearer abcdefghijklmnopqrstuvwxyz123456",
    },
  }, {
    policy: {
      security: {
        redaction: {
          allowRules: ["bearer-token"],
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.results[0].policyId, "default-allow");
});

test("writes policy JSONL audit log", () => {
  const cwd = tempProject();
  try {
    const result = evaluatePolicyEvent({
      event: "BeforeLoopIteration",
      platform: "claude",
      runId: "run/1",
      iteration: 1,
      breakCondition: "npm test",
      payload: { maxIter: 3 },
    }, {
      cwd,
      writeAudit: true,
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.auditPath, policyLogPath({ cwd, runId: "run/1" }));
    const lines = readFileSync(result.auditPath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.timestamp, "2026-06-11T00:00:00.000Z");
    assert.equal(entry.event, "BeforeLoopIteration");
    assert.equal(entry.action, "allow");
    assert.equal(entry.runId, "run/1");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("loads project policy from .agent-all.json and .agent-skill/policy.json", () => {
  const cwd = tempProject();
  try {
    writeFileSync(join(cwd, ".agent-all.json"), JSON.stringify({
      policy: { maxDynamicAgentsPerWave: 1 },
    }));
    mkdirSync(join(cwd, ".agent-skill"), { recursive: true });
    writeFileSync(join(cwd, ".agent-skill/policy.json"), JSON.stringify({
      maxDynamicAgentsPerWave: 2,
    }));

    const result = evaluatePolicyEvent({
      event: "BeforeAgentSpawn",
      platform: "claude",
      agent: { role: "implementer", reason: "Implement Task 1", budgetImpactUSD: 0 },
      payload: { waveSpawnCount: 2 },
    }, { cwd });

    assert.equal(result.ok, true);
    assert.equal(result.policy.maxDynamicAgentsPerWave, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
