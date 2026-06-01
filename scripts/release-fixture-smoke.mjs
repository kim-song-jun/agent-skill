#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CLAUDE_ESSENTIALS = [
  "harness-builder",
  "harness-floor",
  "harness-thrift",
  "harness-explore",
  "harness-debug",
];

const CODEX_OPERATIONAL_PRESENT = [
  "AGENTS.md",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/verification-reviewer/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/visual-qa-page/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  ".codex/hooks/thrift-pretool-bash-telemetry.toml",
  "docs/tasks/index.md",
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
];

const CODEX_LITE_PRESENT = [
  "AGENTS.md",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/dev/SKILL.md",
  ".codex/skills/reviewer/SKILL.md",
];

const CODEX_LITE_ABSENT = [
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  "docs/tasks/index.md",
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
];

export function runReleaseFixtureSmoke({ root = ROOT } = {}) {
  const checks = {
    claudeMarketplace: checkClaudeMarketplace(root),
    codexOperational: checkCodexOperational(root),
    codexLite: checkCodexLite(root),
  };

  return {
    ok: Object.values(checks).every((check) => check.ok),
    root,
    checks,
  };
}

function checkClaudeMarketplace(root) {
  const res = spawnSync("/bin/bash", [
    resolve(root, "scripts/install-all.sh"),
    "--dry-run",
    "--claude-code",
  ], {
    encoding: "utf-8",
    env: { ...process.env, PATH: "/usr/bin:/bin" },
  });

  const missing = CLAUDE_ESSENTIALS.filter(
    (plugin) => !res.stdout.includes(`DRY-RUN: claude plugin install ${plugin}@agent-skill`),
  );
  const ok = res.status === 0 && missing.length === 0 && !/claude' binary not found/i.test(res.stderr);

  return {
    ok,
    summary: `Claude marketplace dry-run: ${ok ? "ok" : "failed"} (${CLAUDE_ESSENTIALS.length - missing.length}/${CLAUDE_ESSENTIALS.length} plugins)`,
    details: ok ? "all essentials installable without a live claude binary" : compactFailure(res, missing),
  };
}

function checkCodexOperational(root) {
  return withFixture("agent-skill-release-codex-operational-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=all"]);
    const missing = missingFiles(target, CODEX_OPERATIONAL_PRESENT);
    const homeConfig = resolve(home, ".codex/config.toml");
    const stdoutChecks = [
      ["prints current PreToolUse hook snippet", /\[\[hooks\.PreToolUse\]\]/.test(res.stdout)],
      ["prints Playwright MCP snippet", /\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["uses codex thrift no-instrument path", /instrument:\s+no/.test(res.stdout)],
      ["does not emit legacy agent hook snippet", !/\[\[hooks\.agent\]\]/.test(res.stdout)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0 && missing.length === 0 && failedStdout.length === 0 && !existsSync(homeConfig);

    return {
      ok,
      summary: `Codex operational fixture: ${ok ? "ok" : "failed"} (${CODEX_OPERATIONAL_PRESENT.length - missing.length}/${CODEX_OPERATIONAL_PRESENT.length} artifacts)`,
      details: ok
        ? "fresh git fixture received operational builder, floor, thrift, hooks, and configs without patching HOME"
        : compactFailure(res, [...missing, ...failedStdout, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexLite(root) {
  return withFixture("agent-skill-release-codex-lite-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--lite"]);
    const missing = missingFiles(target, CODEX_LITE_PRESENT);
    const unexpected = existingFiles(target, CODEX_LITE_ABSENT);
    const homeConfig = resolve(home, ".codex/config.toml");
    const agents = readIfExists(resolve(target, "AGENTS.md"));
    const stdoutChecks = [
      ["reports lite profile", /profile: lite/i.test(res.stdout)],
      ["omits PreToolUse hook snippet", !/\[\[hooks\.PreToolUse\]\]/.test(res.stdout)],
      ["omits Playwright MCP snippet", !/\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["renders lite guidance", /lite mode/i.test(agents)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failedStdout.length === 0
      && !existsSync(homeConfig);

    return {
      ok,
      summary: `Codex lite fixture: ${ok ? "ok" : "failed"} (${CODEX_LITE_PRESENT.length + CODEX_LITE_ABSENT.length - missing.length - unexpected.length}/${CODEX_LITE_PRESENT.length + CODEX_LITE_ABSENT.length} file checks)`,
      details: ok
        ? "fresh git fixture received only builder-lite files and no global config side effects"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failedStdout, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function withFixture(prefix, callback) {
  const target = mkdtempSync(join(tmpdir(), `${prefix}target-`));
  const home = mkdtempSync(join(tmpdir(), `${prefix}home-`));
  try {
    return callback({ target, home });
  } finally {
    rmSync(target, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

function initGit(target) {
  const res = spawnSync("git", ["init"], {
    cwd: target,
    encoding: "utf-8",
  });
  if (res.status !== 0) {
    throw new Error(`git init failed in fixture: ${res.stderr || res.stdout}`);
  }
}

function runInstallPlatform(root, target, home, extraArgs) {
  return spawnSync("/bin/bash", [
    resolve(root, "scripts/install-platform.sh"),
    "--platform=codex",
    `--target=${target}`,
    ...extraArgs,
  ], {
    encoding: "utf-8",
    env: { ...process.env, HOME: home },
  });
}

function missingFiles(root, files) {
  return files.filter((file) => !existsSync(resolve(root, file)));
}

function existingFiles(root, files) {
  return files.filter((file) => existsSync(resolve(root, file)));
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, "utf-8") : "";
}

function compactFailure(res, issues) {
  return [
    issues.length > 0 ? `issues: ${issues.join(", ")}` : null,
    res.status === 0 ? null : `exit ${res.status}`,
    res.stderr ? `stderr: ${res.stderr.trim().slice(0, 800)}` : null,
    res.stdout ? `stdout: ${res.stdout.trim().slice(0, 800)}` : null,
  ].filter(Boolean).join("; ");
}

function parseArgs(argv) {
  const args = { json: false };
  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return args;
}

function printHuman(result) {
  console.log(`release fixture smoke: ${result.ok ? "ok" : "failed"}`);
  for (const check of Object.values(result.checks)) {
    console.log(check.summary);
    console.log(`  ${check.ok ? "ok" : "fail"} - ${check.details}`);
  }
}

function printHelp() {
  console.log("Usage: node scripts/release-fixture-smoke.mjs [--json]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }
    const result = runReleaseFixtureSmoke();
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(result);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
