import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { render } from "../../plugins/harness-builder/skills/agent-init/lib/render.mjs";
import { loadConfig } from "../../plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs";
import { QA_AUTOSCAFFOLD_CONFIG } from "../../plugins/harness-floor/skills/agent-all/lib/break-resolver.mjs";

function read(path) {
  return readFileSync(resolve(path), "utf-8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

test("Claude native plugin manifests expose all release skills", () => {
  assert.equal(readJson("plugins/harness-builder/.claude-plugin/plugin.json").name, "harness-builder");
  assert.equal(readJson("plugins/harness-floor/.claude-plugin/plugin.json").name, "harness-floor");
  assert.equal(readJson("plugins/harness-thrift/.claude-plugin/plugin.json").name, "harness-thrift");

  for (const rel of [
    "plugins/harness-builder/skills/agent-init/SKILL.md",
    "plugins/harness-floor/skills/agent-all/SKILL.md",
    "plugins/harness-floor/skills/visual-qa/SKILL.md",
    "plugins/harness-thrift/skills/thrift/SKILL.md",
  ]) {
    assert.ok(existsSync(resolve(rel)), `missing ${rel}`);
  }
});

test("Claude native release skills document production surfaces without scaffold language", () => {
  const skillPaths = [
    "plugins/harness-builder/skills/agent-init/SKILL.md",
    "plugins/harness-floor/skills/agent-all/SKILL.md",
    "plugins/harness-floor/skills/visual-qa/SKILL.md",
    "plugins/harness-thrift/skills/thrift/SKILL.md",
  ];

  const combined = skillPaths.map((path) => read(path)).join("\n\n");
  assert.match(combined, /Default \(no theme flag\) is operational\/heavy/);
  assert.match(combined, /\/agent-all[\s\S]*--qa[\s\S]*visual-qa \(comprehensive mode\)/);
  assert.match(combined, /\/visual-qa[\s\S]*comprehensive/);
  assert.match(combined, /\/thrift[\s\S]*Append-only hook patches/);
  assert.doesNotMatch(
    combined,
    /MVP scope|scaffold-only|not implemented|no-op stub|design pending|Theme B planned/i,
  );
});

test("Claude native hook entrypoints are syntax-valid JavaScript", () => {
  const router = "plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs";
  for (const rel of [
    "plugins/harness-builder/hooks/context-mode-cache-heal.mjs",
    router,
    "plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs",
    "plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs",
    "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs",
    "plugins/harness-floor/bin/floor-policy-hook.mjs",
    "plugins/harness-floor/bin/install-floor-policy.mjs",
    "plugins/harness-thrift/bin/install.mjs",
  ]) {
    const res = spawnSync(process.execPath, ["--check", resolve(rel)], {
      encoding: "utf-8",
    });
    assert.equal(res.status, 0, `${rel}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  }

  const runRouter = (command) => spawnSync(process.execPath, [resolve(router)], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf-8",
  });
  const large = runRouter("git status --short");
  assert.equal(large.status, 0, large.stderr);
  assert.match(large.stdout, /context_guidance/);
  assert.match(large.stdout, /ctx_batch_execute|ctx_execute/);

  const small = runRouter("pwd");
  assert.equal(small.status, 0, small.stderr);
  assert.equal(small.stdout, "");

  const malformed = spawnSync(process.execPath, [resolve(router)], {
    input: "{not-json",
    encoding: "utf-8",
  });
  assert.equal(malformed.status, 0, malformed.stderr);
  assert.equal(malformed.stdout, "");
});

test("Claude native context router recommends /thrift after repeated large-output work", () => {
  const router = resolve("plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs");
  const target = mkdtempSync(resolve(tmpdir(), "agent-skill-thrift-recommend-"));
  const runRouter = (command) => spawnSync(process.execPath, [router], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: "utf-8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: target },
  });

  try {
    const first = runRouter("git status --short");
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /context_guidance/);
    assert.doesNotMatch(first.stdout, /run \/thrift/);

    runRouter("git diff --stat");
    const third = runRouter("rg TODO");
    assert.equal(third.status, 0, third.stderr);
    assert.match(third.stdout, /run \/thrift/);

    const recommendation = resolve(target, ".agent-skill/recommendations/thrift.md");
    assert.equal(existsSync(recommendation), true);
    assert.match(readFileSync(recommendation, "utf-8"), /\/thrift recommended/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("Claude native /agent-init floor seed config matches --qa comprehensive contract", () => {
  const tpl = read("plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs");
  const rendered = render(tpl, {
    baseUrl: QA_AUTOSCAFFOLD_CONFIG.baseUrl,
    model: QA_AUTOSCAFFOLD_CONFIG.analysis.model,
  });
  const cfg = JSON.parse(rendered);

  assert.equal(cfg.mode, "comprehensive");
  assert.deepEqual(cfg.comprehensive.scope, QA_AUTOSCAFFOLD_CONFIG.comprehensive.scope);
  assert.deepEqual(cfg.comprehensive.interactions, QA_AUTOSCAFFOLD_CONFIG.comprehensive.interactions);
  assert.deepEqual(cfg.comprehensive.cache, QA_AUTOSCAFFOLD_CONFIG.comprehensive.cache);
  assert.deepEqual(cfg.comprehensive.verdict, QA_AUTOSCAFFOLD_CONFIG.comprehensive.verdict);

  const dir = mkdtempSync(resolve(tmpdir(), "claude-native-visual-qa-seed-"));
  const path = resolve(dir, ".visual-qa.json");
  writeFileSync(path, rendered);
  const loaded = loadConfig(path, {});
  assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
  assert.equal(loaded.config.mode, "comprehensive");
});

test("Claude native /agent-init phase docs cover parallel agent fan-out and final summary evidence", () => {
  const phase3 = read("plugins/harness-builder/skills/agent-init/phases/3-agents.md");
  assert.match(phase3, /superpowers:dispatching-parallel-agents/);
  assert.match(phase3, /Each subagent gets one role/);
  assert.match(phase3, /share no state/);
  assert.match(phase3, /--dry-run[\s\S]{0,260}without dispatching subagents/);
  assert.match(phase3, /role\s+→\s+file path\s+→\s+bytes/);

  const phase5 = read("plugins/harness-builder/skills/agent-init/phases/5-wire.md");
  assert.match(phase5, /missing plugins/i);
  assert.match(phase5, /\/plugin install \{plugin\}/);
  assert.match(phase5, /Phases completed: 5 \/ 5/);
  assert.match(phase5, /N local guides/);
  assert.match(phase5, /commit[\s\S]{0,260}explicit pathspecs/i);
});

test("Claude native root guidance exposes role routing and escalation contracts", () => {
  for (const rel of [
    "plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs",
    "plugins/harness-builder/skills/agent-init/templates/AGENTS.md.hbs",
  ]) {
    const body = read(rel);
    assert.match(body, /Role Routing/i, `${rel} must have a role routing section`);
    assert.match(body, /orchestrator[\s\S]{0,240}HOT-file/i, `${rel} must route HOT-file ownership to orchestrator`);
    assert.match(body, /planner[\s\S]{0,240}Decision Matrix/i, `${rel} must route ambiguity to planner`);
    assert.match(body, /frontend-dev[\s\S]{0,240}backend-dev/i, `${rel} must route stack-specific implementation roles`);
    assert.match(body, /integration-dev[\s\S]{0,240}cross-stack/i, `${rel} must route cross-stack work`);
    assert.match(body, /design-reviewer[\s\S]{0,260}qa-reviewer/i, `${rel} must route UI/QA review`);
    assert.match(body, /security-reviewer[\s\S]{0,260}data-reviewer/i, `${rel} must route security/data review`);
    assert.match(body, /verification-reviewer[\s\S]{0,260}(tests|typecheck|lint|evidence)/i, `${rel} must route verification review`);
    assert.match(body, /quality-debt-reviewer[\s\S]{0,260}(fallback|suppressions|TODO|test quality)/i, `${rel} must route quality debt review`);
    assert.match(body, /3 (?:failed cycles|repeated failures|attempts)/i, `${rel} must define the 3-failure escalation rule`);
    assert.match(body, /Progress Snapshot/i, `${rel} must keep task ledger progress current`);
  }
});

test("Claude native role templates embed foundation and shared-tree discipline", () => {
  const roleSkills = {
    "backend-dev": ["test-driven-development", "verification-before-completion"],
    "data-reviewer": ["requesting-code-review", "verification-before-completion"],
    "design-reviewer": ["requesting-code-review", "verification-before-completion"],
    designer: ["brainstorming", "verification-before-completion"],
    dev: ["test-driven-development", "verification-before-completion"],
    "doc-writer": ["brainstorming", "verification-before-completion"],
    "frontend-dev": ["brainstorming", "test-driven-development", "verification-before-completion"],
    "integration-dev": ["test-driven-development", "verification-before-completion"],
    orchestrator: [
      "dispatching-parallel-agents",
      "subagent-driven-development",
      "verification-before-completion",
    ],
    planner: ["brainstorming", "writing-plans", "dispatching-parallel-agents"],
    "quality-debt-reviewer": ["requesting-code-review", "verification-before-completion"],
    qa: ["brainstorming", "verification-before-completion"],
    "qa-reviewer": ["requesting-code-review", "verification-before-completion"],
    reviewer: ["requesting-code-review", "verification-before-completion"],
    "security-reviewer": ["requesting-code-review", "verification-before-completion"],
    tester: ["systematic-debugging", "verification-before-completion"],
    "verification-reviewer": ["requesting-code-review", "verification-before-completion"],
  };

  for (const [role, skills] of Object.entries(roleSkills)) {
    const body = read(`plugins/harness-builder/skills/agent-init/templates/agents/${role}.md.hbs`);
    assert.match(body, /CLAUDE\.md[\s\S]{0,120}docs\/tasks/, `${role} must read root and task context`);
    assert.doesNotMatch(body, /superpowers:\*/, `${role} must not use a generic superpowers placeholder`);
    for (const skill of skills) {
      assert.match(body, new RegExp(`superpowers:${skill}`), `${role} must name ${skill}`);
    }
    assert.match(body, /context-mode|ctx_batch_execute|ctx_execute/i, `${role} must route bulk context`);
    assert.match(body, /shared-tree|unrelated edits|HOT-file/i, `${role} must preserve shared workspace safety`);
  }
});

test("Claude native persona reviewers emit the Phase 4 verification audit token expected by floor-policy", () => {
  const personaReviewers = [
    "reviewer",
    "quality-debt-reviewer",
    "verification-reviewer",
    "data-reviewer",
    "design-reviewer",
    "integration-dev",
    "security-reviewer",
  ];

  for (const role of personaReviewers) {
    const body = read(`plugins/harness-builder/skills/agent-init/templates/agents/${role}.md.hbs`);
    assert.match(body, /Phase 4 reviewer|Review Task/i, `${role} must scope the machine token to review dispatches`);
    assert.match(body, /VERIFICATION_AUDIT: passed/, `${role} must document the pass token`);
    assert.match(body, /VERIFICATION_AUDIT: failed/, `${role} must document the fail token`);
    assert.match(body, /VERIFICATION_AUDIT: skipped/, `${role} must document the skipped token`);
    assert.match(body, /literal line at the END/i, `${role} must make the audit token mechanically extractable`);
  }

  const phase4 = read("plugins/harness-floor/skills/agent-all/phases/4-gate.md");
  assert.match(phase4, /Other personas[\s\S]{0,260}VERIFICATION_AUDIT: passed\|failed\|skipped/);
});

test("Claude native QA reviewer emits the Phase 4 QA audit token expected by floor-policy", () => {
  const body = read("plugins/harness-builder/skills/agent-init/templates/agents/qa-reviewer.md.hbs");

  assert.match(body, /Phase 4 QA reviewer|QA Review Task/i);
  assert.match(body, /QA_AUDIT: passed/);
  assert.match(body, /QA_AUDIT: failed/);
  assert.match(body, /QA_AUDIT: skipped/);
  assert.match(body, /literal line at the END/i);
});
