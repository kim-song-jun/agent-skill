import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { runReleaseAudit } from "../../scripts/release-audit.mjs";

function writeRel(root, path, content) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

test("release audit reports Claude and Codex as independently ready", () => {
  const result = runReleaseAudit({ root: process.cwd(), platforms: ["claude", "codex"] });

  assert.equal(result.ok, true);
  assert.equal(result.platforms.claude.ok, true);
  assert.equal(result.platforms.codex.ok, true);
  assert.equal(result.platforms.claude.checks.length, 37);
  assert.equal(result.platforms.codex.checks.length, 44);
  assert.match(result.platforms.claude.summary, /Claude: ok \(37\/37 checks\)/);
  assert.match(result.platforms.codex.summary, /Codex: ok \(44\/44 checks\)/);
  assert.ok(result.platforms.claude.checks.some((check) => check.name === "scripts/install-platform.sh exists"));
  assert.ok(
    result.platforms.claude.checks.some((check) => check.name === "scripts/release-smoke.sh matches release contract"),
  );
  assert.ok(
    result.platforms.claude.checks.some((check) => check.name === "scripts/install-platform.sh matches release contract"),
  );
  assert.ok(
    result.platforms.claude.checks.some((check) => check.name === "scripts/release-fixture-smoke.mjs matches release contract"),
  );
  assert.ok(result.platforms.codex.checks.some((check) => check.name === "scripts/install-platform.sh exists"));
  assert.ok(
    result.platforms.codex.checks.some((check) => check.name === "scripts/release-smoke.sh matches release contract"),
  );
  assert.ok(
    result.platforms.codex.checks.some((check) => check.name === "scripts/install-platform.sh matches release contract"),
  );
  assert.ok(
    result.platforms.codex.checks.some((check) => check.name === "scripts/release-fixture-smoke.mjs matches release contract"),
  );
});

test("release audit CLI emits machine-readable JSON", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-audit.mjs"), "--json"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const data = JSON.parse(res.stdout);
  assert.equal(data.ok, true);
  assert.equal(data.platforms.claude.ok, true);
  assert.equal(data.platforms.codex.ok, true);
});

test("release audit CLI emits human-readable platform summaries", () => {
  const res = spawnSync(process.execPath, [resolve("scripts/release-audit.mjs")], {
    encoding: "utf-8",
  });

  const output = `${res.stdout}\n${res.stderr}`;
  assert.equal(res.status, 0, output);
  assert.match(output, /release readiness audit: ok/i);
  assert.match(output, /Claude: ok/i);
  assert.match(output, /Codex: ok/i);
});

test("release audit reports missing contract text files as failed checks", () => {
  const root = mkdtempSync(resolve(tmpdir(), "release-audit-"));
  mkdirSync(resolve(root, ".claude-plugin"), { recursive: true });
  writeFileSync(
    resolve(root, ".claude-plugin/marketplace.json"),
    JSON.stringify({
      plugins: [
        { name: "harness-builder" },
        { name: "harness-floor" },
        { name: "harness-thrift" },
        { name: "harness-explore" },
        { name: "harness-debug" },
      ],
    }),
  );

  const result = runReleaseAudit({ root, platforms: ["claude"] });

  assert.equal(result.ok, false);
  assert.equal(result.platforms.claude.ok, false);
  assert.ok(
    result.platforms.claude.checks.some(
      (check) => !check.ok && check.name.includes("CLAUDE.md.hbs") && check.details === "missing",
    ),
  );
});

