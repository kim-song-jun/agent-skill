import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
