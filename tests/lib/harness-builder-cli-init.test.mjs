// Integration tests for the shell-callable installers shipped under
//   plugins/harness-builder-{codex,copilot,gemini}/bin/init.mjs
//
// Each plugin's installer mirrors the harness-builder-cursor pattern but
// writes platform-specific paths and emits per-user config snippets
// (config.toml / mcp-config.json / settings.json) to stdout for manual
// merging.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  REQUIRED_SECTIONS,
  validateTaskDoc,
} from "../../plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs";

const REPO = resolve(".");
const CLAUDE_INIT = resolve(REPO, "plugins/harness-builder/bin/init.mjs");

const PLUGINS = {
  codex: {
    bin:   resolve(REPO, "plugins/harness-builder-codex/bin/init.mjs"),
    files: [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/dev/SKILL.md",
      ".codex/skills/reviewer/SKILL.md",
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/skills/frontend-dev/SKILL.md",
      ".codex/skills/backend-dev/SKILL.md",
      ".codex/skills/integration-dev/SKILL.md",
      ".codex/skills/verification-reviewer/SKILL.md",
      ".codex/skills/qa-reviewer/SKILL.md",
      ".codex/skills/design-reviewer/SKILL.md",
      ".codex/skills/security-reviewer/SKILL.md",
      ".codex/skills/data-reviewer/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      "scripts/agent-task-ledger-check.mjs",
      "docs/superpowers/specs/.gitkeep",
      "docs/superpowers/plans/.gitkeep",
      "docs/decisions/.gitkeep",
      "docs/tasks/.gitkeep",
      "docs/tasks/AGENTS.md",
      "docs/tasks/index.md",
      "docs/tasks/_template.md",
      "docs/tasks/_handoff-template.md",
    ],
    stdoutContains: /\[\[hooks\.PreToolUse\]\]/, // TOML snippet for ~/.codex/config.toml
    stdoutHeader:   /codex-config\.toml/,
    purposeFile:    "AGENTS.md",
  },
  copilot: {
    bin:   resolve(REPO, "plugins/harness-builder-copilot/bin/init.mjs"),
    files: [
      "AGENTS.md",
      ".github/copilot-instructions.md",
      ".github/instructions/planner.instructions.md",
      ".github/instructions/dev.instructions.md",
      ".github/instructions/reviewer.instructions.md",
      ".github/hooks/preToolUse.json",
      ".github/hooks/postToolUse.json",
      ".github/hooks/agentStop.json",
    ],
    stdoutContains: /"mcpServers"/,         // JSON snippet for ~/.copilot/mcp-config.json
    stdoutHeader:   /mcp-config\.json/,
    purposeFile:    ".github/copilot-instructions.md",
  },
  gemini: {
    bin:   resolve(REPO, "plugins/harness-builder-gemini/bin/init.mjs"),
    files: [
      "GEMINI.md",
      ".gemini/skills/planner/SKILL.md",
      ".gemini/skills/dev/SKILL.md",
      ".gemini/skills/reviewer/SKILL.md",
    ],
    stdoutContains: /"mcpServers"/,         // JSON snippet for ~/.gemini/settings.json
    stdoutHeader:   /gemini-settings\.json/,
    purposeFile:    "GEMINI.md",
  },
};

const CODEX_INIT_SKILL = resolve(REPO, "plugins/harness-builder-codex/skills/codex-init/SKILL.md");
const CODEX_CONFIG_TEMPLATE = resolve(REPO, "plugins/harness-builder-codex/skills/codex-init/templates/codex-config.toml.hbs");
const GEMINI_INIT_SKILL = resolve(REPO, "plugins/harness-builder-gemini/skills/gemini-init/SKILL.md");

function runInit(binPath, args, opts = {}) {
  return spawnSync("node", [binPath, ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...(opts.env ?? {}) },
  });
}

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

test("harness-builder-claude: bin/init.mjs help documents operational flags", () => {
  const res = runInit(CLAUDE_INIT, ["--help"]);

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /Usage: init\.mjs <target-project-dir>/);
  assert.match(res.stdout, /--lite/);
  assert.match(res.stdout, /--theme=lite/);
  assert.match(res.stdout, /--lang=en\|ko\|auto/);
  assert.match(res.stdout, /--dry-run/);
  assert.match(res.stdout, /--update-foundations/);
  assert.match(res.stdout, /--no-doctor/);
});