test("release audit fails incomplete shared Claude/Codex project installer contract", () => {
  const root = mkdtempSync(resolve(tmpdir(), "release-audit-install-platform-"));
  writeRel(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      plugins: [
        { name: "harness-builder" },
        { name: "harness-floor" },
        { name: "harness-thrift" },
        { name: "harness-explore" },
        { name: "harness-debug" },
        { name: "harness-builder-codex" },
        { name: "harness-floor-codex" },
        { name: "harness-thrift-codex" },
        { name: "harness-debug-codex" },
      ],
    }),
  );
  writeRel(root, "scripts/install-platform.sh", "#!/usr/bin/env bash\n# claude and codex wrapper placeholder\n");

  const result = runReleaseAudit({ root, platforms: ["claude", "codex"] });

  assert.equal(result.ok, false);
  const claudeInstaller = result.platforms.claude.checks.find(
    (check) => !check.ok && check.name === "scripts/install-platform.sh matches release contract",
  );
  assert.ok(claudeInstaller, JSON.stringify(result.platforms.claude.checks, null, 2));
  assert.match(claudeInstaller.details, /harness-builder/);
  assert.match(claudeInstaller.details, /--platform=claude or --platform=codex/);

  const codexInstaller = result.platforms.codex.checks.find(
    (check) => !check.ok && check.name === "scripts/install-platform.sh matches release contract",
  );
  assert.ok(codexInstaller, JSON.stringify(result.platforms.codex.checks, null, 2));
  assert.match(codexInstaller.details, /harness-builder/);
  assert.match(codexInstaller.details, /--platform=codex/);
  assert.match(codexInstaller.details, /--no-instrument/);
});

test("release audit fails incomplete Claude slash-command skill surfaces", () => {
  const root = mkdtempSync(resolve(tmpdir(), "release-audit-claude-command-"));
  writeRel(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      plugins: [
        { name: "harness-builder" },
        { name: "harness-floor" },
        { name: "harness-thrift" },
        { name: "harness-explore" },
        { name: "harness-debug" },
      ],
    }),
  );

  writeRel(root, "plugins/harness-builder/plugin.json", '{"name":"harness-builder"}');
  writeRel(
    root,
    "plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs",
    "Role Routing\norchestrator owns HOT-file coordination\nverification-reviewer records evidence\n",
  );
  writeRel(
    root,
    "plugins/harness-builder/skills/agent-init/templates/AGENTS.md.hbs",
    "Role Routing\norchestrator owns HOT-file coordination\nverification-reviewer records evidence\n",
  );
  writeRel(
    root,
    "plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs",
    "agent-policy-hook.mjs\ncontext-mode-router.mjs\nsession-summary.mjs\n",
  );
  writeRel(root, "plugins/harness-builder/skills/agent-init/templates/hooks/agent-policy-hook.mjs", "");
  writeRel(
    root,
    "plugins/harness-builder/skills/agent-init/SKILL.md",
    [
      "---",
      "name: agent-init",
      "---",
      "",
      "# /agent-init",
      "",
      "Flags: --force --merge --dry-run --resume --platform=claude,codex,gemini --lang=ko|en|auto",
      "When done, print phases completed and files written.",
      "",
    ].join("\n"),
  );

  writeRel(
    root,
    "plugins/harness-floor/skills/agent-all/SKILL.md",
    [
      "---",
      "name: agent-all",
      "---",
      "",
      "# /agent-all",
      "",
      "Flags: --loop --qa --resume --force --yes",
      "Uses superpowers:subagent-driven-development. When done, print summary.",
      "",
    ].join("\n"),
  );
  writeRel(
    root,
    "plugins/harness-floor/skills/agent-all/phases/4-gate.md",
    "buildGatePlan\nclassifyChangedFiles(files)\nORCHESTRATION_AUDIT\nQA_AUDIT\nVERIFICATION_AUDIT\n3 retry cycles\n",
  );
  writeRel(root, "plugins/harness-floor/bin/floor-policy-hook.mjs", "");
  writeRel(root, "plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs", "");
  writeRel(root, "plugins/harness-floor/skills/agent-all/lib/policy/coordinator-audit-validator.mjs", "");
  writeRel(
    root,
    "plugins/harness-floor/skills/visual-qa/SKILL.md",
    [
      "---",
      "name: visual-qa",
      "---",
      "",
      "# /visual-qa",
      "",
      "comprehensive mode, Playwright MCP, --resume --force --yes --budget=<USD>",
      "When done, print summary and exit code.",
      "",
    ].join("\n"),
  );
  writeRel(
    root,
    "plugins/harness-thrift/skills/thrift/SKILL.md",
    [
      "---",
      "name: thrift",
      "---",
      "",
      "# /thrift",
      "",
      "/thrift summarise and /thrift audit are supported. Flags: --force --no-instrument --dry-run.",
      "Append-only hook patches. When done, print Thrift audit.",
      "",
    ].join("\n"),
  );

  const result = runReleaseAudit({ root, platforms: ["claude"] });

  assert.equal(result.ok, false);
  const failed = result.platforms.claude.checks.find(
    (check) => !check.ok && check.name.includes("agent-init/SKILL.md"),
  );
  assert.ok(failed, JSON.stringify(result.platforms.claude.checks, null, 2));
  assert.match(failed.details, /--lite/);
});

