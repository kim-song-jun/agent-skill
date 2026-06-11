import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const HOOK = resolve(
  "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
);

function tempProject() {
  return mkdtempSync(join(tmpdir(), "agent-policy-hook-"));
}

function runHook({ projectDir, command }) {
  return spawnSync(
    process.execPath,
    [HOOK],
    {
      cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      input: JSON.stringify({ tool_input: { command } }),
      encoding: "utf-8",
    },
  );
}

function runHookPayload({ projectDir, event, payload }) {
  return spawnSync(
    process.execPath,
    [HOOK, event],
    {
      cwd: projectDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      input: JSON.stringify(payload),
      encoding: "utf-8",
    },
  );
}

test("generated policy hook blocks project-configured destructive commands and flags", () => {
  const projectDir = tempProject();
  try {
    writeFileSync(
      join(projectDir, ".agent-all.json"),
      JSON.stringify({
        policy: {
          destructiveCommands: ["pnpm deploy"],
          destructiveConfirmFlags: ["--yes"],
        },
      }),
    );

    const deploy = runHook({ projectDir, command: "pnpm deploy --prod" });
    assert.equal(deploy.status, 2);
    assert.match(deploy.stderr, /destructive command pattern: pnpm deploy/);

    const confirm = runHook({ projectDir, command: "deploy --yes" });
    assert.equal(confirm.status, 2);
    assert.match(confirm.stderr, /destructive confirmation flag: --yes/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook reads .agent-skill/policy.json command policy", () => {
  const projectDir = tempProject();
  try {
    mkdirSync(join(projectDir, ".agent-skill"), { recursive: true });
    writeFileSync(
      join(projectDir, ".agent-skill/policy.json"),
      JSON.stringify({ destructiveCommands: ["pnpm deploy"] }),
    );

    const result = runHook({ projectDir, command: "pnpm deploy --prod" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /destructive command pattern: pnpm deploy/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook blocks quality debt before commit", () => {
  const projectDir = tempProject();
  try {
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "src/auth.ts"), "export const token = fallback;\n");

    const result = runHook({ projectDir, command: "git commit -m msg -- src/auth.ts" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /fallback|quality debt/i);

    const logPath = join(projectDir, ".agent-skill/runs/default/policy-log.jsonl");
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim().split("\n").at(-1));
    assert.equal(entry.event, "BeforeCommit");
    assert.equal(entry.results[0].policyId, "quality-debt-gate");
    assert.equal(entry.results[0].action, "requires_justification");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook accepts task-doc quality debt exceptions", () => {
  const projectDir = tempProject();
  try {
    mkdirSync(join(projectDir, "src"), { recursive: true });
    mkdirSync(join(projectDir, ".agent-skill/tasks"), { recursive: true });
    writeFileSync(join(projectDir, "src/auth.ts"), "export const token = fallback;\n");
    writeFileSync(
      join(projectDir, ".agent-all-state.json"),
      JSON.stringify({ task: { path: ".agent-skill/tasks/T-20990101-001-auth.md" } }),
    );
    writeFileSync(
      join(projectDir, ".agent-skill/tasks/T-20990101-001-auth.md"),
      [
        "# Auth",
        "",
        "## Quality Debt Exceptions",
        "",
        "| Item | Reason | Owner | Follow-up issue | Expiry |",
        "|---|---|---|---|---|",
        "| fallback in src/auth.ts | legacy API migration | @owner | #123 | 2099-01-01 |",
      ].join("\n"),
    );

    const result = runHook({ projectDir, command: "git commit -m msg -- src/auth.ts" });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook writes common policy audit JSONL for shell decisions", () => {
  const projectDir = tempProject();
  try {
    const result = runHook({ projectDir, command: "echo ok" });
    assert.equal(result.status, 0, result.stderr);
    const logPath = join(projectDir, ".agent-skill/runs/default/policy-log.jsonl");
    const line = readFileSync(logPath, "utf-8").trim().split("\n").at(-1);
    const entry = JSON.parse(line);
    assert.equal(entry.event, "BeforeToolUse");
    assert.equal(entry.platform, "claude");
    assert.equal(entry.action, "allow");
    assert.equal(entry.results[0].schemaVersion, "agent-policy-result/v1");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook injects coordinator Task audit directive", () => {
  const projectDir = tempProject();
  try {
    const result = runHookPayload({
      projectDir,
      event: "PreToolUse",
      payload: {
        tool_name: "Task",
        tool_input: {
          description: "Orchestration Gate Task",
          prompt: "Inspect the plan.",
        },
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.match(output.tool_input.prompt, /ORCHESTRATION_AUDIT: passed/);
    assert.doesNotMatch(output.tool_input.prompt, /QA_AUDIT:/);
    assert.doesNotMatch(output.tool_input.prompt, /VERIFICATION_AUDIT:/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook injects reviewer and QA Task audit directives", () => {
  const projectDir = tempProject();
  try {
    const reviewer = runHookPayload({
      projectDir,
      event: "PreToolUse",
      payload: {
        tool_name: "Task",
        tool_input: {
          description: "Spec Review Task",
          prompt: "Review the implementation.",
        },
      },
    });
    assert.equal(reviewer.status, 0, reviewer.stderr);
    const reviewerOutput = JSON.parse(reviewer.stdout);
    assert.match(reviewerOutput.tool_input.prompt, /VERIFICATION_AUDIT: passed/);
    assert.doesNotMatch(reviewerOutput.tool_input.prompt, /QA_AUDIT:/);

    const qa = runHookPayload({
      projectDir,
      event: "PreToolUse",
      payload: {
        tool_name: "Task",
        tool_input: {
          description: "QA Review Task",
          prompt: "Review the user flow.",
        },
      },
    });
    assert.equal(qa.status, 0, qa.stderr);
    const qaOutput = JSON.parse(qa.stdout);
    assert.match(qaOutput.tool_input.prompt, /QA_AUDIT: passed/);
    assert.doesNotMatch(qaOutput.tool_input.prompt, /VERIFICATION_AUDIT:/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook rejects Task audit results without required tokens", () => {
  const projectDir = tempProject();
  try {
    for (const [description, message] of [
      ["Orchestration Gate Task", /ORCHESTRATION_AUDIT/],
      ["QA Review Task", /QA_AUDIT/],
      ["Security Review Task", /VERIFICATION_AUDIT/],
    ]) {
      const result = runHookPayload({
        projectDir,
        event: "PostToolUse",
        payload: {
          tool_name: "Task",
          tool_input: { description, prompt: "Review." },
          result: "Looks fine.",
        },
      });

      assert.equal(result.status, 2, `${description} should be rejected`);
      assert.match(result.stderr, message);
    }
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook rejects implementer DONE without verification evidence", () => {
  const projectDir = tempProject();
  try {
    const result = runHookPayload({
      projectDir,
      event: "PostToolUse",
      payload: {
        tool_name: "Task",
        tool_input: {
          description: "Implement Task 1",
          prompt: "Implement the task.",
        },
        result: "STATUS: DONE\nTests passed.",
      },
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /verification_passed/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated policy hook ignores missing and invalid project config", () => {
  const missingConfigDir = tempProject();
  try {
    const result = runHook({ projectDir: missingConfigDir, command: "echo ok" });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(missingConfigDir, { recursive: true, force: true });
  }

  const invalidConfigDir = tempProject();
  try {
    writeFileSync(join(invalidConfigDir, ".agent-policy.json"), "{ invalid json");
    const result = runHook({ projectDir: invalidConfigDir, command: "pnpm deploy --prod" });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(invalidConfigDir, { recursive: true, force: true });
  }
});
