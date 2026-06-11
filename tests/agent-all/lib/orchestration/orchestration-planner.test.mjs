import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { planRequiredAgents } from "../../../../plugins/harness-floor/skills/agent-all/lib/orchestration/agent-planner.mjs";
import { evaluateSpawnPlan } from "../../../../plugins/harness-floor/skills/agent-all/lib/orchestration/spawn-policy.mjs";
import { appendSpawnLog, spawnLogPath } from "../../../../plugins/harness-floor/skills/agent-all/lib/orchestration/spawn-log-writer.mjs";
import { planDynamicWave } from "../../../../plugins/harness-floor/skills/agent-all/lib/orchestration/wave-planner.mjs";

const readRepoFile = (path) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf-8");

function roles(result, kind = null) {
  return result.requiredAgents
    .filter((agent) => kind === null || agent.kind === kind)
    .map((agent) => agent.role);
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), "orchestration-"));
}

test("UI changes require frontend implementer plus design and QA reviewers", () => {
  const result = planRequiredAgents({
    changedFiles: ["src/components/CheckoutButton.tsx", "src/styles/checkout.css"],
    wave: 2,
  });

  assert.deepEqual(result.changedDomains, ["frontend", "ui"]);
  assert.ok(roles(result, "implementer").includes("frontend-dev"));
  assert.ok(roles(result, "reviewer").includes("design-reviewer"));
  assert.ok(roles(result, "reviewer").includes("qa-reviewer"));
  assert.ok(result.requiredAgents.every((agent) => agent.wave === 2));
  assert.ok(result.requiredAgents.every((agent) => Number.isFinite(agent.costEstimateUSD)));
});

test("migrations fixtures and backfills require backend/data review", () => {
  const result = planRequiredAgents({
    changedFiles: [
      "backend/users/migrations/0002_add_plan.py",
      "backend/users/fixtures/users.json",
      "backend/users/backfills/fix-users.ts",
    ],
  });

  assert.ok(result.changedDomains.includes("data"));
  assert.ok(roles(result, "implementer").includes("backend-dev"));
  assert.ok(roles(result, "reviewer").includes("data-reviewer"));
});

test("auth and security-sensitive paths require security reviewer", () => {
  const result = planRequiredAgents({
    changedFiles: ["backend/middleware/authz.py", "src/stores/session-token.ts"],
  });

  assert.ok(result.changedDomains.includes("security"));
  assert.ok(roles(result, "reviewer").includes("security-reviewer"));
});

test("repeated failure escalates to planner instead of more implementers", () => {
  const result = planRequiredAgents({
    changedFiles: ["src/components/CheckoutButton.tsx"],
    failureSignatures: { "TypeError: cannot read properties of undefined": 3 },
    repeatedFailureThreshold: 3,
  });

  assert.ok(result.failureEscalation.required);
  assert.deepEqual(roles(result, "implementer"), []);
  assert.deepEqual(roles(result, "planner"), ["planner"]);
  assert.match(result.requiredAgents.find((agent) => agent.role === "planner").reason, /Repeated failure signature/);
});

