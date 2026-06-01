import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

test("install-all --help documents approved foundation bootstrap flags", () => {
  const res = spawnSync("/bin/bash", [INSTALL_ALL, "--help"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /--foundations/);
  assert.match(res.stdout, /--foundations-only/);
  assert.match(res.stdout, /superpowers/);
  assert.match(res.stdout, /context-mode/);
  assert.doesNotMatch(res.stderr, /claude' binary not found/);
});

test("install-all --dry-run --foundations prints approved foundations and selected plugins without claude", () => {
  const res = spawnSync("/bin/bash", [INSTALL_ALL, "--dry-run", "--foundations", "--claude-code"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /Selected foundation install dry-run/);
  assert.match(res.stdout, /DRY-RUN: claude plugin marketplace update claude-plugins-official/);
  assert.match(res.stdout, /DRY-RUN: claude plugin marketplace update context-mode/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install superpowers@claude-plugins-official/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install context-mode@context-mode/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install harness-builder@agent-skill/);
  assert.doesNotMatch(res.stderr, /claude' binary not found/);
});

test("install-all --dry-run --foundations-only skips agent-skill plugin selection", () => {
  const res = spawnSync("/bin/bash", [INSTALL_ALL, "--dry-run", "--foundations-only"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /Selected foundation install dry-run/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install superpowers@claude-plugins-official/);
  assert.match(res.stdout, /DRY-RUN: claude plugin install context-mode@context-mode/);
  assert.doesNotMatch(res.stdout, /harness-builder@agent-skill/);
  assert.doesNotMatch(res.stdout, /Installing [0-9]+ plugins from agent-skill/);
  assert.doesNotMatch(res.stderr, /claude' binary not found/);
});

test("install-all --foundations --cli=codex installs foundations before selected Codex plugins", () => {
  const home = tmp("agent-skill-release-install-all-foundations-home-");
  const binDir = resolve(home, "bin");
  const claudeLog = resolve(home, "claude.log");
  try {
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      resolve(binDir, "claude"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${claudeLog}"
exit 0
`,
      { mode: 0o755 },
    );

    const res = spawnSync("/bin/bash", [INSTALL_ALL, "--foundations", "--cli=codex"], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home, PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /Installing approved foundation plugins/);
    assert.match(res.stdout, /Installing 3 plugins from agent-skill/);

    const log = readFileSync(claudeLog, "utf-8");
    const foundationIndex = log.indexOf("plugin install superpowers@claude-plugins-official");
    const codexIndex = log.indexOf("plugin install harness-builder-codex@agent-skill");
    assert.ok(foundationIndex >= 0, "missing superpowers install");
    assert.ok(codexIndex > foundationIndex, "Codex plugin installs must run after foundation installs");
    assert.match(log, /plugin marketplace update claude-plugins-official/);
    assert.match(log, /plugin marketplace update context-mode/);
    assert.match(log, /plugin install context-mode@context-mode/);
    assert.match(log, /plugin install harness-floor-codex@agent-skill/);
    assert.match(log, /plugin install harness-thrift-codex@agent-skill/);
    assert.doesNotMatch(log, /plugin install harness-builder@agent-skill/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-all --dry-run labels Codex plugin bundles without presenting them as Claude-native installs", () => {
  const res = spawnSync("/bin/bash", [INSTALL_ALL, "--dry-run", "--cli=codex"], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /DRY-RUN: install harness-builder-codex@agent-skill for Codex CLI/);
  assert.match(res.stdout, /marketplace command: claude plugin install harness-builder-codex@agent-skill/);
  assert.doesNotMatch(res.stdout, /DRY-RUN: claude plugin install harness-builder-codex@agent-skill/);
  assert.doesNotMatch(res.stderr, /claude' binary not found/);
});

test("install-platform --help documents dry-run and canonical wrapper flags", () => {
  const res = spawnSync("/bin/bash", [INSTALL_PLATFORM, "--help"], {
    encoding: "utf-8",
  });

  assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  assert.match(res.stdout, /Usage:/);
  assert.match(res.stdout, /--platform=<NAME>/);
  assert.match(res.stdout, /--target=<DIR>/);
  assert.match(res.stdout, /--ctx(?:[ =]|=<)/);
  assert.match(res.stdout, /--dry-run/);
  assert.match(res.stdout, /--lang=en\|ko\|auto/);
  assert.match(res.stdout, /--update-foundations/);
  assert.match(res.stdout, /--no-doctor/);
  assert.doesNotMatch(res.stderr, /--platform and --target are required/);
});

test("install-platform codex --dry-run reports selected scripts without writing files", () => {
  const target = tmp("agent-skill-release-platform-dry-run-target-");
  const home = tmp("agent-skill-release-platform-dry-run-home-");
  const ctx = resolve(home, "ctx.json");
  writeFileSync(ctx, "{}\n");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--ctx",
      ctx,
      "--theme=all",
      "--dry-run",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /DRY-RUN/);
    assert.match(res.stdout, /harness-builder-codex\/bin\/init\.mjs/);
    assert.match(res.stdout, /harness-floor-codex\/bin\/init\.mjs/);
    assert.match(res.stdout, /harness-thrift-codex\/bin\/install\.mjs/);
    assert.match(res.stdout, /--no-instrument/);
    assert.match(res.stdout, /DRY-RUN: node .*scripts\/doctor\.mjs .*--platform=codex/);
    assert.ok(res.stdout.includes(target), "dry-run output should include the target path");
    assert.ok(res.stdout.includes(`--ctx ${ctx}`), "dry-run output should include documented --ctx path form");

    for (const rel of [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `dry-run wrote unexpected ${rel}`);
    }
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "dry-run must not create or patch global Codex config");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex --dry-run --update-foundations prints approved foundation plan without mutation", () => {
  const target = tmp("agent-skill-release-platform-foundations-dry-run-target-");
  const home = tmp("agent-skill-release-platform-foundations-dry-run-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=builder",
      "--dry-run",
      "--update-foundations",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /foundation update plan/i);
    assert.match(res.stdout, /Selected foundation update dry-run/);
    assert.match(res.stdout, /DRY-RUN: claude plugin marketplace update claude-plugins-official/);
    assert.match(res.stdout, /DRY-RUN: claude plugin marketplace update context-mode/);
    assert.match(res.stdout, /DRY-RUN: claude plugin install superpowers@claude-plugins-official/);
    assert.match(res.stdout, /DRY-RUN: claude plugin install context-mode@context-mode/);
    assert.match(res.stdout, /harness-builder-codex\/bin\/init\.mjs/);
    assert.ok(!existsSync(resolve(target, "AGENTS.md")), "dry-run must not write AGENTS.md");
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "dry-run must not patch global Codex config");
    assert.doesNotMatch(res.stderr, /claude' binary not found/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex --update-foundations refreshes approved foundations only", () => {
  const target = tmp("agent-skill-release-platform-foundations-target-");
  const home = tmp("agent-skill-release-platform-foundations-home-");
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
    writeFileSync(
      resolve(binDir, "claude"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${claudeLog}"
exit 0
`,
      { mode: 0o755 },
    );

    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=builder",
      "--update-foundations",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home, PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stdout, /foundation update plan/i);
    assert.match(res.stdout, /no global CLI config files are patched/i);
    assert.ok(existsSync(resolve(target, "AGENTS.md")), "normal run should scaffold AGENTS.md");
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "must not patch global Codex config");

    const log = readFileSync(claudeLog, "utf-8");
    assert.match(log, /plugin marketplace update claude-plugins-official/);
    assert.match(log, /plugin marketplace update context-mode/);
    assert.match(log, /plugin uninstall superpowers@claude-plugins-official/);
    assert.match(log, /plugin install superpowers@claude-plugins-official/);
    assert.match(log, /plugin install context-mode@context-mode/);
    assert.doesNotMatch(log, /harness-builder-codex@agent-skill/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform rejects --update-foundations outside Codex before writing scaffold files", () => {
  const target = tmp("agent-skill-release-platform-foundations-non-codex-target-");
  const home = tmp("agent-skill-release-platform-foundations-non-codex-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=gemini",
      `--target=${target}`,
      "--update-foundations",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.notEqual(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stderr, /--update-foundations is currently supported only with --platform=codex/);
    assert.match(res.stderr, /scripts\/update\.sh --foundations-only/);
    assert.ok(!existsSync(resolve(target, "GEMINI.md")), "unsupported foundation update flag must fail before writing GEMINI.md");
    assert.ok(!existsSync(resolve(home, ".gemini/settings.json")), "unsupported foundation update flag must not patch global Gemini settings");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform vscode-copilot installs only VS Code instructions", () => {
  const target = tmp("agent-skill-release-vscode-copilot-target-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=vscode-copilot",
      `--target=${target}`,
      "--theme=all",
    ], {
      encoding: "utf-8",
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.ok(existsSync(resolve(target, ".github/copilot-instructions.md")), "missing VS Code instructions");
    for (const rel of [
      "AGENTS.md",
      ".github/instructions/planner.instructions.md",
      ".github/hooks/preToolUse.json",
      ".github/hooks/postToolUse.json",
      ".github/hooks/agentStop.json",
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected VS Code Copilot artifact ${rel}`);
    }

    assert.match(res.stdout, /VS Code Copilot/i);
    assert.match(res.stdout, /instructions-only/i);
    assert.doesNotMatch(res.stdout, /\.github\/hooks|\.agent-all\.json|\.thrift\.json/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("install-platform codex all succeeds in a fresh project without patching global Codex config", () => {
  const target = tmp("agent-skill-release-codex-target-");
  const home = tmp("agent-skill-release-codex-home-");
  const skipDoctorTarget = tmp("agent-skill-release-codex-no-doctor-target-");
  const skipDoctorHome = tmp("agent-skill-release-codex-no-doctor-home-");
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
    assert.match(res.stdout, /Post-install doctor/i);
    assert.match(res.stdout, /harness doctor: ok/i);
    assert.match(res.stdout, /platform: Codex/i);
    assert.match(res.stdout, /profile: operational/i);
    assert.doesNotMatch(res.stdout, /\[\[hooks\.agent\]\]/);
    assert.doesNotMatch(res.stdout, /MVP scope|follow-up plan/i);
    assert.doesNotMatch(res.stderr, /Cannot patch/);
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "installer must not create or patch global Codex config");

    const skipped = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${skipDoctorTarget}`,
      "--theme=all",
      "--no-doctor",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: skipDoctorHome },
    });

    assert.equal(skipped.status, 0, `stdout:\n${skipped.stdout}\nstderr:\n${skipped.stderr}`);
    assert.ok(existsSync(resolve(skipDoctorTarget, "AGENTS.md")), "skip-doctor run should still scaffold the project");
    assert.doesNotMatch(skipped.stdout, /Post-install doctor|harness doctor/i);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(skipDoctorTarget, { recursive: true, force: true });
    rmSync(skipDoctorHome, { recursive: true, force: true });
  }
});

test("install-platform gemini all succeeds without patching global Gemini settings", () => {
  const target = tmp("agent-skill-release-gemini-target-");
  const home = tmp("agent-skill-release-gemini-home-");
  const thriftOnlyTarget = tmp("agent-skill-release-gemini-thrift-target-");
  const thriftOnlyHome = tmp("agent-skill-release-gemini-thrift-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=gemini",
      `--target=${target}`,
      "--theme=all",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    for (const rel of [
      "GEMINI.md",
      ".gemini/skills/planner/SKILL.md",
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
      ".gemini/hooks/thrift-beforetool-bash-telemetry.mjs",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }

    assert.match(res.stdout, /instrument:\s+no/);
    assert.match(res.stdout, /manual merge|settings\.json/i);
    assert.ok(!existsSync(resolve(home, ".gemini/settings.json")), "installer must not create or patch global Gemini settings");

    const thriftOnly = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=gemini",
      `--target=${thriftOnlyTarget}`,
      "--theme=thrift",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: thriftOnlyHome },
    });

    assert.equal(thriftOnly.status, 0, `stdout:\n${thriftOnly.stdout}\nstderr:\n${thriftOnly.stderr}`);
    assert.ok(existsSync(resolve(thriftOnlyTarget, ".thrift.json")), "missing thrift-only .thrift.json");
    assert.match(thriftOnly.stdout, /instrument:\s+no/);
    assert.match(thriftOnly.stdout, /Merge the following into ~\/\.gemini\/settings\.json \(hooks\)/);
    assert.ok(!existsSync(resolve(thriftOnlyHome, ".gemini/settings.json")), "thrift theme must not patch global Gemini settings");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(thriftOnlyTarget, { recursive: true, force: true });
    rmSync(thriftOnlyHome, { recursive: true, force: true });
  }
});

test("install-platform codex --lang=ko persists language into builder and floor artifacts", () => {
  const target = tmp("agent-skill-release-codex-lang-target-");
  const home = tmp("agent-skill-release-codex-lang-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=all",
      "--lang=ko",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const agents = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    const agentAll = JSON.parse(readFileSync(resolve(target, ".agent-all.json"), "utf-8"));

    assert.match(agents, /Interaction language:\s+`?ko`?/);
    assert.equal(agentAll.language, "ko");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex --lang=auto resolves locale before persisting language", () => {
  const target = tmp("agent-skill-release-codex-auto-lang-target-");
  const home = tmp("agent-skill-release-codex-auto-lang-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=all",
      "--lang=auto",
    ], {
      encoding: "utf-8",
      env: {
        ...process.env,
        HOME: home,
        AGENT_INIT_LANG: "auto",
        LANG: "ko_KR.UTF-8",
        LC_ALL: "",
        LC_MESSAGES: "",
      },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    const agents = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    const agentAll = JSON.parse(readFileSync(resolve(target, ".agent-all.json"), "utf-8"));

    assert.match(agents, /Interaction language:\s+`?ko`?/);
    assert.equal(agentAll.language, "ko");
    assert.notEqual(agentAll.language, "auto");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform rejects invalid --lang before writing scaffold files", () => {
  const target = tmp("agent-skill-release-codex-invalid-lang-target-");
  const home = tmp("agent-skill-release-codex-invalid-lang-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--lang=fr",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.notEqual(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    assert.match(res.stderr, /--lang must be one of: en, ko, auto/);
    assert.ok(!existsSync(resolve(target, "AGENTS.md")), "invalid --lang must fail before writing AGENTS.md");
    assert.ok(!existsSync(resolve(target, ".agent-all.json")), "invalid --lang must fail before writing .agent-all.json");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex --lite installs only the builder lite scaffold", () => {
  const target = tmp("agent-skill-release-codex-lite-target-");
  const home = tmp("agent-skill-release-codex-lite-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--lite",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    for (const rel of [
      "AGENTS.md",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/dev/SKILL.md",
      ".codex/skills/reviewer/SKILL.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }
    for (const rel of [
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      "docs/tasks/index.md",
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected lite artifact ${rel}`);
    }

    const agents = readFileSync(resolve(target, "AGENTS.md"), "utf-8");
    assert.match(agents, /lite mode/i);
    assert.match(res.stdout, /profile: lite/i);
    assert.match(res.stdout, /Post-install doctor/i);
    assert.match(res.stdout, /harness doctor: ok/i);
    assert.doesNotMatch(res.stdout, /\[\[hooks\.PreToolUse\]\]/);
    assert.doesNotMatch(res.stdout, /\[mcp_servers\.playwright\]/);
    assert.doesNotMatch(res.stdout, /instrument:\s+no/);
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "installer must not create or patch global Codex config");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex builder theme installs only builder artifacts and reports them", () => {
  const target = tmp("agent-skill-release-codex-builder-target-");
  const home = tmp("agent-skill-release-codex-builder-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=builder",
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
      "docs/tasks/index.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }
    for (const rel of [
      ".visual-qa.json",
      ".agent-all.json",
      ".thrift.json",
      ".codex/skills/agent-all-codex/SKILL.md",
      ".codex/skills/visual-qa-codex/SKILL.md",
      ".codex/hooks/thrift-pretool-bash-telemetry.toml",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected builder artifact ${rel}`);
    }

    assert.match(res.stdout, /theme: builder/);
    assert.match(res.stdout, /Post-install doctor/i);
    assert.match(res.stdout, /profile: builder/i);
    assert.doesNotMatch(res.stdout, /\.visual-qa\.json|\.agent-all\.json|\.thrift\.json/);
    assert.doesNotMatch(res.stdout, /\[mcp_servers\.playwright\]|instrument:\s+no/);
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex thrift theme installs only thrift artifacts and reports them", () => {
  const target = tmp("agent-skill-release-codex-thrift-target-");
  const home = tmp("agent-skill-release-codex-thrift-home-");
  try {
    const res = spawnSync("/bin/bash", [
      INSTALL_PLATFORM,
      "--platform=codex",
      `--target=${target}`,
      "--theme=thrift",
    ], {
      encoding: "utf-8",
      env: { ...process.env, HOME: home },
    });

    assert.equal(res.status, 0, `stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    for (const rel of [
      ".thrift.json",
      ".codex/hooks/thrift-pretool-bash-telemetry.toml",
      ".codex/hooks/thrift-posttool-summariser-trigger.toml",
      ".codex/hooks/thrift-sessionend-audit.toml",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }
    for (const rel of [
      "AGENTS.md",
      ".visual-qa.json",
      ".agent-all.json",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/agent-all-codex/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected thrift artifact ${rel}`);
    }

    assert.match(res.stdout, /theme: thrift/);
    assert.match(res.stdout, /\.thrift\.json/);
    assert.doesNotMatch(res.stdout, /AGENTS\.md|\.visual-qa\.json|\.agent-all\.json|\.codex\/skills\//);
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "thrift theme must not patch global Codex config via install-platform");
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("install-platform codex floor theme installs only floor artifacts and reports them", () => {
  const target = tmp("agent-skill-release-codex-floor-target-");
  const home = tmp("agent-skill-release-codex-floor-home-");
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
      ".visual-qa.json",
      ".agent-all.json",
      ".codex/skills/agent-all-codex/SKILL.md",
      ".codex/skills/visual-qa-codex/SKILL.md",
      ".codex/skills/visual-qa-page/SKILL.md",
    ]) {
      assert.ok(existsSync(resolve(target, rel)), `missing ${rel}`);
    }
    for (const rel of [
      "AGENTS.md",
      "docs/tasks/index.md",
      ".thrift.json",
      ".codex/skills/planner/SKILL.md",
      ".codex/skills/orchestrator/SKILL.md",
      ".codex/hooks/agent-policy-hook.mjs",
      ".codex/hooks/thrift-pretool-bash-telemetry.toml",
    ]) {
      assert.ok(!existsSync(resolve(target, rel)), `unexpected floor artifact ${rel}`);
    }

    assert.match(res.stdout, /theme: floor/);
    assert.match(res.stdout, /\[mcp_servers\.playwright\]/);
    assert.match(res.stdout, /No hook snippet is emitted for agent-all-codex/i);
    assert.match(res.stdout, /Playwright MCP snippet and Codex floor guidance were printed to stdout for manual merge/);
    assert.doesNotMatch(res.stdout, /AGENTS\.md|docs\/tasks|\.thrift\.json|instrument:\s+no/);
    assert.ok(!existsSync(resolve(home, ".codex/config.toml")), "floor theme must not patch global Codex config via install-platform");
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
    assert.doesNotMatch(agentAll, /plugins\/harness-floor/);
    assert.doesNotMatch(visualQa, /plugins\/harness-floor/);
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
  return Array.from(
    stdout.matchAll(/DRY-RUN: (?:claude plugin install|install) ([^@\s]+)@agent-skill/g),
    (match) => match[1],
  ).sort();
}