test("release audit fails incomplete Codex slash-command skill surfaces", () => {
  const root = mkdtempSync(resolve(tmpdir(), "release-audit-codex-command-"));
  writeRel(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      plugins: [
        { name: "harness-builder-codex" },
        { name: "harness-floor-codex" },
        { name: "harness-thrift-codex" },
        { name: "harness-debug-codex" },
      ],
    }),
  );

  writeRel(root, "plugins/harness-builder-codex/.claude-plugin/plugin.json", '{"name":"harness-builder-codex"}');
  writeRel(root, "plugins/harness-builder-codex/bin/init.mjs", "");
  writeRel(
    root,
    "plugins/harness-builder-codex/skills/codex-init/SKILL.md",
    [
      "---",
      "name: codex-init",
      "---",
      "",
      "# Codex Init",
      "",
      "The default profile is operational and heavy.",
      "Flags: --lite --theme=lite --dry-run --lang=en|ko|auto.",
      "When done, print summary and the Codex config snippet.",
      "",
    ].join("\n"),
  );
  writeRel(
    root,
    "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs",
    "Role Routing\norchestrator owns HOT-file coordination\nverification-reviewer records evidence\n",
  );
  writeRel(
    root,
    "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs",
    "# agent-skill:codex-config:start\n[[hooks.PreToolUse]]\n",
  );
  writeRel(root, "plugins/harness-builder-codex/skills/codex-init/templates/hooks/agent-policy-hook.mjs", "");
  writeRel(
    root,
    "plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md",
    [
      "---",
      "name: agent-all-codex",
      "---",
      "",
      "# /agent-all-codex",
      "",
      "Public entrypoint: run /agent-all for \"smoke task\".",
      "Flags: --loop --qa --dispatch=sequential --resume --force --yes.",
      "Uses sequential skill invocations. When done, print summary and dispatch strategy.",
      "Stale entrypoint: codex skill run /agent-all-codex",
      "",
    ].join("\n"),
  );
  writeRel(
    root,
    "plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md",
    "buildGatePlan\nclassifyChangedFiles(files)\nORCHESTRATION_AUDIT\nQA_AUDIT\nVERIFICATION_AUDIT\nunsupported legacy agent hook\n",
  );
  writeRel(root, "plugins/harness-floor-codex/skills/agent-all-codex/lib/gate-plan.mjs", "");
  writeRel(
    root,
    "plugins/harness-floor-codex/skills/agent-all-codex/lib/policy/coordinator-audit-validator.mjs",
    "",
  );
  writeRel(
    root,
    "plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md",
    [
      "---",
      "name: visual-qa-codex",
      "---",
      "",
      "# /visual-qa-codex",
      "",
      "Public entrypoint: run /visual-qa for the configured project.",
      "comprehensive mode, Playwright MCP, --resume --force --yes --budget=<USD> --dispatch=sequential.",
      "When done, print summary, dispatch strategy, and report path.",
      "Stale entrypoint: codex skill run /visual-qa-codex",
      "Stale entrypoint: codex exec \"visual smoke\"",
      "",
    ].join("\n"),
  );
  writeRel(
    root,
    "plugins/harness-thrift-codex/skills/thrift-codex/SKILL.md",
    [
      "---",
      "name: thrift-codex",
      "---",
      "",
      "# /thrift-codex",
      "",
      "Public subcommands: run /thrift summarise and run /thrift audit.",
      "/thrift-codex summarise and /thrift-codex audit are supported.",
      "Flags: --force --no-instrument --dry-run.",
      "Append-only hook patches. When done, print Thrift audit.",
      "Stale entrypoint: codex skill run /thrift-codex",
      "Stale entrypoint: codex exec \"thrift audit\"",
      "",
    ].join("\n"),
  );
  writeRel(root, "plugins/harness-debug-codex/.claude-plugin/plugin.json", '{"name":"harness-debug-codex"}');
  writeRel(root, "plugins/harness-debug-codex/bin/install.mjs", "");
  writeRel(root, "plugins/harness-debug-codex/skills/debug-codex/lib/debug-artifacts.mjs", "");
  writeRel(root, "plugins/harness-debug-codex/skills/debug-codex/lib/error-parser.mjs", "");
  writeRel(root, "plugins/harness-debug-codex/skills/debug-codex/lib/state-checkpoint.mjs", "");
  writeRel(root, "plugins/harness-debug-codex/skills/debug-codex/phases/1-reproduce.md", "");
  writeRel(root, "plugins/harness-debug-codex/skills/debug-codex/phases/3-hypothesize.md", "");
  writeRel(
    root,
    "plugins/harness-debug-codex/README.md",
    [
      "# harness-debug-codex",
      "",
      "Codex CLI debug flow with run /debug, debug-codex, Release surface, structured error parsing, and .debug-state.json.",
      "./scripts/install-platform.sh --platform=codex --target=/path/to/project --theme=debug",
      "Installs .codex/skills/debug-codex.",
      "",
    ].join("\n"),
  );
  writeRel(
    root,
    "plugins/harness-debug-codex/skills/debug-codex/SKILL.md",
    [
      "---",
      "name: debug-codex",
      "---",
      "",
      "# /debug-codex",
      "",
      "Public entrypoint: run /debug --resume.",
      ".debug-state.json structured error parsing superpowers:systematic-debugging Codex primitive map.",
      "When done, print Debug complete.",
      "Stale entrypoint: codex skill run /debug-codex",
      "Stale entrypoint: codex exec \"debug\"",
      "",
    ].join("\n"),
  );

  const result = runReleaseAudit({ root, platforms: ["codex"] });

  assert.equal(result.ok, false);
  const failed = result.platforms.codex.checks.find(
    (check) => !check.ok && check.name.includes("codex-init/SKILL.md"),
  );
  assert.ok(failed, JSON.stringify(result.platforms.codex.checks, null, 2));
  assert.match(failed.details, /\/codex-init/);

  const staleEntrypoint = result.platforms.codex.checks.find(
    (check) => !check.ok && check.name.includes("agent-all-codex/SKILL.md"),
  );
  assert.ok(staleEntrypoint, JSON.stringify(result.platforms.codex.checks, null, 2));
  assert.match(staleEntrypoint.details, /forbidden/);
  assert.match(staleEntrypoint.details, /codex skill run/);

  const staleVisualQaEntrypoint = result.platforms.codex.checks.find(
    (check) => !check.ok && check.name.includes("visual-qa-codex/SKILL.md"),
  );
  assert.ok(staleVisualQaEntrypoint, JSON.stringify(result.platforms.codex.checks, null, 2));
  assert.match(staleVisualQaEntrypoint.details, /forbidden/);
  assert.match(staleVisualQaEntrypoint.details, /codex skill run/);
  assert.match(staleVisualQaEntrypoint.details, /codex exec/);

  const staleThriftEntrypoint = result.platforms.codex.checks.find(
    (check) => !check.ok && check.name.includes("thrift-codex/SKILL.md"),
  );
  assert.ok(staleThriftEntrypoint, JSON.stringify(result.platforms.codex.checks, null, 2));
  assert.match(staleThriftEntrypoint.details, /missing/);
  assert.match(staleThriftEntrypoint.details, new RegExp(String.raw`run \\/thrift`));
  assert.match(staleThriftEntrypoint.details, /forbidden/);
  assert.match(staleThriftEntrypoint.details, /codex skill run/);
  assert.match(staleThriftEntrypoint.details, /codex exec/);

  const staleDebugEntrypoint = result.platforms.codex.checks.find(
    (check) => !check.ok && check.name.includes("debug-codex/SKILL.md"),
  );
  assert.ok(staleDebugEntrypoint, JSON.stringify(result.platforms.codex.checks, null, 2));
  assert.match(staleDebugEntrypoint.details, /missing/);
  assert.match(staleDebugEntrypoint.details, new RegExp(String.raw`run \\/debug`));
  assert.match(staleDebugEntrypoint.details, /forbidden/);
  assert.match(staleDebugEntrypoint.details, /codex skill run/);
  assert.match(staleDebugEntrypoint.details, /codex exec/);
});