test("spawn policy evaluates every dynamic spawn through policy engine", () => {
  const result = evaluateSpawnPlan({
    runId: "run-12",
    wave: 1,
    platform: "claude",
    requiredAgents: [
      { role: "frontend-dev", kind: "implementer", reason: "UI changed", wave: 1, costEstimateUSD: 2 },
      { role: "qa-reviewer", kind: "reviewer", reason: "UI changed", wave: 1, costEstimateUSD: 1 },
    ],
    state: { changedFiles: ["src/components/Button.tsx"], changedDomains: ["frontend", "ui"] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].result.event.event, "BeforeAgentSpawn");
  assert.equal(result.entries[0].result.event.payload.waveSpawnCount, 2);
});

test("spawn policy denies malformed dynamic spawn metadata", () => {
  const result = evaluateSpawnPlan({
    platform: "claude",
    requiredAgents: [
      { role: "", kind: "reviewer", reason: "", wave: 0, costEstimateUSD: null },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.entries[0].result.results.map((entry) => entry.policyId),
    [
      "dynamic-agent-spawn-role",
      "dynamic-agent-spawn-reason",
      "dynamic-agent-spawn-budget",
    ],
  );
});

test("spawn policy blocks repeated same-role dynamic spawns from history", () => {
  const result = evaluateSpawnPlan({
    platform: "claude",
    policy: { maxDynamicSpawnsPerRole: 1 },
    state: {
      changedFiles: ["src/components/Button.tsx"],
      changedDomains: ["frontend", "ui"],
      spawnedAgents: [
        { role: "frontend-dev", kind: "implementer", wave: 0 },
      ],
    },
    requiredAgents: [
      { role: "frontend-dev", kind: "implementer", reason: "UI changed again", wave: 1, costEstimateUSD: 2 },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.entries[0].result.results.map((entry) => entry.policyId),
    ["dynamic-agent-spawn-role-repeat"],
  );
  assert.equal(result.entries[0].result.event.payload.previousSameRoleSpawnCount, 1);
  assert.equal(result.entries[0].result.event.payload.sameRoleSpawnCount, 2);
});

test("spawn log records role reason wave and cost estimate", () => {
  const cwd = tempProject();
  try {
    const path = appendSpawnLog({
      cwd,
      runId: "run/12",
      wave: 4,
      now: new Date("2026-06-11T00:00:00.000Z"),
      agents: [
        {
          role: "security-reviewer",
          kind: "reviewer",
          reason: "Auth path changed.",
          wave: 4,
          source: "changed-file-classifier",
          costEstimateUSD: 1,
        },
      ],
    });

    assert.equal(path, spawnLogPath({ cwd, runId: "run/12" }));
    const entry = JSON.parse(readFileSync(path, "utf-8").trim());
    assert.equal(entry.schemaVersion, "agent-spawn-log/v1");
    assert.equal(entry.timestamp, "2026-06-11T00:00:00.000Z");
    assert.equal(entry.role, "security-reviewer");
    assert.equal(entry.reason, "Auth path changed.");
    assert.equal(entry.wave, 4);
    assert.equal(entry.costEstimateUSD, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("spawn log redaction gate blocks high severity secret candidates", () => {
  const cwd = tempProject();
  try {
    assert.throws(
      () => appendSpawnLog({
        cwd,
        runId: "run-secret",
        agents: [
          {
            role: "security-reviewer",
            kind: "reviewer",
            reason: "Investigate Bearer abcdefghijklmnopqrstuvwxyz123456",
            costEstimateUSD: 1,
          },
        ],
      }),
      /redaction gate blocked/,
    );
    const path = spawnLogPath({ cwd, runId: "run-secret" });
    assert.throws(() => readFileSync(path, "utf-8"));
    const auditText = readFileSync(join(cwd, ".agent-skill/runs/run-secret/redaction-audit.jsonl"), "utf-8");
    assert.match(auditText, /bearer-token/);
    assert.doesNotMatch(auditText, /abcdefghijklmnopqrstuvwxyz123456/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dynamic wave planner preserves static wave grouping while adding orchestration state", () => {
  const cwd = tempProject();
  try {
    const result = planDynamicWave({
      cwd,
      runId: "run-12",
      wave: 0,
      platform: "claude",
      writePolicyAudit: false,
      writeSpawnLog: true,
      now: new Date("2026-06-11T00:00:00.000Z"),
      waveConfig: { maxParallel: 2, rolesAllowed: ["dev", "frontend-dev"] },
      tasks: [
        { id: 1, role: "frontend-dev", files: ["src/components/Button.tsx"] },
        { id: 2, role: "dev", files: ["docs/usage.md"] },
        { id: 3, role: "backend-dev", files: ["backend/users/models.py"] },
      ],
    });

    assert.equal(result.waves.length, 1);
    assert.deepEqual(result.waveTasks.map((task) => task.id), [1, 2]);
    assert.equal(result.orchestration.runId, "run-12");
    assert.equal(result.orchestration.wave, 0);
    assert.deepEqual(result.orchestration.changedFiles, ["docs/usage.md", "src/components/Button.tsx"]);
    assert.ok(result.orchestration.requiredAgents.some((agent) => agent.role === "frontend-dev"));
    assert.equal(result.spawnPolicy.ok, true);
    assert.equal(result.spawnLogPath, spawnLogPath({ cwd, runId: "run-12" }));
    const loggedRoles = readFileSync(result.spawnLogPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).role);
    assert.ok(loggedRoles.includes("frontend-dev"));
    assert.ok(loggedRoles.includes("qa-reviewer"));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dynamic wave planner carries previous spawned agent history into policy and state", () => {
  const result = planDynamicWave({
    runId: "run-12-repeat",
    wave: 1,
    platform: "claude",
    writePolicyAudit: false,
    policy: { maxDynamicSpawnsPerRole: 1 },
    previousSpawnedAgents: [
      { role: "frontend-dev", kind: "implementer", wave: 0 },
    ],
    waveConfig: { maxParallel: 1, rolesAllowed: ["frontend-dev"] },
    tasks: [
      { id: 1, role: "frontend-dev", files: ["src/components/Button.tsx"] },
      { id: 2, role: "frontend-dev", files: ["src/components/Modal.tsx"] },
    ],
  });

  assert.equal(result.spawnPolicy.ok, false);
  assert.ok(result.orchestration.spawnedAgents.some((agent) => agent.wave === 0));
  assert.ok(!result.orchestration.spawnedAgents.some((agent) => agent.wave === 1 && agent.role === "frontend-dev"));
  assert.ok(result.orchestration.blockedReasons.some((reason) => /role repeated too often/.test(reason)));
});

test("platform phase docs preserve dynamic orchestration state contracts", () => {
  const platforms = [
    "plugins/harness-floor/skills/agent-all",
    "plugins/harness-floor-codex/skills/agent-all-codex",
    "plugins/harness-floor-cursor/skills/agent-all-cursor",
    "plugins/harness-floor-copilot/skills/agent-all-copilot",
    "plugins/harness-floor-gemini/skills/agent-all-gemini",
  ];

  for (const root of platforms) {
    const phase3 = readRepoFile(`${root}/phases/3-dispatch.md`);
    assert.match(phase3, /state\.orchestration/, `${root} phase 3 stores orchestration state`);
    assert.match(phase3, /requiredAgents/, `${root} phase 3 computes required agents`);
    assert.match(phase3, /spawn-log\.jsonl/, `${root} phase 3 logs dynamic spawns`);
    assert.match(phase3, /BeforeAgentSpawn/, `${root} phase 3 emits spawn policy events`);
    assert.match(phase3, /same-role|same role/i, `${root} phase 3 tracks repeated role spawns`);
    assert.match(phase3, /Workflow[\s\S]{0,180}sibling/, `${root} phase 3 avoids nested Workflow`);

    const phase4 = readRepoFile(`${root}/phases/4-gate.md`);
    assert.match(phase4, /orchestration[\s\S]{0,160}requiredAgents/, `${root} phase 4 consumes dynamic roles`);
    assert.match(phase4, /spawn-log\.jsonl/, `${root} phase 4 logs dynamic gate spawns`);

    const phase6 = readRepoFile(`${root}/phases/6-loop.md`);
    assert.match(phase6, /state\.orchestration/, `${root} phase 6 syncs orchestration state`);
    assert.match(phase6, /failureSignatures/, `${root} phase 6 keeps failure signatures`);
    assert.match(phase6, /planner\/user decision/, `${root} phase 6 escalates repeated failures`);
  }
});