test("harness-builder-claude: shell init writes operational scaffold and runs doctor", () => {
  const target = mkTarget("claude-operational");
  const home = mkTarget("claude-operational-home");
  try {
    const res = runInit(CLAUDE_INIT, [target, "--lang=ko"], { env: { HOME: home } });
    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

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
      ".claude/agents/frontend-dev.md",
      ".claude/agents/backend-dev.md",
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
      ".visual-qa.json",
      ".agent-all.json",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }

    const claude = readFileSync(resolve(target, "CLAUDE.md"), "utf-8");
    const qa = readFileSync(resolve(target, ".claude/agents/qa-reviewer.md"), "utf-8");
    const settings = JSON.parse(readFileSync(resolve(target, ".claude/settings.local.json"), "utf-8"));
    const policyHook = readFileSync(resolve(target, ".claude/hooks/agent-policy-hook.mjs"), "utf-8");
    const agentAll = JSON.parse(readFileSync(resolve(target, ".agent-all.json"), "utf-8"));

    assert.match(claude, /Orchestration Contract/);
    assert.match(claude, /Role Gate Matrix/);
    assert.match(claude, /- Interaction language: `ko`/);
    assert.match(qa, /Configured QA Personas[\s\S]{0,120}general/);
    assert.match(qa, /Phase 4 QA reviewer|QA Review Task/i);
    assert.match(qa, /QA_AUDIT: passed[\s\S]{0,120}QA_AUDIT: failed[\s\S]{0,120}QA_AUDIT: skipped/);
    assert.match(qa, /literal line at the END/i);
    assert.equal(agentAll.language, "ko");
    assert.ok(JSON.stringify(settings).includes("agent-policy-hook.mjs"));
    assert.ok(
      (settings.hooks.PreToolUse || []).some(
        (group) => group.matcher === "Task" && JSON.stringify(group).includes("PreToolUse"),
      ),
      "operational Claude settings should register Task PreToolUse policy hook",
    );
    assert.ok(
      (settings.hooks.PostToolUse || []).some(
        (group) => group.matcher === "Task" && JSON.stringify(group).includes("PostToolUse"),
      ),
      "operational Claude settings should register Task PostToolUse policy hook",
    );
    assert.match(policyHook, /ORCHESTRATION_AUDIT/);
    assert.match(policyHook, /QA_AUDIT/);
    assert.match(policyHook, /VERIFICATION_AUDIT/);
    assert.match(res.stdout, /Post-install doctor/);
    assert.match(res.stdout, /harness doctor: ok/);
    assert.match(res.stdout, /platform: Claude/);
    assert.match(res.stdout, /profile: operational/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-claude: --lite skips operational ledger, personas, and policy hook", () => {
  const target = mkTarget("claude-lite");
  const home = mkTarget("claude-lite-home");
  try {
    const res = runInit(CLAUDE_INIT, [target, "--lite"], { env: { HOME: home } });
    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    for (const rel of [
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/settings.local.json",
      ".claude/hooks/context-mode-router.mjs",
      ".claude/hooks/session-summary.mjs",
      ".claude/hooks/cache-heal.mjs",
      ".claude/agents/planner.md",
      ".claude/agents/dev.md",
      ".claude/agents/reviewer.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }
    for (const rel of [
      ".claude/hooks/agent-policy-hook.mjs",
      ".claude/agents/orchestrator.md",
      ".claude/agents/frontend-dev.md",
      ".claude/agents/backend-dev.md",
      ".claude/agents/qa-reviewer.md",
      "docs/tasks/index.md",
      ".visual-qa.json",
      ".agent-all.json",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected lite artifact ${rel}`);
    }
    const settings = JSON.stringify(JSON.parse(readFileSync(resolve(target, ".claude/settings.local.json"), "utf-8")));
    assert.match(settings, /context-mode-router\.mjs/);
    assert.doesNotMatch(settings, /agent-policy-hook\.mjs/);
    assert.match(res.stdout, /profile: lite/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-claude: preserves user guidance and merges existing settings", () => {
  const target = mkTarget("claude-merge");
  try {
    writeFileSync(resolve(target, "CLAUDE.md"), "# User Claude Rules\n\nKeep this.\n");
    writeFileSync(resolve(target, "AGENTS.md"), "# User Agent Rules\n\nKeep this too.\n");
    mkdirSync(resolve(target, ".claude"), { recursive: true });
    writeFileSync(
      resolve(target, ".claude/settings.local.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo user-hook" }],
            },
          ],
        },
      }),
    );

    const res = runInit(CLAUDE_INIT, [target, "--no-doctor"], { env: { PURPOSE: "Merged Claude Project" } });
    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);

    const claude = readFileSync(resolve(target, "CLAUDE.md"), "utf-8");
    const agents = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    const settings = JSON.stringify(JSON.parse(readFileSync(resolve(target, ".claude/settings.local.json"), "utf-8")));

    assert.match(claude, /# User Claude Rules/);
    assert.match(claude, /Keep this/);
    assert.match(claude, /Merged Claude Project/);
    assert.equal((claude.match(/agent-skill:operational:start/g) || []).length, 1);
    assert.equal((claude.match(/agent-skill:operational:end/g) || []).length, 1);
    assert.match(agents, /# User Agent Rules/);
    assert.match(agents, /Keep this too/);
    assert.match(settings, /echo user-hook/);
    assert.match(settings, /context-mode-router\.mjs/);
    assert.match(settings, /agent-policy-hook\.mjs/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-claude: --dry-run reports planned writes without writing files", () => {
  const target = mkTarget("claude-dry-run");
  try {
    const res = runInit(CLAUDE_INIT, [target, "--dry-run"]);
    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /dry-run: would write/);
    assert.ok(!existsSync(resolve(target, "CLAUDE.md")));
    assert.ok(!existsSync(resolve(target, ".claude/hooks/agent-policy-hook.mjs")));
    assert.ok(!existsSync(resolve(target, ".visual-qa.json")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: SKILL.md documents that lite skips config snippet output", () => {
  const body = readFileSync(CODEX_INIT_SKILL, "utf-8");

  assert.match(body, /--lite[\s\S]*skips?[\s\S]*Codex config snippet/i);
  assert.match(body, /--lite[\s\S]*writes?[\s\S]*AGENTS[\s\S]*base skills/i);
  assert.match(body, /--lite[\s\S]*skips?[\s\S]*repo hooks/i);
  assert.match(body, /--lite[\s\S]*skips?[\s\S]*task ledger/i);
  assert.match(body, /--lite[\s\S]*skips?[\s\S]*reviewer personas/i);
  assert.doesNotMatch(body, /Always print the Codex config snippet/i);
  assert.doesNotMatch(body, /CLI always emits `templates\/codex-config\.toml\.hbs`/i);
});

test("harness-builder-codex: SKILL.md documents operational workspace outputs", () => {
  const body = readFileSync(CODEX_INIT_SKILL, "utf-8");

  assert.match(body, /docs\/superpowers\/specs\//);
  assert.match(body, /docs\/superpowers\/plans\//);
  assert.match(body, /docs\/decisions\//);
  assert.match(body, /docs\/tasks\/AGENTS\.md/);
  assert.match(body, /docs\/tasks\/_handoff-template\.md/);
  assert.match(body, /scripts\/agent-task-ledger-check\.mjs/);
});

test("harness-builder-codex: SKILL.md documents explicit foundation update flag", () => {
  const body = readFileSync(CODEX_INIT_SKILL, "utf-8");

  assert.match(body, /--update-foundations/);
  assert.match(body, /approved foundation/i);
  assert.match(body, /Does not patch global CLI config|Do not claim that global config was patched/i);
});

test("harness-builder-codex: SKILL.md operational roster includes stack-specific implementers", () => {
  const body = readFileSync(CODEX_INIT_SKILL, "utf-8");

  assert.match(body, /frontend-dev/);
  assert.match(body, /backend-dev/);
  assert.match(body, /integration-dev/);
  assert.match(body, /cross-stack wiring and API contracts/);
});

test("harness-builder-codex: config template is operational-only hook snippet", () => {
  const body = readFileSync(CODEX_CONFIG_TEMPLATE, "utf-8");

  assert.match(body, /agent-skill:codex-config:start/);
  assert.match(body, /agent-skill:codex-config:end/);
  assert.match(body, /\[\[hooks\.PreToolUse\]\]/);
  assert.match(body, /matcher = "\^Bash\$"/);
  assert.match(body, /\[\[hooks\.PreToolUse\.hooks\]\]/);
  assert.match(body, /type = "command"/);
  assert.match(body, /timeout = 30/);
  assert.doesNotMatch(body, /\[\[hooks\.pre_tool_use\]\]/);
  assert.doesNotMatch(body, /matcher = "shell_command"/);
  assert.doesNotMatch(body, /timeout_seconds/);
  assert.doesNotMatch(body, /matcher = "\.\*"/);
  assert.match(body, /command_windows/);
  assert.doesNotMatch(body, /SessionStart/);
  assert.doesNotMatch(body, /session start/);
  assert.doesNotMatch(body, /liteProfile/);
  assert.doesNotMatch(body, /lite mode/i);
});

test("harness-builder-gemini: init skill documents MCP-only settings and soft guidance", () => {
  const body = readFileSync(GEMINI_INIT_SKILL, "utf-8");

  assert.doesNotMatch(body, /hook_command_beforetool/);
  assert.doesNotMatch(body, /hook_command_sessionstart/);
  assert.doesNotMatch(body, /BeforeTool/);
  assert.doesNotMatch(body, /SessionStart/);
  assert.doesNotMatch(body, /hook \+ MCP stubs/);
  assert.match(body, /settings(?: output| stub)?[\s\S]*MCP-only/i);
  assert.match(body, /operational enforcement[\s\S]*soft prompt-level guidance/i);
  assert.match(body, /not hard hooks/i);
});

test("harness-builder-codex: AGENTS.md documents operational profile", () => {
  const target = mkTarget("codex-agents");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(body, /docs\/tasks/);
    assert.match(body, /pathspec/);
    assert.match(body, /operational harness/i);
    assert.match(body, /reviewer personas/i);
    assert.match(body, /Role Routing/i);
    assert.match(body, /orchestrator[\s\S]{0,240}HOT-file/i);
    assert.match(body, /planner[\s\S]{0,240}Decision Matrix/i);
    assert.match(body, /frontend-dev[\s\S]{0,240}backend-dev/i);
    assert.match(body, /dev[\s\S]{0,240}generic implementation fallback/i);
    assert.match(body, /Implementation Routing Matrix/i);
    assert.match(body, /integration-dev[\s\S]{0,240}cross-stack/i);
    assert.match(body, /design-reviewer[\s\S]{0,260}qa-reviewer/i);
    assert.match(body, /security-reviewer[\s\S]{0,260}data-reviewer/i);
    assert.match(body, /verification-reviewer[\s\S]{0,260}(tests|typecheck|lint|evidence)/i);
    assert.match(body, /3 (?:failed cycles|repeated failures|attempts)/i);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: AGENTS.md renders execution discipline and dispatch contract", () => {
  const target = mkTarget("codex-execution-discipline");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");

    assert.match(body, /## Execution Discipline/);
    assert.match(body, /No scope retreat/i);
    assert.match(body, /Self-Audit/);
    assert.match(body, /Tech-Debt Grep/);
    assert.match(body, /Decision Matrix/);
    assert.match(body, /## Subagent Dispatch Contract/);
    assert.match(body, /working directory/i);
    assert.match(body, /owned files/i);
    assert.match(body, /forbidden files/i);
    assert.match(body, /Do not self-commit/i);
    assert.doesNotMatch(body, /POSCO|LIMS|MDS|Lot 번호|Outline DB|xlsx SSOT/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: default AGENTS.md records degraded foundation status", () => {
  const target = mkTarget("codex-foundations-missing");
  const home = mkTarget("codex-foundations-home-missing");
  try {
    const res = runInit(PLUGINS.codex.bin, [target], { env: { HOME: home } });
    assert.equal(res.status, 0, res.stderr);
    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");

    assert.match(body, /Foundation Status/);
    assert.match(body, /degraded mode/i);
    assert.match(body, /scripts\/update\.sh[\s\S]{0,180}--foundations-only/);
    assert.match(body, /superpowers@claude-plugins-official/);
    assert.match(body, /context-mode@context-mode/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-codex: default AGENTS.md omits foundation warning when installed", () => {
  const target = mkTarget("codex-foundations-installed");
  const home = mkTarget("codex-foundations-home-installed");
  try {
    mkdirSync(resolve(home, ".claude/plugins"), { recursive: true });
    writeFileSync(
      resolve(home, ".claude/plugins/installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "superpowers@claude-plugins-official": [{}],
          "context-mode@context-mode": [{}],
        },
      }),
    );

    const res = runInit(PLUGINS.codex.bin, [target], { env: { HOME: home } });
    assert.equal(res.status, 0, res.stderr);
    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");

    assert.doesNotMatch(body, /Foundation Status/);
    assert.doesNotMatch(body, /degraded mode/i);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --dry-run --update-foundations prints approved foundation plan without mutation", () => {
  const target = mkTarget("codex-foundations-dry-run");
  const home = mkTarget("codex-foundations-dry-run-home");
  const binDir = resolve(home, "bin");
  try {
    mkdirSync(binDir, { recursive: true });
    writeExecutable(
      resolve(binDir, "claude"),
      "#!/usr/bin/env bash\necho claude-should-not-run >&2\nexit 99\n",
    );

    const res = runInit(PLUGINS.codex.bin, [target, "--dry-run", "--update-foundations"], {
      env: { HOME: home, PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /foundation update plan/i);
    assert.match(res.stdout, /DRY-RUN: claude plugin marketplace update claude-plugins-official/);
    assert.match(res.stdout, /DRY-RUN: claude plugin marketplace update context-mode/);
    assert.match(res.stdout, /DRY-RUN: claude plugin install superpowers@claude-plugins-official/);
    assert.match(res.stdout, /DRY-RUN: claude plugin install context-mode@context-mode/);
    assert.doesNotMatch(res.stderr, /claude-should-not-run/);
    assert.ok(!existsSync(resolve(target, "AGENTS.md")), "dry-run must not write AGENTS.md");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --update-foundations refreshes approved foundations only", () => {
  const target = mkTarget("codex-foundations-update");
  const home = mkTarget("codex-foundations-update-home");
  const binDir = resolve(home, "bin");
  const pluginsDir = resolve(home, ".claude/plugins");
  const claudeLog = resolve(home, "claude.log");
  try {
    mkdirSync(binDir, { recursive: true });
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(
      resolve(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "superpowers@claude-plugins-official": {},
          "harness-builder-codex@agent-skill": {},
        },
      }),
    );
    writeExecutable(
      resolve(binDir, "claude"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${claudeLog}"
exit 0
`,
    );

    const res = runInit(PLUGINS.codex.bin, [target, "--update-foundations"], {
      env: { HOME: home, PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /foundation update plan/i);
    assert.match(res.stdout, /no global CLI config files are patched/i);
    assert.ok(existsSync(resolve(target, "AGENTS.md")), "normal update run should still scaffold AGENTS.md");

    const log = readFileSync(claudeLog, "utf-8");
    assert.match(log, /plugin marketplace update claude-plugins-official/);
    assert.match(log, /plugin marketplace update context-mode/);
    assert.match(log, /plugin uninstall superpowers@claude-plugins-official/);
    assert.match(log, /plugin install superpowers@claude-plugins-official/);
    assert.match(log, /plugin install context-mode@context-mode/);
    assert.doesNotMatch(log, /plugin uninstall context-mode@context-mode/);
    assert.doesNotMatch(log, /harness-builder-codex@agent-skill/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --update-foundations without claude prints manual commands", () => {
  const target = mkTarget("codex-foundations-no-claude");
  const home = mkTarget("codex-foundations-no-claude-home");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--update-foundations"], {
      env: { HOME: home, PATH: dirname(process.execPath) },
    });

    assert.equal(res.status, 1, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /foundation update plan/i);
    assert.match(res.stdout, /no global CLI config files are patched/i);
    assert.match(res.stderr, /'claude' binary not found in PATH/);
    assert.match(res.stderr, /\/plugin marketplace update claude-plugins-official/);
    assert.match(res.stderr, /\/plugin marketplace update context-mode/);
    assert.match(res.stderr, /\/plugin install superpowers@claude-plugins-official/);
    assert.match(res.stderr, /\/plugin install context-mode@context-mode/);
    assert.doesNotMatch(res.stderr, /harness-builder-codex@agent-skill/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("harness-builder-codex: preserves existing AGENTS.md with sentinel merge", () => {
  const target = mkTarget("codex-agents-merge");
  try {
    writeFileSync(resolve(target, "AGENTS.md"), "# Existing Project Rules\n\nKeep this local rule.\n");

    const res = runInit(PLUGINS.codex.bin, [target], { env: { PURPOSE: "Merged Codex Project" } });
    assert.equal(res.status, 0, res.stderr);

    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(body, /# Existing Project Rules/);
    assert.match(body, /Keep this local rule/);
    assert.match(body, /<!-- agent-skill:operational:start -->/);
    assert.match(body, /Merged Codex Project/);
    assert.match(body, /<!-- agent-skill:operational:end -->/);
    assert.ok(existsSync(resolve(target, ".codex/skills/orchestrator/SKILL.md")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: replaces only prior AGENTS.md sentinel section", () => {
  const target = mkTarget("codex-agents-replace");
  try {
    writeFileSync(
      resolve(target, "AGENTS.md"),
      [
        "# Existing Project Rules",
        "",
        "Keep this local rule.",
        "",
        "<!-- agent-skill:operational:start -->",
        "# Old generated section",
        "<!-- agent-skill:operational:end -->",
        "",
      ].join("\n"),
    );

    const res = runInit(PLUGINS.codex.bin, [target], { env: { PURPOSE: "Replacement Codex Project" } });
    assert.equal(res.status, 0, res.stderr);

    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(body, /Keep this local rule/);
    assert.match(body, /Replacement Codex Project/);
    assert.doesNotMatch(body, /Old generated section/);
    assert.equal((body.match(/agent-skill:operational:start/g) || []).length, 1);
    assert.equal((body.match(/agent-skill:operational:end/g) || []).length, 1);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: writes folder-level AGENTS.md guides for detected project areas", () => {
  const target = mkTarget("codex-folder-guides");
  try {
    mkdirSync(resolve(target, "backend"), { recursive: true });
    mkdirSync(resolve(target, "frontend"), { recursive: true });
    mkdirSync(resolve(target, "packages/api"), { recursive: true });
    writeFileSync(resolve(target, "packages/api/package.json"), "{}");
    writeFileSync(resolve(target, "backend/AGENTS.md"), "# Backend user rules\n\nKeep backend-specific rule.\n");

    const res = runInit(PLUGINS.codex.bin, [target], { env: { PURPOSE: "Folder Guide Project" } });
    assert.equal(res.status, 0, res.stderr);

    for (const rel of [
      "backend/AGENTS.md",
      "frontend/AGENTS.md",
      "packages/AGENTS.md",
      "packages/api/AGENTS.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
      const body = readFileSync(resolve(target, rel), "utf-8");
      assert.match(body, /Folder Guide Project/);
      assert.match(body, /Root `AGENTS.md` remains the operational index/);
    }

    const backend = readFileSync(resolve(target, "backend/AGENTS.md"), "utf-8");
    assert.match(backend, /# Backend user rules/);
    assert.match(backend, /Keep backend-specific rule/);
    assert.match(backend, /<!-- agent-skill:operational:start -->/);
    assert.match(backend, /<!-- agent-skill:operational:end -->/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated task ledger matches agent-all contract", () => {
  const target = mkTarget("codex-task-ledger-contract");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);

    const index = readFileSync(resolve(target, "docs/tasks/index.md"), "utf-8");
    const template = readFileSync(resolve(target, "docs/tasks/_template.md"), "utf-8");
    const handoffTemplate = readFileSync(resolve(target, "docs/tasks/_handoff-template.md"), "utf-8");
    const guide = readFileSync(resolve(target, "docs/tasks/AGENTS.md"), "utf-8");

    assert.match(index, /^## Active$/m);
    assert.doesNotMatch(index, /^## Active Tasks$/m);
    assert.deepEqual(validateTaskDoc(template), { ok: true, errors: [] });
    assert.match(handoffTemplate, /^## Active Task$/m);
    assert.match(handoffTemplate, /^## Next Action$/m);
    assert.match(guide, /Every active `\/agent-all` run must have one task document/);
    for (const section of REQUIRED_SECTIONS) {
      assert.match(template, new RegExp(`^## ${section}$`, "m"));
    }

    const check = spawnSync("node", ["scripts/agent-task-ledger-check.mjs", "docs/tasks/_template.md"], {
      cwd: target,
      encoding: "utf-8",
    });
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /task ledger ok/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --lite skips ledger and hooks", () => {
  const target = mkTarget("codex-lite");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--lite"]);
    assert.equal(res.status, 0, res.stderr);

    assert.ok(existsSync(resolve(target, "AGENTS.md")));
    assert.ok(!existsSync(resolve(target, "docs/tasks/index.md")));
    assert.ok(!existsSync(resolve(target, ".codex/hooks/agent-policy-hook.mjs")));

    for (const rel of [
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/dev/SKILL.md",
      ".codex/skills/reviewer/SKILL.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing base skill ${rel}`);
    }

    for (const rel of [
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/skills/frontend-dev/SKILL.md",
      ".codex/skills/backend-dev/SKILL.md",
      ".codex/skills/integration-dev/SKILL.md",
      ".codex/skills/verification-reviewer/SKILL.md",
      ".codex/skills/qa-reviewer/SKILL.md",
      ".codex/skills/design-reviewer/SKILL.md",
      ".codex/skills/security-reviewer/SKILL.md",
      ".codex/skills/data-reviewer/SKILL.md",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected operational skill ${rel}`);
    }

    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(body, /lite mode/i);
    assert.doesNotMatch(body, /task[- ]ledger/i);
    assert.doesNotMatch(body, /hard[- ]policy/i);
    assert.doesNotMatch(body, /hard policy hook artifacts are active/i);

    assert.doesNotMatch(res.stdout, /\[hooks\]/);
    assert.doesNotMatch(res.stdout, /agent-policy-hook/);
    assert.doesNotMatch(res.stdout, /SessionStart/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --lang=ko records the selected language in AGENTS.md", () => {
  const target = mkTarget("codex-lang-ko");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--lang=ko"]);
    assert.equal(res.status, 0, res.stderr);

    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(body, /^## Language$/m);
    assert.match(body, /- Interaction language: `ko`/);
    assert.match(body, /- Downstream workflow config should keep `\.agent-all\.json` `language` aligned with this value\./);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --lang=auto resolves Korean locale before writing AGENTS.md", () => {
  const target = mkTarget("codex-lang-auto-ko");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--lang=auto"], {
      env: {
        AGENT_INIT_LANG: "auto",
        LANG: "ko_KR.UTF-8",
        LC_ALL: "",
        LC_MESSAGES: "",
      },
    });
    assert.equal(res.status, 0, res.stderr);

    const body = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(body, /- Interaction language: `ko`/);
    assert.doesNotMatch(body, /- Interaction language: `auto`/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated role skills embed foundation and shared-tree discipline", () => {
  const target = mkTarget("codex-role-discipline");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);

    const roleSkills = {
      planner: ["brainstorming", "writing-plans", "dispatching-parallel-agents"],
      dev: ["test-driven-development", "verification-before-completion"],
      "frontend-dev": ["brainstorming", "test-driven-development", "verification-before-completion"],
      "backend-dev": ["test-driven-development", "verification-before-completion"],
      reviewer: ["requesting-code-review", "verification-before-completion"],
      orchestrator: [
        "dispatching-parallel-agents",
        "subagent-driven-development",
        "verification-before-completion",
      ],
      "verification-reviewer": ["requesting-code-review", "verification-before-completion"],
      "qa-reviewer": ["requesting-code-review", "verification-before-completion"],
      "design-reviewer": ["requesting-code-review", "verification-before-completion"],
      "security-reviewer": ["requesting-code-review", "verification-before-completion"],
      "data-reviewer": ["requesting-code-review", "verification-before-completion"],
      "integration-dev": ["test-driven-development", "verification-before-completion"],
    };
    const verificationAuditRoles = [
      "reviewer",
      "verification-reviewer",
      "integration-dev",
      "design-reviewer",
      "security-reviewer",
      "data-reviewer",
    ];

    for (const [role, skills] of Object.entries(roleSkills)) {
      const body = readFileSync(resolve(target, `.codex/skills/${role}/SKILL.md`), "utf-8");
      assert.match(body, /AGENTS\.md[\s\S]{0,160}docs\/tasks/, `${role} must read root and task context`);
      assert.doesNotMatch(body, /superpowers:\*/, `${role} must not use a generic superpowers placeholder`);
      for (const skill of skills) {
        assert.match(body, new RegExp(`superpowers:${skill}`), `${role} must name ${skill}`);
      }
      assert.match(body, /context-mode|file-backed logs|large output/i, `${role} must route bulk context`);
      assert.match(body, /shared-tree|unrelated edits|HOT-file/i, `${role} must preserve shared workspace safety`);
      if (verificationAuditRoles.includes(role)) {
        assert.match(body, /Phase 4|Review Task/i, `${role} must describe Phase 4 review dispatch`);
        assert.match(body, /VERIFICATION_AUDIT: passed/, `${role} must emit a passed audit token`);
        assert.match(body, /VERIFICATION_AUDIT: failed/, `${role} must emit a failed audit token`);
        assert.match(body, /VERIFICATION_AUDIT: skipped/, `${role} must emit a skipped audit token`);
        assert.match(body, /literal line at the END/i, `${role} must make the audit token mechanically extractable`);
      }
    }

    const orchestrator = readFileSync(resolve(target, ".codex/skills/orchestrator/SKILL.md"), "utf-8");
    assert.match(orchestrator, /## Implementation Routing Matrix/);
    assert.match(orchestrator, /UI, routes, client state, browser behavior \| `frontend-dev`/);
    assert.match(orchestrator, /API, services, jobs, persistence \| `backend-dev`/);
    assert.match(orchestrator, /## Role Gate Matrix/);
    assert.match(orchestrator, /sequential dispatch/i);
    assert.match(orchestrator, /UI or user-visible flow \| `design-reviewer` \+ `qa-reviewer`/);
    assert.match(orchestrator, /Auth, permissions, secrets, destructive actions \| `security-reviewer`/);
    assert.match(orchestrator, /Frontend \+ backend\/API contract \| `integration-dev` \+ `verification-reviewer`/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated QA reviewer emits the Phase 4 QA audit token", () => {
  const target = mkTarget("codex-qa-audit-token");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);

    const body = readFileSync(resolve(target, ".codex/skills/qa-reviewer/SKILL.md"), "utf-8");
    assert.match(body, /Phase 4 QA reviewer|QA Review Task/i);
    assert.match(body, /QA_AUDIT: passed/);
    assert.match(body, /QA_AUDIT: failed/);
    assert.match(body, /QA_AUDIT: skipped/);
    assert.match(body, /literal line at the END/i);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated QA artifacts preserve configured QA personas", () => {
  const target = mkTarget("codex-qa-personas");
  try {
    const ctxPath = join(target, "_ctx.json");
    writeFileSync(ctxPath, JSON.stringify({
      purpose: "QA persona routing",
      size: "medium",
      qa_personas: ["auth", "payments"],
      deploy_targets: "",
      constraints: "",
    }));

    const res = runInit(PLUGINS.codex.bin, [target, "--ctx", ctxPath]);
    assert.equal(res.status, 0, res.stderr);

    const root = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(root, /QA personas[\s\S]{0,120}auth[\s\S]{0,120}payments/i);

    const qa = readFileSync(resolve(target, ".codex/skills/qa-reviewer/SKILL.md"), "utf-8");
    assert.match(qa, /Configured QA personas[\s\S]{0,120}auth[\s\S]{0,120}payments/i);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: invalid --lang value fails before writing files", () => {
  const target = mkTarget("codex-lang-invalid");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--lang=fr"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /--lang must be one of: en, ko, auto/);
    assert.ok(!existsSync(resolve(target, "AGENTS.md")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: default config snippet includes sentinel markers", () => {
  const target = mkTarget("codex-config-sentinel");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /agent-skill:codex-config:start/);
    assert.match(res.stdout, /agent-skill:codex-config:end/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: config stdout uses Codex Bash PreToolUse hook and no SessionStart noise", () => {
  const target = mkTarget("codex-config-bash-pretool");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /\[\[hooks\.PreToolUse\]\]/);
    assert.match(res.stdout, /matcher = "\^Bash\$"/);
    assert.match(res.stdout, /\[\[hooks\.PreToolUse\.hooks\]\]/);
    assert.match(res.stdout, /type = "command"/);
    assert.match(res.stdout, /timeout = 30/);
    assert.doesNotMatch(res.stdout, /\[\[hooks\.pre_tool_use\]\]/);
    assert.doesNotMatch(res.stdout, /matcher = "shell_command"/);
    assert.doesNotMatch(res.stdout, /timeout_seconds/);
    assert.doesNotMatch(res.stdout, /matcher = "\.\*"/);
    assert.doesNotMatch(res.stdout, /SessionStart/);
    assert.doesNotMatch(res.stdout, /session start/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: config stdout includes Windows override and repo-root hook commands", () => {
  const target = mkTarget("codex-config-windows-command");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /command_windows = /);
    assert.match(res.stdout, /\$\(git rev-parse --show-toplevel\)\/\.codex\/hooks\/agent-policy-hook\.mjs/);
    assert.match(res.stdout, /Join-Path \(git rev-parse --show-toplevel\) '\.codex\/hooks\/agent-policy-hook\.mjs'/);
    assert.doesNotMatch(res.stdout, new RegExp(`node '${target.replaceAll("\\", "\\\\").replaceAll("/", "\\/")}\\/\\.codex\\/hooks\\/agent-policy-hook\\.mjs'`));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: refuses late conflicts before writing any scaffold files", () => {
  const target = mkTarget("codex-atomic-refuse");
  try {
    const existingHook = resolve(target, ".codex/hooks/agent-policy-hook.mjs");
    mkdirSync(resolve(target, ".codex/hooks"), { recursive: true });
    writeFileSync(existingHook, "// existing hook\n", { flag: "wx" });

    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 2);
    assert.match(res.stderr, /Refusing to overwrite/);
    assert.ok(!existsSync(resolve(target, "AGENTS.md")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated hook ignores destructive non-Bash PreToolUse payloads", () => {
  const target = mkTarget("codex-hook-non-bash");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    const hookPath = resolve(target, ".codex/hooks/agent-policy-hook.mjs");
    const hookRes = spawnSync("node", [hookPath], {
      encoding: "utf-8",
      input: JSON.stringify({
        tool_name: "apply_patch",
        tool_input: { command: "git reset --hard" },
      }),
    });
    assert.equal(hookRes.status, 0, hookRes.stderr);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated hook blocks destructive Bash PreToolUse payloads", () => {
  const target = mkTarget("codex-hook-bash");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    const hookPath = resolve(target, ".codex/hooks/agent-policy-hook.mjs");
    const hookRes = spawnSync("node", [hookPath], {
      encoding: "utf-8",
      input: JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "git reset --hard" },
      }),
    });
    assert.equal(hookRes.status, 2);
    assert.match(hookRes.stderr, /git reset --hard/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: generated hook blocks destructive shell_command PreToolUse payloads", () => {
  const target = mkTarget("codex-hook-shell-command");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    const hookPath = resolve(target, ".codex/hooks/agent-policy-hook.mjs");
    const hookRes = spawnSync("node", [hookPath], {
      encoding: "utf-8",
      input: JSON.stringify({
        tool_name: "shell_command",
        tool_input: { command: "git reset --hard" },
      }),
    });
    assert.equal(hookRes.status, 2);
    assert.match(hookRes.stderr, /git reset --hard/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --theme=lite skips ledger and hooks", () => {
  const target = mkTarget("codex-theme-lite");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--theme=lite"]);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(existsSync(resolve(target, "AGENTS.md")));
    assert.ok(!existsSync(resolve(target, "docs/tasks/index.md")));
    assert.ok(!existsSync(resolve(target, ".codex/hooks/agent-policy-hook.mjs")));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("harness-builder-codex: --dry-run reports planned writes without writing files", () => {
  const target = mkTarget("codex-dry-run");
  try {
    const res = runInit(PLUGINS.codex.bin, [target, "--dry-run"]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /dry-run: would write/);
    assert.ok(!existsSync(resolve(target, "AGENTS.md")));
    assert.ok(!existsSync(resolve(target, ".codex/hooks/agent-policy-hook.mjs")));
    assert.ok(!existsSync(resolve(target, "docs/tasks/index.md")));
    assert.match(res.stdout, PLUGINS.codex.stdoutHeader);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

function mkTarget(slug) {
  return mkdtempSync(join(tmpdir(), `hb-${slug}-init-`));
}

for (const [name, spec] of Object.entries(PLUGINS)) {
  test(`harness-builder-${name}: usage error when target missing`, () => {
    const res = runInit(spec.bin, []);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Usage:/);
  });

  test(`harness-builder-${name}: errors on non-existent target dir`, () => {
    const missing = join(tmpdir(), `hb-${name}-does-not-exist-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const res = runInit(spec.bin, [missing]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /does not exist/);
  });

  test(`harness-builder-${name}: writes all expected files and prints config snippet`, () => {
    const target = mkTarget(name);
    try {
      const res = runInit(spec.bin, [target]);
      assert.equal(res.status, 0, res.stderr);
      for (const rel of spec.files) {
        assert.ok(
          existsSync(resolve(target, rel)),
          `missing ${rel}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
        );
      }
      // Stdout MUST carry the platform-specific config snippet header + body.
      assert.match(res.stdout, spec.stdoutHeader);
      assert.match(res.stdout, spec.stdoutContains);

      if (name === "gemini") {
        assert.match(res.stdout, /"mcpServers"/);
        assert.doesNotMatch(res.stdout, /"hooks"/);
        assert.doesNotMatch(res.stdout, /BeforeTool/);
        assert.doesNotMatch(res.stdout, /SessionStart/);
        assert.doesNotMatch(res.stdout, /echo 'before write_file'/);
        assert.doesNotMatch(res.stdout, /echo 'session start'/);

        const body = readFileSync(resolve(target, "GEMINI.md"), "utf-8");
        assert.match(body, /soft enforcement/i);
        assert.match(body, /docs\/tasks/);
        assert.match(body, /pathspec/);
        assert.match(body, /git add -A/);
        assert.match(body, /git commit -a/);
        assert.match(body, /git commit --amend/);
        assert.match(body, /git reset --hard/);
        assert.match(body, /git checkout --/);
        assert.match(body, /force push/i);
        assert.match(body, /Decision Matrix/);
        assert.match(body, /Ambiguity Log/);
        assert.match(body, /Progress Snapshot/);
        assert.match(body, /Verification/);
        assert.match(body, /handoff/i);
        assert.match(body, /active task[\s\S]*completed[\s\S]*remaining[\s\S]*blockers[\s\S]*next action/i);
        assert.match(body, /context-mode/);
        assert.match(body, /superpowers/);
        assert.doesNotMatch(body, /\.gemini\/hooks\/agent-policy-hook/);
      }
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-builder-${name}: --ctx flag overrides defaults`, () => {
    const target = mkTarget(name);
    try {
      const ctxPath = join(target, "_ctx.json");
      const purpose = `CTX_PURPOSE_${name.toUpperCase()}_${Date.now()}`;
      writeFileSync(ctxPath, JSON.stringify({
        purpose,
        size: "small",
        qa_personas: ["auth"],
        deploy_targets: "fly.io",
        constraints: "GDPR",
      }));
      const res = runInit(spec.bin, [target, "--ctx", ctxPath]);
      assert.equal(res.status, 0, res.stderr);
      const body = readFileSync(resolve(target, spec.purposeFile), "utf-8");
      assert.ok(
        body.includes(purpose),
        `expected purpose '${purpose}' in ${spec.purposeFile}:\n${body}`,
      );
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-builder-${name}: refuses overwrite without --force; succeeds with --force`, () => {
    const target = mkTarget(name);
    try {
      let res = runInit(spec.bin, [target]);
      assert.equal(res.status, 0, res.stderr);

      // Second run without --force must bail with exit 2.
      res = runInit(spec.bin, [target]);
      assert.equal(res.status, 2);
      assert.match(res.stderr, /Refusing to overwrite/);

      // With --force, succeeds again.
      res = runInit(spec.bin, [target, "--force"]);
      assert.equal(res.status, 0, res.stderr);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test(`harness-builder-${name}: env PURPOSE flows into the rendered memory file`, () => {
    const target = mkTarget(name);
    try {
      const purpose = `ENV_PURPOSE_${name.toUpperCase()}_${Date.now()}`;
      const res = runInit(spec.bin, [target], { env: { PURPOSE: purpose } });
      assert.equal(res.status, 0, res.stderr);
      const body = readFileSync(resolve(target, spec.purposeFile), "utf-8");
      assert.ok(
        body.includes(purpose),
        `expected env PURPOSE '${purpose}' in ${spec.purposeFile}:\n${body}`,
      );
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });
}
