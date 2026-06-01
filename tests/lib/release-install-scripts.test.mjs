import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(".");
const INSTALL_ALL = resolve(REPO, "scripts/install-all.sh");
const INSTALL_PLATFORM = resolve(REPO, "scripts/install-platform.sh");

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("install-all --dry-run for Claude essentials does not require the claude binary", () => {
  const res = spawnSync("/bin/bash", [INSTALL_ALL, "--dry-run", "--claude-code"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /DRY-RUN: claude plugin install harness-builder@agent-skill/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install harness-floor@agent-skill/);
  assert.doesNotMatch(res.stderr, /claude' binary not found/);
});

test("install-platform codex all succeeds in a fresh project without patching global Codex config", () => {
  const target = tmp("agent-skill-release-codex-target-");
  const home = tmp("agent-skill-release-codex-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=all",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    for (const rel of [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      ".codex/hooks/thrift-pretool-bash-telemetry.toml",
      "docs/tasks/index.md",
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }

    const agents = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(agents, /Operational Profile/);
    assert.match(agents, /docs\/tasks/);

    assert.match(res.stdout, /\[\[hooks\.PreToolUse\]\]/);
    assert.match(res.stdout, /\[mcp_servers\.playwright\]/);
    assert.match(res.stdout, /instrument:\s+no/);
    assert.doesNotMatch(res.stdout, /\[\[hooks\.agent\]\]/);
    assert.doesNotMatch(res.stdout, /MVP scope|follow-up plan/i);
    assert.doesNotMatch(res.stderr, /Cannot patch/);
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "installer must not create or patch global Codex config");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
