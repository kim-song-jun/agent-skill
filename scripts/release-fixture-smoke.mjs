#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const CLAUDE_RENDER_PRESENT = [
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
  ".visual-qa.json",
  ".agent-all.json",
];

const CLAUDE_LITE_PRESENT = [
  "CLAUDE.md",
  "AGENTS.md",
  ".claude/settings.local.json",
  ".claude/hooks/context-mode-router.mjs",
  ".claude/hooks/session-summary.mjs",
  ".claude/hooks/cache-heal.mjs",
  ".claude/agents/planner.md",
  ".claude/agents/dev.md",
  ".claude/agents/reviewer.md",
];

const CLAUDE_LITE_ABSENT = [
  ".claude/hooks/agent-policy-hook.mjs",
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
  ".visual-qa.json",
  ".agent-all.json",
];

const CODEX_OPERATIONAL_PRESENT = [
  "AGENTS.md",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/dev/SKILL.md",
  ".codex/skills/reviewer/SKILL.md",
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/integration-dev/SKILL.md",
  ".codex/skills/verification-reviewer/SKILL.md",
  ".codex/skills/qa-reviewer/SKILL.md",
  ".codex/skills/design-reviewer/SKILL.md",
  ".codex/skills/security-reviewer/SKILL.md",
  ".codex/skills/data-reviewer/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/agent-all-codex/lib/sequential-dispatch.mjs",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs",
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
    claudeRendered: checkClaudeRendered(root),
    claudeLite: checkClaudeLite(root),
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

function checkClaudeRendered(root) {
  return withFixture("agent-skill-release-claude-render-", ({ target, home }) => {
    initGit(target);
    const ctx = {
      purpose: "Release fixture app",
      deploy_targets: "vercel",
      constraints: "",
      language: "en",
      qa_personas: ["auth", "payments"],
      baseUrl: "http://localhost:3000",
      model: "claude-sonnet-4-6",
      maxIter: 10,
      maxCostUSD: 500,
      waveSize: "large",
      breakCondition: "npm test",
    };
    writeFile(target, "_ctx.json", `${JSON.stringify(ctx, null, 2)}\n`);
    const res = runClaudeInit(root, target, home, ["--ctx", resolve(target, "_ctx.json")]);

    const missing = missingFiles(target, CLAUDE_RENDER_PRESENT);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const visualQa = parseJsonFile(resolve(target, ".visual-qa.json"), ".visual-qa.json");
    const agentAll = parseJsonFile(resolve(target, ".agent-all.json"), ".agent-all.json");
    const hookChecks = [
      ".claude/hooks/context-mode-router.mjs",
      ".claude/hooks/session-summary.mjs",
      ".claude/hooks/cache-heal.mjs",
      ".claude/hooks/agent-policy-hook.mjs",
      "scripts/agent-task-ledger-check.mjs",
    ].map((file) => checkNodeSyntax(resolve(target, file), file));
    const textChecks = [
      ["CLAUDE.md includes operational lite guidance", /\/agent-init --lite/.test(readIfExists(resolve(target, "CLAUDE.md")))],
      ["CLAUDE.md includes role routing", /Role Routing/.test(readIfExists(resolve(target, "CLAUDE.md")))],
      ["CLAUDE.md includes orchestration contract", /Orchestration Contract/.test(readIfExists(resolve(target, "CLAUDE.md")))],
      ["CLAUDE.md includes role gate matrix", /Role Gate Matrix/.test(readIfExists(resolve(target, "CLAUDE.md")))],
      ["CLAUDE.md includes configured QA personas", /Configured QA Personas[\s\S]{0,120}auth[\s\S]{0,120}payments/.test(readIfExists(resolve(target, "CLAUDE.md")))],
      [".claude qa-reviewer includes configured QA personas", /Configured QA Personas[\s\S]{0,120}auth[\s\S]{0,120}payments/.test(readIfExists(resolve(target, ".claude/agents/qa-reviewer.md")))],
      [".claude qa-reviewer includes QA audit tokens", /QA_AUDIT: passed[\s\S]{0,120}QA_AUDIT: failed[\s\S]{0,120}QA_AUDIT: skipped/.test(readIfExists(resolve(target, ".claude/agents/qa-reviewer.md")))],
      ["settings registers policy hook", JSON.stringify(settings.value || {}).includes("agent-policy-hook.mjs")],
      ["visual-qa is comprehensive", visualQa.value?.mode === "comprehensive"],
      ["agent-all language is aligned", agentAll.value?.language === "en"],
    ];
    const failed = [
      ...settings.errors,
      ...visualQa.errors,
      ...agentAll.errors,
      ...hookChecks.filter((check) => !check.ok).map((check) => check.details),
      ...textChecks.filter(([, pass]) => !pass).map(([name]) => name),
    ];
    const ok = res.status === 0 && missing.length === 0 && failed.length === 0;

    return {
      ok,
      summary: `Claude rendered fixture: ${ok ? "ok" : "failed"} (${CLAUDE_RENDER_PRESENT.length - missing.length}/${CLAUDE_RENDER_PRESENT.length} artifacts)`,
      details: ok
        ? "fresh Claude init produced root memory, role agents, hooks, task ledger, post-install doctor, and floor seed configs"
        : compactFailure(res, [...missing, ...failed]),
    };
  });
}

function checkClaudeLite(root) {
  return withFixture("agent-skill-release-claude-lite-", ({ target, home }) => {
    initGit(target);
    const ctx = {
      purpose: "Release fixture lite app",
      deploy_targets: "",
      constraints: "",
      language: "en",
    };
    writeFile(target, "_ctx.json", `${JSON.stringify(ctx, null, 2)}\n`);
    const res = runClaudeInit(root, target, home, ["--lite", "--ctx", resolve(target, "_ctx.json")]);

    const missing = missingFiles(target, CLAUDE_LITE_PRESENT);
    const unexpected = existingFiles(target, CLAUDE_LITE_ABSENT);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const hookChecks = [
      ".claude/hooks/context-mode-router.mjs",
      ".claude/hooks/session-summary.mjs",
      ".claude/hooks/cache-heal.mjs",
    ].map((file) => checkNodeSyntax(resolve(target, file), file));
    const claude = readIfExists(resolve(target, "CLAUDE.md"));
    const agents = readIfExists(resolve(target, "AGENTS.md"));
    const renderedText = `${claude}\n${agents}`;
    const settingsText = JSON.stringify(settings.value || {});
    const textChecks = [
      ["CLAUDE.md includes lite harness guidance", /Lite Harness/.test(claude)],
      ["AGENTS.md includes minimal lite harness guidance", /Lite mode keeps only root guidance and the minimal role roster/.test(agents)],
      ["AGENTS.md omits operational lite skip guidance", !/task[- ]ledger|hard[- ]policy/i.test(agents)],
      ["settings keeps context-mode router", settingsText.includes("context-mode-router.mjs")],
      ["settings omits policy hook", !settingsText.includes("agent-policy-hook.mjs")],
      ["lite docs omit task ledger paths", !/docs\/tasks\//.test(renderedText)],
      ["lite docs omit agent-all runtime config", !/\.agent-all\.json/.test(renderedText)],
    ];
    const failed = [
      ...settings.errors,
      ...hookChecks.filter((check) => !check.ok).map((check) => check.details),
      ...textChecks.filter(([, pass]) => !pass).map(([name]) => name),
    ];
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failed.length === 0;
    const total = CLAUDE_LITE_PRESENT.length + CLAUDE_LITE_ABSENT.length;

    return {
      ok,
      summary: `Claude lite fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh Claude init produced lite root memory, minimal agents, post-install doctor, and non-policy hooks only"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failed]),
    };
  });
}

function checkCodexOperational(root) {
  return withFixture("agent-skill-release-codex-operational-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=all"]);
    const missing = missingFiles(target, CODEX_OPERATIONAL_PRESENT);
    const agentAllRuntime = checkCodexAgentAllSequentialRuntime(target);
    const visualQaRuntime = checkCodexVisualQaSequentialRuntime(target);
    const homeConfig = resolve(home, ".codex/config.toml");
    const agents = readIfExists(resolve(target, "AGENTS.md"));
    const qaReviewer = readIfExists(resolve(target, ".codex/skills/qa-reviewer/SKILL.md"));
    const stdoutChecks = [
      ["prints current PreToolUse hook snippet", /\[\[hooks\.PreToolUse\]\]/.test(res.stdout)],
      ["prints Playwright MCP snippet", /\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["uses codex thrift no-instrument path", /instrument:\s+no/.test(res.stdout)],
      ["does not emit legacy agent hook snippet", !/\[\[hooks\.agent\]\]/.test(res.stdout)],
      ["AGENTS.md includes orchestration contract", /Orchestration Contract/.test(agents)],
      ["AGENTS.md includes role gate matrix", /Role Gate Matrix/.test(agents)],
      ["AGENTS.md includes QA personas", /QA Personas[\s\S]{0,120}general/.test(agents)],
      ["qa-reviewer skill includes configured QA personas", /Configured QA Personas[\s\S]{0,120}general/.test(qaReviewer)],
      ["qa-reviewer skill includes QA audit tokens", /QA_AUDIT: passed[\s\S]{0,120}QA_AUDIT: failed[\s\S]{0,120}QA_AUDIT: skipped/.test(qaReviewer)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && failedStdout.length === 0
      && agentAllRuntime.ok
      && visualQaRuntime.ok
      && !existsSync(homeConfig);

    return {
      ok,
      summary: `Codex operational fixture: ${ok ? "ok" : "failed"} (${CODEX_OPERATIONAL_PRESENT.length - missing.length}/${CODEX_OPERATIONAL_PRESENT.length} artifacts)`,
      details: ok
        ? "fresh git fixture received operational builder, role gate matrix, QA personas, floor, thrift, hooks, configs, and sequential agent-all-codex prompt helper runs from the installed fixture; sequential visual-qa-codex page helper runs from the installed fixture; positional argv omits unsupported --prompt/--skill flags; no HOME patching"
        : compactFailure(res, [...missing, ...failedStdout, agentAllRuntime.ok ? null : agentAllRuntime.details, visualQaRuntime.ok ? null : visualQaRuntime.details, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexAgentAllSequentialRuntime(target) {
  const helperRel = ".codex/skills/agent-all-codex/lib/sequential-dispatch.mjs";
  const helperPath = resolve(target, helperRel);
  if (!existsSync(helperPath)) {
    return { ok: false, details: `missing ${helperRel}` };
  }

  const script = `
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const helperPath = resolve("${helperRel}");
if (!existsSync(helperPath)) {
  throw new Error("missing installed sequential helper");
}

const {
  buildSequentialInvocation,
  buildReviewPrompt,
  buildSequentialShellCommand,
  buildSkillPrompt,
  parseSkillResult,
} = await import(pathToFileURL(helperPath).href);

function requireIncludes(label, body, needle) {
  if (!body.includes(needle)) {
    throw new Error(label + " missing " + needle);
  }
}

function requireOmits(label, body, needle) {
  if (body.includes(needle)) {
    throw new Error(label + " unexpectedly included " + needle);
  }
}

const implementer = buildSkillPrompt({
  task: {
    id: "release-smoke-1",
    title: "Release smoke implementation",
    files: ["src/app.js"],
    forbiddenFiles: ["src/other.js"],
    body: "Implement the release smoke fixture.",
  },
  plan: { path: "docs/tasks/001-release-smoke.md" },
  skillPath: ".codex/skills/dev/SKILL.md",
  workingDirectory: process.cwd(),
});
requireIncludes("implementer prompt", implementer, "## Dispatch Contract");
requireIncludes("implementer prompt", implementer, "\\"changedFiles\\"");
requireOmits("implementer prompt", implementer, "\\"commits\\"");

const reviewer = buildReviewPrompt({
  review: {
    id: "release-smoke-review",
    title: "Review release smoke implementation",
    persona: "verification-reviewer",
    changedFiles: ["src/app.js"],
    diffRange: "HEAD~1..HEAD",
  },
  plan: { path: "docs/tasks/001-release-smoke.md", section: "Task 1" },
  skillPath: ".codex/skills/verification-reviewer/SKILL.md",
  workingDirectory: process.cwd(),
});
requireIncludes("reviewer prompt", reviewer, "verdict, issues by severity, audit token");
requireOmits("reviewer prompt", reviewer, "\\"commits\\"");

const shell = buildSequentialShellCommand({
  task: {
    id: "release-smoke-1",
    title: "Release smoke implementation",
    role: "dev",
    files: ["src/app.js"],
  },
  plan: { path: "docs/tasks/001-release-smoke.md" },
  codexBin: "codex",
  projectRoot: process.cwd(),
});
requireIncludes("sequential command", shell.command, "'codex' 'exec'");
requireIncludes("sequential command", shell.skillPath, ".codex/skills/dev/SKILL.md");
requireOmits("sequential command", shell.command, "--prompt");
requireOmits("sequential command", shell.command, "--skill");

const invocation = buildSequentialInvocation({
  task: {
    id: "release-smoke-1",
    title: "Release smoke implementation",
    role: "dev",
    files: ["src/app.js"],
  },
  plan: { path: "docs/tasks/001-release-smoke.md" },
  codexBin: "codex",
  projectRoot: process.cwd(),
});
if (invocation.argv.length !== 3) {
  throw new Error("sequential invocation argv length mismatch");
}
if (invocation.argv[0] !== "codex" || invocation.argv[1] !== "exec") {
  throw new Error("sequential invocation must use codex exec");
}
if (invocation.argv.includes("--prompt") || invocation.argv.includes("--skill")) {
  throw new Error("sequential invocation used unsupported prompt or skill flags");
}
requireIncludes("sequential invocation prompt", invocation.argv[2], "## Dispatch Contract");
requireIncludes("sequential invocation prompt", invocation.argv[2], "\\"changedFiles\\"");

const parsed = parseSkillResult([
  "log noise",
  JSON.stringify({
    status: "completed",
    changedFiles: ["src/app.js"],
    verification: "node --test passed",
    errors: [],
  }),
].join("\\n"));
if (parsed.status !== "completed") {
  throw new Error("parsed status mismatch");
}
if (parsed.changedFiles[0] !== "src/app.js") {
  throw new Error("parsed changedFiles mismatch");
}
if (parsed.verification !== "node --test passed") {
  throw new Error("parsed verification mismatch");
}
if (parsed.commits.length !== 0) {
  throw new Error("parser should not synthesize commits");
}
`;

  const res = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: target,
    encoding: "utf-8",
  });

  return {
    ok: res.status === 0,
    details: res.status === 0
      ? "sequential agent-all-codex prompt helper runs from the installed fixture"
      : compactFailure(res, [`${helperRel} runtime probe failed`]),
  };
}

function checkCodexVisualQaSequentialRuntime(target) {
  const helperRel = ".codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs";
  const helperPath = resolve(target, helperRel);
  if (!existsSync(helperPath)) {
    return { ok: false, details: `missing ${helperRel}` };
  }

  const script = `
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const helperPath = resolve("${helperRel}");
if (!existsSync(helperPath)) {
  throw new Error("missing installed visual-qa sequential helper");
}

const {
  buildPagePrompt,
  buildSequentialPageInvocation,
  buildSequentialPageShellCommand,
  parsePageResult,
  resolvePageSkillPath,
} = await import(pathToFileURL(helperPath).href);

function requireIncludes(label, body, needle) {
  if (!body.includes(needle)) {
    throw new Error(label + " missing " + needle);
  }
}

function requireOmits(label, body, needle) {
  if (body.includes(needle)) {
    throw new Error(label + " unexpectedly included " + needle);
  }
}

const page = {
  name: "home",
  path: "/",
  breakpoints: [{ name: "desktop", width: 1440, height: 900 }],
};
const prompt = buildPagePrompt({
  page,
  slugDir: "docs/visual-qa/release-smoke",
  baseUrl: "http://localhost:3000",
  skillPath: ".codex/skills/visual-qa-page/SKILL.md",
});
requireIncludes("page prompt", prompt, "PAGE_NAME: home");
requireIncludes("page prompt", prompt, "BASE_URL:  http://localhost:3000");
requireIncludes("page prompt", prompt, "OUTPUT_DIR: docs/visual-qa/release-smoke/home/");
requireIncludes("page prompt", prompt, "End with a JSON line summarizing the page");

const shell = buildSequentialPageShellCommand({
  page,
  slugDir: "docs/visual-qa/release-smoke",
  baseUrl: "http://localhost:3000",
  codexBin: "codex",
  projectRoot: process.cwd(),
});
requireIncludes("visual-qa command", shell.command, "'codex' 'exec'");
requireIncludes("visual-qa skill path", shell.skillPath, ".codex/skills/visual-qa-page/SKILL.md");
requireOmits("visual-qa command", shell.command, "--prompt");
requireOmits("visual-qa command", shell.command, "--skill");

const invocation = buildSequentialPageInvocation({
  page,
  slugDir: "docs/visual-qa/release-smoke",
  baseUrl: "http://localhost:3000",
  codexBin: "codex",
  projectRoot: process.cwd(),
});
if (invocation.argv.length !== 3) {
  throw new Error("visual-qa invocation argv length mismatch");
}
if (invocation.argv[0] !== "codex" || invocation.argv[1] !== "exec") {
  throw new Error("visual-qa invocation must use codex exec");
}
if (invocation.argv.includes("--prompt") || invocation.argv.includes("--skill")) {
  throw new Error("visual-qa invocation used unsupported prompt or skill flags");
}
requireIncludes("visual-qa invocation prompt", invocation.argv[2], "PAGE_NAME: home");
requireIncludes("visual-qa invocation prompt", invocation.argv[2], "OUTPUT_DIR: docs/visual-qa/release-smoke/home/");

const resolvedSkill = resolvePageSkillPath(process.cwd());
requireIncludes("resolved page skill", resolvedSkill, ".codex/skills/visual-qa-page/SKILL.md");

const parsed = parsePageResult([
  "page capture log",
  JSON.stringify({
    page: "home",
    status: "completed",
    captures: ["docs/visual-qa/release-smoke/home/desktop.png"],
    analyses: ["docs/visual-qa/release-smoke/home/desktop.analysis.json"],
    errors: [],
  }),
].join("\\n"));
if (parsed.page !== "home") {
  throw new Error("parsed page mismatch");
}
if (parsed.status !== "completed") {
  throw new Error("parsed status mismatch");
}
if (parsed.captures[0] !== "docs/visual-qa/release-smoke/home/desktop.png") {
  throw new Error("parsed captures mismatch");
}
if (parsed.analyses[0] !== "docs/visual-qa/release-smoke/home/desktop.analysis.json") {
  throw new Error("parsed analyses mismatch");
}
if (parsed.errors.length !== 0) {
  throw new Error("parsed errors mismatch");
}
`;

  const res = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: target,
    encoding: "utf-8",
  });

  return {
    ok: res.status === 0,
    details: res.status === 0
      ? "sequential visual-qa-codex page helper runs from the installed fixture"
      : compactFailure(res, [`${helperRel} runtime probe failed`]),
  };
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

function runClaudeInit(root, target, home, extraArgs) {
  return spawnSync(process.execPath, [
    resolve(root, "plugins/harness-builder/bin/init.mjs"),
    target,
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

function writeFile(target, destRel, body) {
  const dest = resolve(target, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
}

function parseJsonFile(file, label) {
  try {
    return { value: JSON.parse(readIfExists(file)), errors: [] };
  } catch (error) {
    return { value: null, errors: [`${label} invalid JSON: ${error.message}`] };
  }
}

function checkNodeSyntax(file, label) {
  const res = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf-8",
  });
  return {
    ok: res.status === 0,
    details: res.status === 0 ? `${label}: syntax ok` : `${label}: ${res.stderr || res.stdout}`,
  };
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
