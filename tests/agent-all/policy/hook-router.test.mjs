import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HOOK = resolve("plugins/harness-floor/bin/floor-policy-hook.mjs");

function runHook(event, payload, env = {}) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    // Pin language so the test is deterministic regardless of the
    // developer's locale. (i18n is exercised separately in renderer-i18n.test.)
    env: { ...process.env, AGENT_ALL_LANGUAGE: "en", AGENT_POLICY_AUDIT: "0", ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("PreToolUse on Task with implementer description injects addendum", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo", prompt: "do the thing" },
  });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /Decision-Surfacing Protocol/);
});

test("PreToolUse on non-Task tool is passthrough", () => {
  const r = runHook("PreToolUse", { tool: "Read", parameters: { file_path: "x" } });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out, { tool: "Read", parameters: { file_path: "x" } });
});

test("PostToolUse on Task with DONE+verification passes through", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo" },
    result: "STATUS: DONE\nverification_passed: ok",
  });
  assert.equal(r.code, 0);
});

test("PostToolUse on Task with DONE but no verification rejects (exit non-zero)", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo" },
    result: "STATUS: DONE\nLooks good.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /verification/);
});

test("PostToolUse on reviewer Task without VERIFICATION_AUDIT rejects", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Review Task 1: foo" },
    result: "STATUS: DONE\nverification_passed: ok\nLooks fine.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /VERIFICATION_AUDIT/);
});

test("floor policy hook appends common policy JSONL audit records", () => {
  const projectDir = mkdtempSync(join(tmpdir(), "floor-policy-hook-"));
  try {
    const r = runHook("PostToolUse", {
      tool: "Task",
      parameters: { description: "Implement Task 1: foo" },
      result: "STATUS: DONE\nverification_passed: ok",
    }, {
      CLAUDE_PROJECT_DIR: projectDir,
      AGENT_SKILL_RUN_ID: "hook-run",
      AGENT_POLICY_AUDIT: "1",
    });

    assert.equal(r.code, 0, r.stderr);
    const logPath = join(projectDir, ".agent-skill/runs/hook-run/policy-log.jsonl");
    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.event, "AfterAgentReturn");
    assert.equal(entry.platform, "claude");
    assert.equal(entry.action, "allow");
    assert.equal(entry.agent.role, "implementer");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("floor policy hook honors .agent-skill/policy.json verification opt-out", () => {
  const projectDir = mkdtempSync(join(tmpdir(), "floor-policy-hook-"));
  try {
    mkdirSync(join(projectDir, ".agent-skill"), { recursive: true });
    writeFileSync(join(projectDir, ".agent-skill/policy.json"), JSON.stringify({
      verification: false,
    }));

    const r = runHook("PostToolUse", {
      tool: "Task",
      parameters: { description: "Implement Task 1: foo" },
      result: "STATUS: DONE\nNo verification marker.",
    }, {
      CLAUDE_PROJECT_DIR: projectDir,
      AGENT_SKILL_RUN_ID: "policy-off",
      AGENT_POLICY_AUDIT: "1",
    });

    assert.equal(r.code, 0, r.stderr);
    const logPath = join(projectDir, ".agent-skill/runs/policy-off/policy-log.jsonl");
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim().split("\n").at(-1));
    assert.equal(entry.action, "allow");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
