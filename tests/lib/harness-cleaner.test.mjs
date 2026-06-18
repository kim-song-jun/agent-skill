import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  planHarnessCleanup,
  runHarnessCleanup,
} from "../../plugins/harness-builder/skills/agent-init/lib/harness-cleaner.mjs";

const CLEAN = resolve("scripts/harness-clean.mjs");
const CLAUDE_PLUGIN_CLEAN = resolve("plugins/harness-builder/bin/clean.mjs");
const CODEX_PLUGIN_CLEAN = resolve("plugins/harness-builder-codex/bin/clean.mjs");

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeRel(root, rel, body = "") {
  const abs = resolve(root, rel);
  mkdirSync(resolve(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

function readRel(root, rel) {
  return readFileSync(resolve(root, rel), "utf-8");
}

test("cleaner removes Claude generated artifacts while preserving user guidance and hooks", () => {
  const target = tmp("agent-skill-clean-claude-");
  try {
    writeRel(
      target,
      "CLAUDE.md",
      [
        "# User rules",
        "",
        "Keep this.",
        "",
        "<!-- agent-skill:operational:start -->",
        "generated harness section",
        "<!-- agent-skill:operational:end -->",
        "",
      ].join("\n"),
    );
    writeRel(
      target,
      "AGENTS.md",
      "# Generated\n\n> Companion project memory for agents that read `AGENTS.md`. Maintained by `/agent-init`.\n",
    );
    writeRel(target, ".claude/agents/planner.md", "planner\n");
    writeRel(target, ".claude/hooks/context-mode-router.mjs", "hook\n");
    writeRel(target, ".visual-qa.json", "{}\n");
    writeRel(target, ".agent-all.json", "{}\n");
    writeRel(target, "docs/tasks/_template.md", "# Task\n");
    writeRel(target, "scripts/agent-task-ledger-check.mjs", "check\n");
    writeRel(
      target,
      ".claude/settings.local.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/context-mode-router.mjs"' },
                { type: "command", command: "node user-hook.mjs" },
              ],
            },
          ],
          Stop: [
            {
              hooks: [
                { type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-summary.mjs"' },
              ],
            },
          ],
        },
      }),
    );

    const dry = runHarnessCleanup({ target, platform: "claude", dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.ok(dry.operations.some((operation) => operation.rel === "CLAUDE.md" && operation.type === "strip-sentinel"));
    assert.ok(dry.skipped.some((skip) => skip.rel === "AGENTS.md" && /force-root/.test(skip.reason)));
    assert.ok(existsSync(resolve(target, ".claude/agents/planner.md")), "dry-run must not remove files");

    const result = runHarnessCleanup({ target, platform: "claude" });
    assert.equal(result.applied.length, result.operations.length);
    assert.equal(readRel(target, "CLAUDE.md"), "# User rules\n\nKeep this.\n");
    assert.ok(existsSync(resolve(target, "AGENTS.md")), "root AGENTS.md without sentinel should be preserved by default");
    assert.ok(!existsSync(resolve(target, ".claude/agents/planner.md")));
    assert.ok(!existsSync(resolve(target, ".claude/hooks/context-mode-router.mjs")));
    assert.ok(!existsSync(resolve(target, ".visual-qa.json")));
    assert.ok(!existsSync(resolve(target, ".agent-all.json")));
    assert.ok(!existsSync(resolve(target, "docs/tasks/_template.md")));
    assert.ok(!existsSync(resolve(target, "scripts/agent-task-ledger-check.mjs")));

    const settings = JSON.parse(readRel(target, ".claude/settings.local.json"));
    assert.deepEqual(settings.hooks.PreToolUse[0].hooks, [
      { type: "command", command: "node user-hook.mjs" },
    ]);
    assert.equal(settings.hooks.Stop, undefined);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cleaner removes Codex root guidance only when forceRoot is explicit", () => {
  const target = tmp("agent-skill-clean-codex-root-");
  try {
    writeRel(
      target,
      "AGENTS.md",
      "# Codex Project\n\n> Project memory for Codex CLI. Scaffolded by `/agent-init`.\n",
    );
    writeRel(target, ".codex/skills/dev/SKILL.md", "---\nname: dev\n---\n");
    writeRel(target, ".codex/skills/agent-all/SKILL.md", "---\nname: agent-all\n---\n");
    writeRel(target, ".codex/skills/thrift/SKILL.md", "---\nname: thrift\n---\n");
    writeRel(target, ".codex/hooks/agent-policy-hook.mjs", "hook\n");
    writeRel(target, ".visual-qa.json", "{}\n");
    writeRel(target, ".agent-all.json", "{}\n");
    writeRel(target, ".thrift.json", "{}\n");

    const conservative = runHarnessCleanup({ target, platform: "codex" });
    assert.ok(existsSync(resolve(target, "AGENTS.md")), "conservative cleanup must preserve root AGENTS.md");
    assert.ok(conservative.skipped.some((skip) => skip.rel === "AGENTS.md"));
    assert.ok(!existsSync(resolve(target, ".codex/skills/dev")));
    assert.ok(!existsSync(resolve(target, ".codex/skills/agent-all")));
    assert.ok(!existsSync(resolve(target, ".codex/skills/thrift")));
    assert.ok(!existsSync(resolve(target, ".visual-qa.json")));

    writeRel(target, ".codex/skills/dev/SKILL.md", "---\nname: dev\n---\n");
    const forced = runHarnessCleanup({ target, platform: "codex", forceRoot: true });
    assert.ok(!existsSync(resolve(target, "AGENTS.md")), "forceRoot should remove managed-looking root AGENTS.md");
    assert.ok(!existsSync(resolve(target, ".codex/skills/dev")));
    assert.equal(forced.skipped.some((skip) => skip.rel === "AGENTS.md"), false);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cleaner strips Codex sentinel sections from existing project guidance", () => {
  const target = tmp("agent-skill-clean-codex-sentinel-");
  try {
    writeRel(
      target,
      "AGENTS.md",
      [
        "# Existing rules",
        "",
        "Keep this.",
        "",
        "<!-- agent-skill:operational:start -->",
        "generated codex section",
        "<!-- agent-skill:operational:end -->",
        "",
      ].join("\n"),
    );

    const plan = planHarnessCleanup({ target, platform: "codex" });
    assert.ok(plan.operations.some((operation) => operation.rel === "AGENTS.md" && operation.type === "strip-sentinel"));

    runHarnessCleanup({ target, platform: "codex" });
    assert.equal(readRel(target, "AGENTS.md"), "# Existing rules\n\nKeep this.\n");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cleanup CLI emits JSON dry-run output and does not mutate", () => {
  const target = tmp("agent-skill-clean-cli-");
  try {
    writeRel(target, ".codex/hooks/agent-policy-hook.mjs", "hook\n");

    const res = spawnSync(process.execPath, [
      CLEAN,
      "--platform=codex",
      `--target=${target}`,
      "--dry-run",
      "--json",
    ], { encoding: "utf-8" });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const data = JSON.parse(res.stdout);
    assert.equal(data.dryRun, true);
    assert.ok(data.operations.some((operation) => operation.rel === ".codex/hooks/agent-policy-hook.mjs"));
    assert.ok(existsSync(resolve(target, ".codex/hooks/agent-policy-hook.mjs")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("cleanup CLI help works without requiring platform for source and plugin wrappers", () => {
  for (const script of [CLEAN, CLAUDE_PLUGIN_CLEAN, CODEX_PLUGIN_CLEAN]) {
    const res = spawnSync(process.execPath, [script, "--help"], { encoding: "utf-8" });
    const output = `${res.stdout}\n${res.stderr}`;
    assert.equal(res.status, 0, `${script}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(output, /Usage: clean\.mjs --platform=claude\|codex/);
    assert.match(output, /--force-root/);
    assert.doesNotMatch(output, /--platform is required/);
  }
});
