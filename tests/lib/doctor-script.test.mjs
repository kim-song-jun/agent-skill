import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const DOCTOR = resolve("scripts/doctor.mjs");
const CLAUDE_PLUGIN_DOCTOR = resolve("plugins/harness-builder/bin/doctor.mjs");
const CODEX_PLUGIN_DOCTOR = resolve("plugins/harness-builder-codex/bin/doctor.mjs");
const INSTALL_PLATFORM = resolve("scripts/install-platform.sh");

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeRel(root, rel, content = "") {
  const abs = resolve(root, rel);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

function claudeDoctorFixtureContent(rel) {
  if (rel === "CLAUDE.md" || rel === "AGENTS.md") {
    return [
      "# Doctor Fixture",
      "",
      "## Role Routing",
      "",
      "- `orchestrator`: wave ownership and HOT-file detection.",
      "",
      "## Orchestration Contract",
      "",
      "- Main thread/orchestrator owns task docs and pathspec commits.",
      "",
      "## Role Gate Matrix",
      "",
      "| Trigger | Required gate | Evidence |",
      "|---------|---------------|----------|",
      "| UI or user-visible flow | `design-reviewer` + `qa-reviewer` | UX findings plus `QA_AUDIT` |",
      "",
      "## Configured QA Personas",
      "",
      "- auth",
      "- payments",
      "",
    ].join("\n");
  }
  if (rel === ".claude/agents/qa-reviewer.md") {
    return [
      "# QA Reviewer",
      "",
      "## Configured QA Personas",
      "",
      "- auth",
      "- payments",
      "",
      "Return `QA_AUDIT: passed`, `QA_AUDIT: failed`, or `QA_AUDIT: skipped`.",
      "",
    ].join("\n");
  }
  return rel.endsWith(".json") ? "{}\n" : `${rel}\n`;
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
    assert.ok(data.checks.some((check) => check.path === ".codex/skills/debug-codex/SKILL.md"), "operational doctor must validate debug skill");
    assert.ok(data.checks.some((check) => check.path === ".codex/skills/debug-codex/lib/debug-artifacts.mjs"), "operational doctor must validate debug artifact helper");
    assert.ok(data.checks.some((check) => check.path === "docs/debug/index.md"), "operational doctor must validate debug docs");
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

test("doctor validates a Codex debug-only scaffold without requiring builder files", () => {
  const target = tmp("agent-skill-doctor-codex-debug-");
  const home = tmp("agent-skill-doctor-codex-debug-home-");
  try {
    const install = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=debug",
      "--no-doctor",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(install.status, 0, `stdout:\n${install.stdout}\nstderr:\n${install.stderr}`);

    const auto = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=codex",
      `--target=${target}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(auto.status, 0, `stdout:\n${auto.stdout}\nstderr:\n${auto.stderr}`);
    const data = JSON.parse(auto.stdout);
    assert.equal(data.ok, true);
    assert.equal(data.profile, "debug");
    assert.ok(data.checks.some((check) => check.path === ".codex/skills/debug-codex/SKILL.md"));
    assert.ok(data.checks.some((check) => check.path === ".codex/skills/debug-codex/lib/debug-artifacts.mjs"));
    assert.ok(!data.checks.some((check) => check.path === "AGENTS.md"), "debug profile must not require builder root guidance");

    rmSync(resolve(target, ".codex/skills/debug-codex"), { recursive: true, force: true });
    const broken = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=codex",
      "--profile=debug",
      `--target=${target}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.notEqual(broken.status, 0, "missing debug skill must fail debug doctor");
    const brokenData = JSON.parse(broken.stdout);
    assert.ok(brokenData.failures.some((failure) => failure.path === ".codex/skills/debug-codex/SKILL.md"));
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("doctor rejects the debug profile for Claude project scaffolds", () => {
  const target = tmp("agent-skill-doctor-claude-debug-profile-");
  try {
    writeRel(target, "CLAUDE.md", "Claude project\n");

    const res = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=claude",
      "--profile=debug",
      `--target=${target}`,
      "--json",
    ], { encoding: "utf-8" });

    assert.notEqual(res.status, 0, "Claude debug project bootstrap is not a doctor profile");
    const data = JSON.parse(res.stdout);
    assert.equal(data.ok, false);
    assert.ok(data.failures.some((failure) => failure.path === "--profile" && /unknown profile: debug/.test(failure.message)));
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
      writeRel(target, rel, claudeDoctorFixtureContent(rel));
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

test("doctor rejects operational scaffolds missing orchestration guidance and QA persona propagation", () => {
  const target = tmp("agent-skill-doctor-stale-codex-");
  const home = tmp("agent-skill-doctor-stale-home-");
  try {
    const install = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=builder",
      "--no-doctor",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(install.status, 0, `stdout:\n${install.stdout}\nstderr:\n${install.stderr}`);
    writeRel(target, "AGENTS.md", [
      "# Stale Codex Guidance",
      "",
      "## Role Routing",
      "",
      "## QA Personas",
      "",
      "- auth",
      "",
    ].join("\n"));
    writeRel(target, ".codex/skills/qa-reviewer/SKILL.md", [
      "# QA Reviewer",
      "",
      "Return `QA_AUDIT: passed`, `QA_AUDIT: failed`, or `QA_AUDIT: skipped`.",
      "",
    ].join("\n"));

    const res = spawnSync(process.execPath, [
      DOCTOR,
      "--platform=codex",
      "--profile=builder",
      `--target=${target}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.notEqual(res.status, 0, "stale operational guidance must fail doctor");
    const data = JSON.parse(res.stdout);
    assert.equal(data.ok, false);
    assert.ok(data.failures.some((failure) => failure.path === "AGENTS.md" && /Orchestration Contract/.test(failure.message)));
    assert.ok(data.failures.some((failure) => failure.type === "persona" && /auth/.test(failure.message)));
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("plugin-local doctor wrappers validate Claude and Codex scaffolds without the repo-level script", () => {
  const codexTarget = tmp("agent-skill-doctor-plugin-codex-");
  const claudeTarget = tmp("agent-skill-doctor-plugin-claude-");
  const home = tmp("agent-skill-doctor-plugin-home-");
  try {
    const install = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${codexTarget}`,
      "--theme=builder",
      "--no-doctor",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(install.status, 0, `stdout:\n${install.stdout}\nstderr:\n${install.stderr}`);

    const codex = spawnSync(process.execPath, [
      CODEX_PLUGIN_DOCTOR,
      "--platform=codex",
      "--profile=builder",
      `--target=${codexTarget}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(codex.status, 0, `stdout:\n${codex.stdout}\nstderr:\n${codex.stderr}`);
    const codexData = JSON.parse(codex.stdout);
    assert.equal(codexData.ok, true);
    assert.equal(codexData.platform, "codex");
    assert.equal(codexData.profile, "builder");

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
      writeRel(claudeTarget, rel, claudeDoctorFixtureContent(rel));
    }
    writeRel(claudeTarget, ".visual-qa.json", "{}\n");
    writeRel(claudeTarget, ".agent-all.json", "{}\n");

    const claude = spawnSync(process.execPath, [
      CLAUDE_PLUGIN_DOCTOR,
      "--platform=claude",
      "--profile=operational",
      `--target=${claudeTarget}`,
      "--json",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(claude.status, 0, `stdout:\n${claude.stdout}\nstderr:\n${claude.stderr}`);
    const claudeData = JSON.parse(claude.stdout);
    assert.equal(claudeData.ok, true);
    assert.equal(claudeData.platform, "claude");
    assert.equal(claudeData.profile, "operational");
  } finally {
    rmSync(codexTarget, { recursive: true, force: true });
    rmSync(claudeTarget, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
