import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HOOK = resolve(
  "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs",
);

function tempProject() {
  return mkdtempSync(join(tmpdir(), "codex-policy-hook-"));
}

function runHook({ projectDir, command }) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: projectDir,
    env: { ...process.env, CODEX_PROJECT_DIR: projectDir },
    input: JSON.stringify({
      tool_name: "shell_command",
      tool_input: { command },
    }),
    encoding: "utf-8",
  });
}

test("generated Codex policy hook denies pathspec-less commit and writes audit JSONL", () => {
  const projectDir = tempProject();
  try {
    const result = runHook({ projectDir, command: "git commit -m msg" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /explicit pathspec/);

    const logPath = join(projectDir, ".agent-skill/runs/default/policy-log.jsonl");
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim().split("\n").at(-1));
    assert.equal(entry.event, "BeforeCommit");
    assert.equal(entry.platform, "codex");
    assert.equal(entry.action, "deny");
    assert.equal(entry.results[0].policyId, "commit-without-pathspec");
    assert.equal(entry.results[0].schemaVersion, "agent-policy-result/v1");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated Codex policy hook blocks shared-worktree git-safety violations (rules 6/7/8)", () => {
  const projectDir = tempProject();
  try {
    for (const command of ["git stash", "git stash push -m wip"]) {
      const r = runHook({ projectDir, command });
      assert.equal(r.status, 2, `${command} must be blocked`);
      assert.match(r.stderr, /git stash/);
    }
    assert.equal(runHook({ projectDir, command: "git stash list" }).status, 0);

    const checkoutB = runHook({ projectDir, command: "git checkout -b feature" });
    assert.equal(checkoutB.status, 2, "git checkout -b must be blocked");
    assert.match(checkoutB.stderr, /git checkout -b/);
    for (const command of ["git switch -c feature", "git switch other-branch"]) {
      assert.equal(runHook({ projectDir, command }).status, 2, `${command} must be blocked`);
    }

    for (const command of ["git clean -fd", "git clean -f"]) {
      const r = runHook({ projectDir, command });
      assert.equal(r.status, 2, `${command} must be blocked`);
      assert.match(r.stderr, /git clean/);
    }
    assert.equal(runHook({ projectDir, command: "git clean -n" }).status, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("generated Codex policy hook reads .agent-skill/policy.json command policy", () => {
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

test("generated Codex policy hook blocks quality debt before commit", () => {
  const projectDir = tempProject();
  try {
    mkdirSync(join(projectDir, "tests"), { recursive: true });
    writeFileSync(
      join(projectDir, "tests/auth.test.ts"),
      "test('coverage only', () => { expect(true).toBe(true); });\n",
    );

    const result = runHook({ projectDir, command: "git commit -m msg -- tests/auth.test.ts" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /test assertion|quality debt/i);

    const logPath = join(projectDir, ".agent-skill/runs/default/policy-log.jsonl");
    const entry = JSON.parse(readFileSync(logPath, "utf-8").trim().split("\n").at(-1));
    assert.equal(entry.event, "BeforeCommit");
    assert.equal(entry.platform, "codex");
    assert.equal(entry.results[0].policyId, "quality-debt-gate");
    assert.equal(entry.results[0].action, "deny");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
