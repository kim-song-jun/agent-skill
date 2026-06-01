import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DOCTOR = resolve("scripts/doctor.mjs");
const INSTALL_PLATFORM = resolve("scripts/install-platform.sh");

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeRel(root, rel, content = "") {
  const abs = resolve(root, rel);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

test("doctor validates an installed Codex operational scaffold", () => {
  const target = tmp("agent-skill-doctor-codex-operational-");
  const home = tmp("agent-skill-doctor-codex-home-");
  try {
    const install = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(install.status, 0, `stdout:\n${install.stdout}\nstderr:\n${install.stderr}`);

    const res = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=codex",
      `--target=${target}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const data = JSON.parse(res.stdout);
    assert.equal(data.ok, true);
    assert.equal(data.platform, "codex");
    assert.equal(data.profile, "operational");
    assert.ok(data.summary.passed >= 20, "expected a broad Codex operational check set");
    assert.deepEqual(data.failures, []);
    assert.ok(data.warnings.some((warning) => /foundations missing: superpowers, context-mode/.test(warning.message)));
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("doctor accepts Codex lite but fails the same target when operational is required", () => {
  const target = tmp("agent-skill-doctor-codex-lite-");
  try {
    const install = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--lite",
    ], {
      encoding: "utf-8",
    });

    assert.equal(install.status, 0, `stdout:\n${install.stdout}\nstderr:\n${install.stderr}`);

    const lite = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=codex",
      "--profile=lite",
      `--target=${target}`,
    ], { encoding: "utf-8" });

    assert.equal(lite.status, 0, `stdout:\n${lite.stdout}\nstderr:\n${lite.stderr}`);
    assert.match(lite.stdout, /harness doctor: ok/i);
    assert.match(lite.stdout, /profile: lite/i);

    const operational = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=codex",
      "--profile=operational",
      `--target=${target}`,
    ], { encoding: "utf-8" });

    assert.notEqual(operational.status, 0, "lite scaffold must not satisfy operational checks");
    assert.match(`${operational.stdout}\n${operational.stderr}`, /\.codex\/skills\/agent-all-codex\/SKILL\.md|\.agent-all\.json/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("doctor validates a Claude operational scaffold and detects foundations when installed", () => {
  const target = tmp("agent-skill-doctor-claude-operational-");
  const home = tmp("agent-skill-doctor-claude-home-");
  try {
    for (const rel of [
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/settings.local.json",
      ".claude/hooks/context-mode-router.mjs",
      ".claude/hooks/session-summary.mjs",
      ".claude/hooks/cache-heal.mjs",
      ".claude/hooks/agent-policy-hook.mjs",
      ".claude/agents/planner.md",
      ".claude/agents/dev.md",
      ".claude/agents/reviewer.md",
      ".claude/agents/orchestrator.md",
      ".claude/agents/integration-dev.md",
      ".claude/agents/verification-reviewer.md",
      ".claude/agents/qa-reviewer.md",
      ".claude/agents/design-reviewer.md",
      ".claude/agents/security-reviewer.md",
      ".claude/agents/data-reviewer.md",
      "docs/tasks/index.md",
      "docs/tasks/_template.md",
      "docs/tasks/_handoff-template.md",
      "scripts/agent-task-ledger-check.mjs",
    ]) {
      writeRel(target, rel, rel.endsWith(".json") ? "{}\n" : `${rel}\n`);
    }
    writeRel(target, ".visual-qa.json", '{"mode":"comprehensive"}\n');
    writeRel(target, ".agent-all.json", '{"language":"en"}\n');
    writeRel(
      home,
      ".claude/plugins/installed_plugins.json",
      JSON.stringify({
        plugins: {
          "superpowers@claude-plugins-official": {},
          "context-mode@context-mode": {},
        },
      }),
    );

    const res = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=claude",
      `--target=${target}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const data = JSON.parse(res.stdout);
    assert.equal(data.ok, true);
    assert.equal(data.platform, "claude");
    assert.equal(data.profile, "operational");
    assert.equal(data.foundationState.degraded, false);
    assert.deepEqual(data.warnings, []);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("doctor auto-detects platform and exits non-zero for missing required files", () => {
  const target = tmp("agent-skill-doctor-broken-codex-");
  try {
    writeRel(target, "AGENTS.md", "Role Routing\n");
    writeRel(target, ".codex/skills/planner/SKILL.md", "---\nname: planner\n---\n");

    const res = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=auto",
      "--profile=operational",
      `--target=${target}`,
      "--json",
    ], { encoding: "utf-8" });

    assert.notEqual(res.status, 0, "broken scaffold must fail doctor");
    const data = JSON.parse(res.stdout);
    assert.equal(data.ok, false);
    assert.equal(data.platform, "codex");
    assert.ok(data.failures.some((failure) => failure.path === ".codex/skills/dev/SKILL.md"));
    assert.ok(data.failures.some((failure) => failure.path === ".agent-all.json"));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
