import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { QA_AUTOSCAFFOLD_CONFIG as CODEX_QA_AUTOSCAFFOLD_CONFIG } from "../../plugins/harness-floor-codex/skills/agent-all-codex/lib/break-resolver.mjs";

const REPO = resolve(".");
const INSTALL_ALL = resolve(REPO, "scripts/install-all.sh");
const INSTALL_PLATFORM = resolve(REPO, "scripts/install-platform.sh");
const UPDATE = resolve(REPO, "scripts/update.sh");

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
      ".codex/skills/visual-qa-page/SKILL.md",
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

test("install-platform codex all emits only dispatchable floor skill roles", () => {
  const target = tmp("agent-skill-release-codex-graph-target-");
  const home = tmp("agent-skill-release-codex-graph-home-");
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
    const agentAll = JSON.parse(readFileSync(resolve(target, ".agent-all.json"), "utf-8"));
    const configuredRoles = Object.values(agentAll.waves)
      .flatMap((wave) => wave.rolesAllowed);
    for (const role of configuredRoles) {
      assert.ok(!role.includes("*"), `role globs are not dispatchable in Codex sequential mode: ${role}`);
      assert.ok(existsSync(resolve(target, `.codex/skills/${role}/SKILL.md`)), `missing skill file for ${role}`);
    }

    const visualQaPage = readFileSync(resolve(target, ".codex/skills/visual-qa-page/SKILL.md"), "utf-8");
    assert.match(visualQaPage, /^---\nname: visual-qa-page/m);
    assert.match(visualQaPage, /OUTPUT_DIR/);
    assert.match(visualQaPage, /End with one JSON line/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex all seeds visual-qa in comprehensive mode", () => {
  const target = tmp("agent-skill-release-codex-vqa-target-");
  const home = tmp("agent-skill-release-codex-vqa-home-");
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
    const visualQa = JSON.parse(readFileSync(resolve(target, ".visual-qa.json"), "utf-8"));
    assert.equal(visualQa.mode, "comprehensive");
    assert.deepEqual(visualQa.comprehensive.scope, CODEX_QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope);
    assert.deepEqual(visualQa.comprehensive.interactions, CODEX_QA_AUTOSCAFFOLD_CONFIG.comprehensive.interactions);
    assert.deepEqual(visualQa.comprehensive.cache, CODEX_QA_AUTOSCAFFOLD_CONFIG.comprehensive.cache);
    assert.deepEqual(visualQa.comprehensive.verdict, CODEX_QA_AUTOSCAFFOLD_CONFIG.comprehensive.verdict);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex floor installs runnable workflow skill directories", () => {
  const target = tmp("agent-skill-release-codex-floor-skills-target-");
  const home = tmp("agent-skill-release-codex-floor-skills-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=floor",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    for (const rel of [
      ".codex/skills/agent-all-codex/SKILL.md",
      ".codex/skills/agent-all-codex/phases/0-preflight.md",
      ".codex/skills/agent-all-codex/phases/6-loop.md",
      ".codex/skills/agent-all-codex/lib/break-resolver.mjs",
      ".codex/skills/agent-all-codex/lib/sequential-dispatch.mjs",
      ".codex/skills/visual-qa-codex/SKILL.md",
      ".codex/skills/visual-qa-codex/phases/1-config.md",
      ".codex/skills/visual-qa-codex/phases/4-aggregate.md",
      ".codex/skills/visual-qa-codex/lib/config-loader.mjs",
      ".codex/skills/visual-qa-codex/lib/matrix-builder.mjs",
      ".codex/skills/visual-qa-codex/lib/cost-estimator.mjs",
      ".codex/skills/visual-qa-codex/lib/diff-runs.mjs",
      ".codex/skills/visual-qa-codex/lib/verdict.mjs",
      ".codex/skills/visual-qa-codex/templates/report.md.hbs",
      ".codex/skills/visual-qa-page/SKILL.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }

    const agentAll = readFileSync(resolve(target, ".codex/skills/agent-all-codex/SKILL.md"), "utf-8");
    const visualQa = readFileSync(resolve(target, ".codex/skills/visual-qa-codex/SKILL.md"), "utf-8");
    assert.match(agentAll, /^---\nname: agent-all-codex/m);
    assert.match(visualQa, /^---\nname: visual-qa-codex/m);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("update --dry-run exposes the exact selected install set without requiring claude", () => {
  const marketplace = JSON.parse(readFileSync(resolve(REPO, ".claude-plugin/marketplace.json"), "utf-8"));
  const expectedAll = marketplace.plugins.map((plugin) => plugin.name).sort();

  const installAll = spawnSync("/bin/bash", [INSTALL_ALL, "--dry-run", "--all"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(installAll.status, 0, `stdout:\n${installAll.stdout}\nstderr:\n${installAll.stderr}`);
  assert.deepEqual(dryRunPluginNames(installAll.stdout), expectedAll);

  const all = spawnSync("/bin/bash", [UPDATE, "--dry-run", "--all"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(all.status, 0, `stdout:\n${all.stdout}\nstderr:\n${all.stderr}`);
  assert.deepEqual(dryRunPluginNames(all.stdout), expectedAll);
  assert.doesNotMatch(all.stderr, /claude' binary not found/);

  const codex = spawnSync("/bin/bash", [UPDATE, "--dry-run", "--cli=codex"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });
  assert.equal(codex.status, 0, `stdout:\n${codex.stdout}\nstderr:\n${codex.stderr}`);
  assert.deepEqual(dryRunPluginNames(codex.stdout), [
    "harness-builder-codex",
    "harness-floor-codex",
    "harness-thrift-codex",
  ]);
});

function dryRunPluginNames(stdout) {
  return Array.from(stdout.matchAll(/DRY-RUN: claude plugin install ([^@\s]+)@agent-skill/g), (match) => match[1]).sort();
}
