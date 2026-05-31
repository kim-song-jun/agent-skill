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
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  REQUIRED_SECTIONS,
  validateTaskDoc,
} from "../../plugins/harness-floor/skills/agent-all/lib/task-ledger.mjs";

const REPO = resolve(".");

const PLUGINS = {
  codex: {
    bin:   resolve(REPO, "plugins/harness-builder-codex/bin/init.mjs"),
    files: [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/dev/SKILL.md",
      ".codex/skills/reviewer/SKILL.md",
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/skills/verification-reviewer/SKILL.md",
      ".codex/skills/qa-reviewer/SKILL.md",
      ".codex/skills/design-reviewer/SKILL.md",
      ".codex/skills/security-reviewer/SKILL.md",
      ".codex/skills/data-reviewer/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      "docs/tasks/index.md",
      "docs/tasks/_template.md",
    ],
    stdoutContains: /\[hooks\]/,            // TOML snippet for ~/.codex/config.toml
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

test("harness-builder-codex: config template is operational-only hook snippet", () => {
  const body = readFileSync(CODEX_CONFIG_TEMPLATE, "utf-8");

  assert.match(body, /agent-skill:codex-config:start/);
  assert.match(body, /agent-skill:codex-config:end/);
  assert.match(body, /\[hooks\]/);
  assert.match(body, /PreToolUse/);
  assert.match(body, /matcher = "\^Bash\$"/);
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

    assert.match(index, /^## Active$/m);
    assert.doesNotMatch(index, /^## Active Tasks$/m);
    assert.deepEqual(validateTaskDoc(template), { ok: true, errors: [] });
    for (const section of REQUIRED_SECTIONS) {
      assert.match(template, new RegExp(`^## ${section}$`, "m"));
    }
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
    assert.doesNotMatch(body, /hard policy hook artifacts are active/i);

    assert.doesNotMatch(res.stdout, /\[hooks\]/);
    assert.doesNotMatch(res.stdout, /agent-policy-hook/);
    assert.doesNotMatch(res.stdout, /SessionStart/);
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

test("harness-builder-codex: config stdout uses Bash-only matcher and no SessionStart noise", () => {
  const target = mkTarget("codex-config-bash-only");
  try {
    const res = runInit(PLUGINS.codex.bin, [target]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /matcher = "\^Bash\$"/);
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
