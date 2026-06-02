#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyChangedFiles as classifyClaudeChangedFiles } from "../plugins/harness-floor/skills/agent-all/lib/changed-file-classifier.mjs";
import { buildGatePlan as buildClaudeGatePlan } from "../plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs";
import { classifyChangedFiles as classifyCodexChangedFiles } from "../plugins/harness-floor-codex/skills/agent-all-codex/lib/changed-file-classifier.mjs";
import { buildGatePlan as buildCodexGatePlan } from "../plugins/harness-floor-codex/skills/agent-all-codex/lib/gate-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSCO_MDS_DJANGO_VUE = JSON.parse(
  readFileSync(resolve(ROOT, "tests/fixtures/project-shapes/posco-mds-django-vue.json"), "utf-8"),
);

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
];

const CLAUDE_EXECUTABLE_GENERATED = [
  ".claude/hooks/context-mode-router.mjs",
  ".claude/hooks/session-summary.mjs",
  ".claude/hooks/cache-heal.mjs",
  ".claude/hooks/agent-policy-hook.mjs",
  "scripts/agent-task-ledger-check.mjs",
];

const CLAUDE_BUILDER_PRESENT = [
  ...CLAUDE_RENDER_PRESENT.filter((file) => ![".visual-qa.json", ".agent-all.json"].includes(file)),
];

const CLAUDE_BUILDER_ABSENT = [
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
  ".codex/skills/debug-codex/SKILL.md",
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

const CLAUDE_LITE_EXECUTABLE_GENERATED = [
  ".claude/hooks/context-mode-router.mjs",
  ".claude/hooks/session-summary.mjs",
  ".claude/hooks/cache-heal.mjs",
];

const CLAUDE_LITE_ABSENT = [
  ".claude/hooks/agent-policy-hook.mjs",
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
];

const CODEX_OPERATIONAL_PRESENT = [
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
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/agent-all-codex/lib/sequential-dispatch.mjs",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs",
  ".codex/skills/visual-qa-page/SKILL.md",
  ".codex/skills/debug-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  ".codex/hooks/thrift-pretool-bash-telemetry.toml",
  "docs/tasks/index.md",
  "docs/debug/index.md",
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
];

const CODEX_EXECUTABLE_GENERATED = [
  ".codex/hooks/agent-policy-hook.mjs",
  "scripts/agent-task-ledger-check.mjs",
];

const CODEX_LITE_PRESENT = [
  "AGENTS.md",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/dev/SKILL.md",
  ".codex/skills/reviewer/SKILL.md",
];

const CODEX_LITE_ABSENT = [
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/frontend-dev/SKILL.md",
  ".codex/skills/backend-dev/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  "docs/tasks/index.md",
  "scripts/agent-task-ledger-check.mjs",
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
];

const CODEX_BUILDER_PRESENT = [
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
  "docs/tasks/index.md",
  "docs/tasks/_template.md",
  "docs/tasks/_handoff-template.md",
  "scripts/agent-task-ledger-check.mjs",
];

const CODEX_BUILDER_ABSENT = [
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/visual-qa-page/SKILL.md",
  ".codex/skills/debug-codex/SKILL.md",
  ".codex/hooks/thrift-pretool-bash-telemetry.toml",
  ".debug-artifacts",
  "docs/debug/index.md",
];

const CODEX_FLOOR_PRESENT = [
  ".visual-qa.json",
  ".agent-all.json",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/agent-all-codex/lib/sequential-dispatch.mjs",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs",
  ".codex/skills/visual-qa-page/SKILL.md",
];

const CODEX_FLOOR_ABSENT = [
  "AGENTS.md",
  ".thrift.json",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/frontend-dev/SKILL.md",
  ".codex/skills/backend-dev/SKILL.md",
  ".codex/skills/debug-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  ".codex/hooks/thrift-pretool-bash-telemetry.toml",
  ".debug-artifacts",
  "docs/tasks/index.md",
  "docs/debug/index.md",
];

const CODEX_THRIFT_PRESENT = [
  ".thrift.json",
  ".codex/hooks/thrift-pretool-bash-telemetry.toml",
  ".codex/hooks/thrift-pretool-read-coerce.toml",
  ".codex/hooks/thrift-posttool-summariser-trigger.toml",
  ".codex/hooks/thrift-sessionend-audit.toml",
  ".codex/hooks/thrift-sessionstart-cache-prime.toml",
];

const CODEX_THRIFT_ABSENT = [
  "AGENTS.md",
  ".visual-qa.json",
  ".agent-all.json",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/frontend-dev/SKILL.md",
  ".codex/skills/backend-dev/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/debug-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  ".debug-artifacts",
  "docs/tasks/index.md",
  "docs/debug/index.md",
];

const CODEX_DEBUG_PRESENT = [
  ".codex/skills/debug-codex/SKILL.md",
  ".codex/skills/debug-codex/lib/debug-artifacts.mjs",
  ".codex/skills/debug-codex/lib/error-parser.mjs",
  ".codex/skills/debug-codex/lib/state-checkpoint.mjs",
  ".codex/skills/debug-codex/phases/1-reproduce.md",
  ".debug-artifacts",
  "docs/debug/index.md",
];

const CODEX_DEBUG_ABSENT = [
  "AGENTS.md",
  ".codex/skills/planner/SKILL.md",
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/frontend-dev/SKILL.md",
  ".codex/skills/backend-dev/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  "docs/tasks/index.md",
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
];

const CLAUDE_UNINSTALL_REMOVED = [
  ".claude/agents/dev.md",
  ".claude/agents/orchestrator.md",
  ".claude/agents/frontend-dev.md",
  ".claude/agents/backend-dev.md",
  ".claude/hooks/context-mode-router.mjs",
  ".claude/hooks/session-summary.mjs",
  ".claude/hooks/cache-heal.mjs",
  ".claude/hooks/agent-policy-hook.mjs",
  "docs/tasks/_template.md",
  "docs/tasks/_handoff-template.md",
  "scripts/agent-task-ledger-check.mjs",
  ".visual-qa.json",
  ".agent-all.json",
];

const CLAUDE_FORCE_ROOT_REMOVED = [
  ...CLAUDE_UNINSTALL_REMOVED,
  "CLAUDE.md",
  "AGENTS.md",
];

const CODEX_UNINSTALL_REMOVED = [
  ".codex/skills/dev/SKILL.md",
  ".codex/skills/orchestrator/SKILL.md",
  ".codex/skills/frontend-dev/SKILL.md",
  ".codex/skills/backend-dev/SKILL.md",
  ".codex/skills/agent-all-codex/SKILL.md",
  ".codex/skills/visual-qa-codex/SKILL.md",
  ".codex/skills/debug-codex/SKILL.md",
  ".codex/hooks/agent-policy-hook.mjs",
  ".codex/hooks/thrift-pretool-bash-telemetry.toml",
  "docs/tasks/_template.md",
  "docs/tasks/_handoff-template.md",
  "scripts/agent-task-ledger-check.mjs",
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
];

const CODEX_FORCE_ROOT_REMOVED = [
  ...CODEX_UNINSTALL_REMOVED,
  "AGENTS.md",
];

const OPERATIONAL_ROLE_SUPERPOWERS = {
  planner: ["brainstorming", "writing-plans", "dispatching-parallel-agents"],
  dev: ["test-driven-development", "verification-before-completion"],
  "frontend-dev": ["brainstorming", "test-driven-development", "verification-before-completion"],
  "backend-dev": ["test-driven-development", "verification-before-completion"],
  "integration-dev": ["test-driven-development", "verification-before-completion"],
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
};

export function runReleaseFixtureSmoke({ root = ROOT } = {}) {
  const checks = {
    claudeMarketplace: checkClaudeMarketplace(root),
    claudeRendered: checkClaudeRendered(root),
    claudeLite: checkClaudeLite(root),
    claudePlatform: checkClaudePlatformInstall(root),
    claudePlatformBuilder: checkClaudePlatformBuilderInstall(root),
    claudePlatformLite: checkClaudePlatformLiteInstall(root),
    claudeFoundationAutoUpdate: checkClaudeFoundationAutoUpdate(root),
    claudeUninstall: checkClaudePlatformUninstall(root),
    claudeForceRootClean: checkClaudePlatformForceRootClean(root),
    codexOperational: checkCodexOperational(root),
    codexFoundationAutoUpdate: checkCodexFoundationAutoUpdate(root),
    codexLite: checkCodexLite(root),
    codexBuilder: checkCodexBuilder(root),
    codexFloor: checkCodexFloor(root),
    codexThrift: checkCodexThrift(root),
    codexDebug: checkCodexDebug(root),
    codexUninstall: checkCodexPlatformUninstall(root),
    codexForceRootClean: checkCodexPlatformForceRootClean(root),
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
    const claude = readIfExists(resolve(target, "CLAUDE.md"));
    const orchestrator = readIfExists(resolve(target, ".claude/agents/orchestrator.md"));
    const frontendDev = readIfExists(resolve(target, ".claude/agents/frontend-dev.md"));
    const backendDev = readIfExists(resolve(target, ".claude/agents/backend-dev.md"));
    const qaReviewer = readIfExists(resolve(target, ".claude/agents/qa-reviewer.md"));
    const verificationAuditReviewers = {
      "reviewer": readIfExists(resolve(target, ".claude/agents/reviewer.md")),
      "verification-reviewer": readIfExists(resolve(target, ".claude/agents/verification-reviewer.md")),
      "integration-dev": readIfExists(resolve(target, ".claude/agents/integration-dev.md")),
      "design-reviewer": readIfExists(resolve(target, ".claude/agents/design-reviewer.md")),
      "security-reviewer": readIfExists(resolve(target, ".claude/agents/security-reviewer.md")),
      "data-reviewer": readIfExists(resolve(target, ".claude/agents/data-reviewer.md")),
    };
    const policyHook = readIfExists(resolve(target, ".claude/hooks/agent-policy-hook.mjs"));
    const settingsText = JSON.stringify(settings.value || {});
    const hookChecks = [
      ".claude/hooks/context-mode-router.mjs",
      ".claude/hooks/session-summary.mjs",
      ".claude/hooks/cache-heal.mjs",
      ".claude/hooks/agent-policy-hook.mjs",
      "scripts/agent-task-ledger-check.mjs",
    ].map((file) => checkNodeSyntax(resolve(target, file), file));
    const textChecks = [
      ["CLAUDE.md includes operational lite guidance", /\/agent-init --lite/.test(claude)],
      ["CLAUDE.md includes role routing", /Role Routing/.test(claude)],
      ["CLAUDE.md includes orchestration contract", /Orchestration Contract/.test(claude)],
      ["CLAUDE.md includes role gate matrix", /Role Gate Matrix/.test(claude)],
      ...implementationRoutingChecks("CLAUDE.md", claude),
      ...implementationRoutingChecks(".claude orchestrator", orchestrator),
      [".claude frontend-dev embeds frontend discipline", /frontend layer[\s\S]{0,120}UI components[\s\S]{0,80}client-side logic[\s\S]{0,80}styles/.test(frontendDev)],
      [".claude frontend-dev references role-matched superpowers", /superpowers:brainstorming[\s\S]{0,120}superpowers:test-driven-development[\s\S]{0,120}superpowers:verification-before-completion/.test(frontendDev)],
      [".claude backend-dev embeds backend discipline", /backend layer[\s\S]{0,120}APIs[\s\S]{0,80}business logic[\s\S]{0,80}migrations/.test(backendDev)],
      [".claude backend-dev references role-matched superpowers", /superpowers:test-driven-development[\s\S]{0,120}superpowers:verification-before-completion/.test(backendDev)],
      ["CLAUDE.md includes configured QA personas", /Configured QA Personas[\s\S]{0,120}auth[\s\S]{0,120}payments/.test(claude)],
      [".claude qa-reviewer includes configured QA personas", /Configured QA Personas[\s\S]{0,120}auth[\s\S]{0,120}payments/.test(qaReviewer)],
      ...claudeQaAuditTokenChecks(qaReviewer),
      ...claudeVerificationAuditTokenChecks(verificationAuditReviewers),
      ["settings registers policy hook", settingsText.includes("agent-policy-hook.mjs")],
      ["settings registers Task PreToolUse policy hook", /"matcher":"Task"[\s\S]{0,180}agent-policy-hook\.mjs\\?" PreToolUse/.test(settingsText)],
      ["settings registers Task PostToolUse policy hook", /"PostToolUse"[\s\S]{0,220}"matcher":"Task"[\s\S]{0,180}agent-policy-hook\.mjs\\?" PostToolUse/.test(settingsText)],
      ["policy hook includes orchestration audit token", /ORCHESTRATION_AUDIT/.test(policyHook)],
      ["policy hook includes QA audit token", /QA_AUDIT/.test(policyHook)],
      ["policy hook includes verification audit token", /VERIFICATION_AUDIT/.test(policyHook)],
      ["visual-qa is comprehensive", visualQa.value?.mode === "comprehensive"],
      ["agent-all language is aligned", agentAll.value?.language === "en"],
    ];
    const failed = [
      ...settings.errors,
      ...visualQa.errors,
      ...agentAll.errors,
      ...executableScriptErrors(target, CLAUDE_EXECUTABLE_GENERATED),
      ...hookChecks.filter((check) => !check.ok).map((check) => check.details),
      ...textChecks.filter(([, pass]) => !pass).map(([name]) => name),
    ];
    const ok = res.status === 0 && missing.length === 0 && failed.length === 0;

    return {
      ok,
      summary: `Claude rendered fixture: ${ok ? "ok" : "failed"} (${CLAUDE_RENDER_PRESENT.length - missing.length}/${CLAUDE_RENDER_PRESENT.length} artifacts)`,
      details: ok
        ? "fresh Claude init produced root memory, role agents, QA and base/specialized reviewer audit tokens, executable hooks, executable task ledger checker, post-install doctor, and floor seed configs"
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
      ...executableScriptErrors(target, CLAUDE_LITE_EXECUTABLE_GENERATED),
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
        ? "fresh Claude init produced lite root memory, minimal agents, post-install doctor, and executable non-policy hooks only"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failed]),
    };
  });
}

function checkClaudePlatformInstall(root) {
  return withFixture("agent-skill-release-claude-platform-", ({ target, home }) => {
    initGit(target);
    const ctx = {
      purpose: "Release platform wrapper app",
      deploy_targets: "vercel",
      constraints: "",
      language: "en",
      qa_personas: ["auth"],
      baseUrl: "http://localhost:3000",
      model: "claude-sonnet-4-6",
      maxIter: 10,
      maxCostUSD: 500,
      waveSize: "large",
      breakCondition: "npm test",
    };
    writeFile(target, "_ctx.json", `${JSON.stringify(ctx, null, 2)}\n`);
    const res = runInstallPlatform(root, target, home, ["--ctx", resolve(target, "_ctx.json")], "claude");

    const missing = missingFiles(target, CLAUDE_RENDER_PRESENT);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const agentAll = parseJsonFile(resolve(target, ".agent-all.json"), ".agent-all.json");
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const claude = readIfExists(resolve(target, "CLAUDE.md"));
    const orchestrator = readIfExists(resolve(target, ".claude/agents/orchestrator.md"));
    const frontendDev = readIfExists(resolve(target, ".claude/agents/frontend-dev.md"));
    const backendDev = readIfExists(resolve(target, ".claude/agents/backend-dev.md"));
    const qaReviewer = readIfExists(resolve(target, ".claude/agents/qa-reviewer.md"));
    const roleBodies = readClaudeOperationalRoleBodies(target);
    const verificationAuditReviewers = {
      "reviewer": readIfExists(resolve(target, ".claude/agents/reviewer.md")),
      "verification-reviewer": readIfExists(resolve(target, ".claude/agents/verification-reviewer.md")),
      "integration-dev": readIfExists(resolve(target, ".claude/agents/integration-dev.md")),
      "design-reviewer": readIfExists(resolve(target, ".claude/agents/design-reviewer.md")),
      "security-reviewer": readIfExists(resolve(target, ".claude/agents/security-reviewer.md")),
      "data-reviewer": readIfExists(resolve(target, ".claude/agents/data-reviewer.md")),
    };
    const settingsText = JSON.stringify(settings.value || {});
    const stdoutChecks = [
      ["reports Claude platform install", /Installing for claude/i.test(res.stdout)],
      ["runs operational-profile doctor", /profile:\s+operational/i.test(res.stdout)],
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["CLAUDE.md includes role gate matrix", /Role Gate Matrix/.test(claude)],
      ...rootFoundationActivationChecks("CLAUDE.md", claude),
      ...implementationRoutingChecks("CLAUDE.md", claude),
      ...implementationRoutingChecks(".claude platform orchestrator", orchestrator),
      ...personaFoundationMatrixChecks("Claude", "agent", roleBodies, /CLAUDE\.md[\s\S]{0,160}docs\/tasks/),
      ...poscoMdsDjangoVueRoutingChecks("Claude", classifyClaudeChangedFiles, buildClaudeGatePlan),
      [".claude platform frontend-dev embeds frontend discipline", /frontend layer[\s\S]{0,120}UI components[\s\S]{0,80}client-side logic[\s\S]{0,80}styles/.test(frontendDev)],
      [".claude platform backend-dev embeds backend discipline", /backend layer[\s\S]{0,120}APIs[\s\S]{0,80}business logic[\s\S]{0,80}migrations/.test(backendDev)],
      ["CLAUDE.md includes configured QA persona", /Configured QA Personas[\s\S]{0,120}auth/.test(claude)],
      ...claudeQaAuditTokenChecks(qaReviewer),
      ...claudeVerificationAuditTokenChecks(verificationAuditReviewers),
      ["settings registers policy hook", settingsText.includes("agent-policy-hook.mjs")],
      ["agent-all language is aligned", agentAll.value?.language === "en"],
    ];
    const failed = [
      ...settings.errors,
      ...agentAll.errors,
      ...executableScriptErrors(target, CLAUDE_EXECUTABLE_GENERATED),
      ...stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name),
      existsSync(homeSettings) ? "unexpected ~/.claude/settings.local.json" : null,
    ].filter(Boolean);
    const ok = res.status === 0 && missing.length === 0 && failed.length === 0;

    return {
      ok,
      summary: `Claude platform fixture: ${ok ? "ok" : "failed"} (${CLAUDE_RENDER_PRESENT.length - missing.length}/${CLAUDE_RENDER_PRESENT.length} artifacts)`,
      details: ok
        ? "fresh terminal install-platform Claude fixture produced operational scaffold, executable generated hooks and task checker, QA and base/specialized reviewer audit tokens, post-install Claude platform doctor coverage, role gate matrix, root foundation activation, complete persona foundation/orchestration matrix, POSCO MDS Django/Vue routing proof, QA persona propagation, and no HOME patching"
        : compactFailure(res, [...missing, ...failed]),
    };
  });
}

function checkClaudePlatformBuilderInstall(root) {
  return withFixture("agent-skill-release-claude-platform-builder-", ({ target, home }) => {
    initGit(target);
    const ctx = {
      purpose: "Release Claude builder wrapper app",
      deploy_targets: "vercel",
      constraints: "",
      language: "en",
      qa_personas: ["auth"],
      baseUrl: "http://localhost:3000",
      model: "claude-sonnet-4-6",
      maxIter: 10,
      maxCostUSD: 500,
      waveSize: "large",
      breakCondition: "npm test",
    };
    writeFile(target, "_ctx.json", `${JSON.stringify(ctx, null, 2)}\n`);
    const res = runInstallPlatform(root, target, home, ["--theme=builder", "--ctx", resolve(target, "_ctx.json")], "claude");

    const missing = missingFiles(target, CLAUDE_BUILDER_PRESENT);
    const unexpected = existingFiles(target, CLAUDE_BUILDER_ABSENT);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const claude = readIfExists(resolve(target, "CLAUDE.md"));
    const orchestrator = readIfExists(resolve(target, ".claude/agents/orchestrator.md"));
    const frontendDev = readIfExists(resolve(target, ".claude/agents/frontend-dev.md"));
    const backendDev = readIfExists(resolve(target, ".claude/agents/backend-dev.md"));
    const qaReviewer = readIfExists(resolve(target, ".claude/agents/qa-reviewer.md"));
    const roleBodies = readClaudeOperationalRoleBodies(target);
    const verificationAuditReviewers = {
      "reviewer": readIfExists(resolve(target, ".claude/agents/reviewer.md")),
      "verification-reviewer": readIfExists(resolve(target, ".claude/agents/verification-reviewer.md")),
      "integration-dev": readIfExists(resolve(target, ".claude/agents/integration-dev.md")),
      "design-reviewer": readIfExists(resolve(target, ".claude/agents/design-reviewer.md")),
      "security-reviewer": readIfExists(resolve(target, ".claude/agents/security-reviewer.md")),
      "data-reviewer": readIfExists(resolve(target, ".claude/agents/data-reviewer.md")),
    };
    const settingsText = JSON.stringify(settings.value || {});
    const stdoutChecks = [
      ["reports Claude platform builder install", /Installing for claude[\s\S]{0,180}theme:\s+builder/i.test(res.stdout)],
      ["runs builder-profile doctor", /profile:\s+builder/i.test(res.stdout)],
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["CLAUDE.md includes role gate matrix", /Role Gate Matrix/.test(claude)],
      ["CLAUDE.md documents builder-only floor config skip", /Builder theme does not seed downstream `\/agent-all` config/.test(claude)],
      ["CLAUDE.md does not claim .agent-all language alignment", !/Downstream `\/agent-all` config keeps/.test(claude)],
      ...rootFoundationActivationChecks("CLAUDE.md", claude),
      ...implementationRoutingChecks("CLAUDE.md", claude),
      ...implementationRoutingChecks(".claude platform builder orchestrator", orchestrator),
      ...personaFoundationMatrixChecks("Claude", "agent", roleBodies, /CLAUDE\.md[\s\S]{0,160}docs\/tasks/),
      [".claude platform builder frontend-dev embeds frontend discipline", /frontend layer[\s\S]{0,120}UI components[\s\S]{0,80}client-side logic[\s\S]{0,80}styles/.test(frontendDev)],
      [".claude platform builder backend-dev embeds backend discipline", /backend layer[\s\S]{0,120}APIs[\s\S]{0,80}business logic[\s\S]{0,80}migrations/.test(backendDev)],
      ["CLAUDE.md includes configured QA persona", /Configured QA Personas[\s\S]{0,120}auth/.test(claude)],
      ...claudeQaAuditTokenChecks(qaReviewer),
      ...claudeVerificationAuditTokenChecks(verificationAuditReviewers),
      ["settings registers policy hook", settingsText.includes("agent-policy-hook.mjs")],
    ];
    const failed = [
      ...settings.errors,
      ...executableScriptErrors(target, CLAUDE_EXECUTABLE_GENERATED),
      ...stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name),
      existsSync(homeSettings) ? "unexpected ~/.claude/settings.local.json" : null,
    ].filter(Boolean);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failed.length === 0;
    const total = CLAUDE_BUILDER_PRESENT.length + CLAUDE_BUILDER_ABSENT.length;

    return {
      ok,
      summary: `Claude platform builder fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh terminal install-platform Claude builder fixture produced only builder-heavy artifacts, executable generated hooks and task checker, QA and base/specialized reviewer audit tokens, post-install Claude builder doctor coverage, role gate matrix, root foundation activation, complete persona foundation/orchestration matrix, QA persona propagation, no floor configs, and no HOME patching"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failed]),
    };
  });
}

function checkClaudePlatformLiteInstall(root) {
  return withFixture("agent-skill-release-claude-platform-lite-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--lite"], "claude");

    const missing = missingFiles(target, CLAUDE_LITE_PRESENT);
    const unexpected = existingFiles(target, CLAUDE_LITE_ABSENT);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const claude = readIfExists(resolve(target, "CLAUDE.md"));
    const agents = readIfExists(resolve(target, "AGENTS.md"));
    const settingsText = JSON.stringify(settings.value || {});
    const stdoutChecks = [
      ["reports Claude platform lite install", /Installing for claude[\s\S]{0,160}profile:\s+lite/i.test(res.stdout)],
      ["runs lite-profile doctor", /profile:\s+lite/i.test(res.stdout)],
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["CLAUDE.md includes lite harness guidance", /Lite Harness/.test(claude)],
      ["AGENTS.md includes minimal lite harness guidance", /Lite mode keeps only root guidance and the minimal role roster/.test(agents)],
      ["settings keeps context-mode router", settingsText.includes("context-mode-router.mjs")],
      ["settings omits policy hook", !settingsText.includes("agent-policy-hook.mjs")],
    ];
    const failed = [
      ...settings.errors,
      ...executableScriptErrors(target, CLAUDE_LITE_EXECUTABLE_GENERATED),
      ...stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name),
      existsSync(homeSettings) ? "unexpected ~/.claude/settings.local.json" : null,
    ].filter(Boolean);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failed.length === 0;
    const total = CLAUDE_LITE_PRESENT.length + CLAUDE_LITE_ABSENT.length;

    return {
      ok,
      summary: `Claude platform lite fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh terminal install-platform Claude lite fixture produced only lite scaffold files, executable non-policy hooks, post-install Claude platform lite doctor coverage, and no HOME patching"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failed]),
    };
  });
}

function checkClaudeFoundationAutoUpdate(root) {
  return withFixture("agent-skill-release-claude-foundation-auto-", ({ target, home }) => {
    initGit(target);
    const { binDir, logPath } = writeStubClaude(home, [
      "context-mode@context-mode",
      "harness-builder@agent-skill",
    ]);
    const res = runInstallPlatformWithFoundationAuto(root, target, home, ["--theme=builder", "--no-doctor"], "claude", binDir);
    const log = readIfExists(logPath);
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const homeCodexConfig = resolve(home, ".codex/config.toml");
    const checks = [
      ["reports approved foundation auto-update", /approved foundation auto-update/.test(res.stdout)],
      ["writes Claude project scaffold after foundation update", existsSync(resolve(target, "CLAUDE.md"))],
      ["refreshes official superpowers marketplace", /plugin marketplace update claude-plugins-official/.test(log)],
      ["refreshes context-mode marketplace", /plugin marketplace update context-mode/.test(log)],
      ["installs superpowers foundation", /plugin install superpowers@claude-plugins-official/.test(log)],
      ["updates installed context-mode foundation", /plugin uninstall context-mode@context-mode/.test(log) && /plugin install context-mode@context-mode/.test(log)],
      ["does not mutate agent-skill plugins during foundation auto-update", !/harness-builder@agent-skill/.test(log)],
      ["does not patch HOME Claude settings", !existsSync(homeSettings)],
      ["does not patch HOME Codex config", !existsSync(homeCodexConfig)],
    ];
    const failed = checks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0 && failed.length === 0;

    return {
      ok,
      summary: `Claude foundation auto-update fixture: ${ok ? "ok" : "failed"} (${checks.length - failed.length}/${checks.length} checks)`,
      details: ok
        ? "fresh Claude platform install auto-updated approved superpowers/context-mode foundations only before scaffolding and did not patch HOME CLI config"
        : compactFailure(res, failed),
    };
  });
}

function checkClaudePlatformUninstall(root) {
  return withFixture("agent-skill-release-claude-uninstall-", ({ target, home }) => {
    initGit(target);
    const install = runInstallPlatform(root, target, home, ["--no-doctor"], "claude");
    const installProducedScaffold = install.status === 0 && existsSync(resolve(target, ".claude/agents/dev.md"));
    const dryRun = runInstallPlatform(root, target, home, ["--uninstall", "--dry-run"], "claude");
    const dryRunMutated = CLAUDE_UNINSTALL_REMOVED.some((file) => !existsSync(resolve(target, file)));
    const uninstall = runInstallPlatform(root, target, home, ["--uninstall"], "claude");

    const stillPresent = existingFiles(target, CLAUDE_UNINSTALL_REMOVED);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const settingsText = JSON.stringify(settings.value || {});
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const stdoutChecks = [
      ["install produced Claude scaffold", installProducedScaffold],
      ["dry-run reports cleaner without mutation", dryRun.status === 0 && /harness clean: dry-run/i.test(dryRun.stdout) && !dryRunMutated],
      ["uninstall reports cleaner success", uninstall.status === 0 && /harness clean: ok/i.test(uninstall.stdout)],
      ["root CLAUDE.md is preserved for manual review", existsSync(resolve(target, "CLAUDE.md"))],
      ["root AGENTS.md is preserved for manual review", existsSync(resolve(target, "AGENTS.md"))],
      ["settings omits generated hook registrations", !settingsText.includes(".claude/hooks/")],
      ["does not patch HOME settings", !existsSync(homeSettings)],
    ];
    const failed = [
      ...settings.errors,
      ...stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name),
    ];
    const ok = install.status === 0
      && dryRun.status === 0
      && uninstall.status === 0
      && stillPresent.length === 0
      && failed.length === 0;

    return {
      ok,
      summary: `Claude uninstall fixture: ${ok ? "ok" : "failed"} (${CLAUDE_UNINSTALL_REMOVED.length - stillPresent.length}/${CLAUDE_UNINSTALL_REMOVED.length} removals)`,
      details: ok
        ? "fresh terminal Claude install-platform uninstall roundtrip removed generated agents, hooks, task ledger, and floor configs while preserving root guidance and avoiding HOME patching"
        : compactFailure(uninstall, [...stillPresent.map((file) => `still present ${file}`), ...failed]),
    };
  });
}

function checkClaudePlatformForceRootClean(root) {
  return withFixture("agent-skill-release-claude-force-root-clean-", ({ target, home }) => {
    initGit(target);
    const install = runInstallPlatform(root, target, home, ["--no-doctor"], "claude");
    const installProducedRootGuidance = install.status === 0
      && existsSync(resolve(target, "CLAUDE.md"))
      && existsSync(resolve(target, "AGENTS.md"));
    const dryRun = runInstallPlatform(root, target, home, ["--uninstall", "--dry-run", "--force-root-clean"], "claude");
    const dryRunMutated = CLAUDE_FORCE_ROOT_REMOVED.some((file) => !existsSync(resolve(target, file)));
    const uninstall = runInstallPlatform(root, target, home, ["--uninstall", "--force-root-clean"], "claude");

    const stillPresent = existingFiles(target, CLAUDE_FORCE_ROOT_REMOVED);
    const settings = parseJsonFile(resolve(target, ".claude/settings.local.json"), "settings.local.json");
    const settingsText = JSON.stringify(settings.value || {});
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const stdoutChecks = [
      ["install produced Claude root guidance", installProducedRootGuidance],
      ["dry-run reports force-root cleaner without mutation", dryRun.status === 0 && /--force-root/.test(dryRun.stdout) && /harness clean: dry-run/i.test(dryRun.stdout) && !dryRunMutated],
      ["force-root uninstall reports cleaner success", uninstall.status === 0 && /harness clean: ok/i.test(uninstall.stdout)],
      ["root CLAUDE.md is removed when force-root-clean is explicit", !existsSync(resolve(target, "CLAUDE.md"))],
      ["root AGENTS.md is removed when force-root-clean is explicit", !existsSync(resolve(target, "AGENTS.md"))],
      ["settings omits generated hook registrations", !settingsText.includes(".claude/hooks/")],
      ["does not patch HOME settings", !existsSync(homeSettings)],
    ];
    const failed = [
      ...settings.errors,
      ...stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name),
    ];
    const ok = install.status === 0
      && dryRun.status === 0
      && uninstall.status === 0
      && stillPresent.length === 0
      && failed.length === 0;

    return {
      ok,
      summary: `Claude force-root uninstall fixture: ${ok ? "ok" : "failed"} (${CLAUDE_FORCE_ROOT_REMOVED.length - stillPresent.length}/${CLAUDE_FORCE_ROOT_REMOVED.length} removals)`,
      details: ok
        ? "fresh terminal Claude install-platform --uninstall --force-root-clean removed generated agents, hooks, task ledger, floor configs, and generated-looking root guidance while avoiding HOME patching"
        : compactFailure(uninstall, [...stillPresent.map((file) => `still present ${file}`), ...failed]),
    };
  });
}

function checkCodexOperational(root) {
  return withFixture("agent-skill-release-codex-operational-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=all"]);
    const missing = missingFiles(target, CODEX_OPERATIONAL_PRESENT);
    const agentAllRuntime = checkCodexAgentAllSequentialRuntime(target, { expectStackRoles: true });
    const visualQaRuntime = checkCodexVisualQaSequentialRuntime(target);
    const homeConfig = resolve(home, ".codex/config.toml");
    const agents = readIfExists(resolve(target, "AGENTS.md"));
    const policyHook = readIfExists(resolve(target, ".codex/hooks/agent-policy-hook.mjs"));
    const orchestrator = readIfExists(resolve(target, ".codex/skills/orchestrator/SKILL.md"));
    const frontendDev = readIfExists(resolve(target, ".codex/skills/frontend-dev/SKILL.md"));
    const backendDev = readIfExists(resolve(target, ".codex/skills/backend-dev/SKILL.md"));
    const qaReviewer = readIfExists(resolve(target, ".codex/skills/qa-reviewer/SKILL.md"));
    const roleBodies = readCodexOperationalRoleBodies(target);
    const verificationAuditReviewers = {
      "reviewer": readIfExists(resolve(target, ".codex/skills/reviewer/SKILL.md")),
      "verification-reviewer": readIfExists(resolve(target, ".codex/skills/verification-reviewer/SKILL.md")),
      "integration-dev": readIfExists(resolve(target, ".codex/skills/integration-dev/SKILL.md")),
      "design-reviewer": readIfExists(resolve(target, ".codex/skills/design-reviewer/SKILL.md")),
      "security-reviewer": readIfExists(resolve(target, ".codex/skills/security-reviewer/SKILL.md")),
      "data-reviewer": readIfExists(resolve(target, ".codex/skills/data-reviewer/SKILL.md")),
    };
    const stdoutChecks = [
      ["runs operational-profile doctor", /profile:\s+operational/i.test(res.stdout)],
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["prints current PreToolUse hook snippet", /\[\[hooks\.PreToolUse\]\]/.test(res.stdout)],
      ["prints Playwright MCP snippet", /\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["uses codex thrift no-instrument path", /instrument:\s+no/.test(res.stdout)],
      ["does not emit legacy agent hook snippet", !/\[\[hooks\.agent\]\]/.test(res.stdout)],
      ["AGENTS.md includes orchestration contract", /Orchestration Contract/.test(agents)],
      ["AGENTS.md includes role gate matrix", /Role Gate Matrix/.test(agents)],
      ...rootFoundationActivationChecks("AGENTS.md", agents),
      ["policy hook includes context-mode/file-backed output guidance", /context-mode[\s\S]{0,180}redirect output to a file/.test(policyHook)],
      ...implementationRoutingChecks("AGENTS.md", agents),
      ...implementationRoutingChecks(".codex orchestrator skill", orchestrator),
      ...personaFoundationMatrixChecks("Codex", "skill", roleBodies, /AGENTS\.md[\s\S]{0,160}docs\/tasks/),
      ...poscoMdsDjangoVueRoutingChecks("Codex", classifyCodexChangedFiles, buildCodexGatePlan),
      [".codex frontend-dev skill embeds frontend responsibilities", /Implement UI components, routes, styles, client state/.test(frontendDev)],
      [".codex frontend-dev skill references role-matched superpowers", /superpowers:brainstorming[\s\S]{0,120}superpowers:test-driven-development[\s\S]{0,120}superpowers:verification-before-completion/.test(frontendDev)],
      [".codex backend-dev skill embeds backend responsibilities", /Implement APIs, services, jobs, migrations, persistence/.test(backendDev)],
      [".codex backend-dev skill references role-matched superpowers", /superpowers:test-driven-development[\s\S]{0,120}superpowers:verification-before-completion/.test(backendDev)],
      ["AGENTS.md includes QA personas", /QA Personas[\s\S]{0,120}general/.test(agents)],
      ["qa-reviewer skill includes configured QA personas", /Configured QA Personas[\s\S]{0,120}general/.test(qaReviewer)],
      ["qa-reviewer skill includes QA audit tokens", /QA_AUDIT: passed[\s\S]{0,120}QA_AUDIT: failed[\s\S]{0,120}QA_AUDIT: skipped/.test(qaReviewer)],
      ...codexVerificationAuditTokenChecks(verificationAuditReviewers),
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && failedStdout.length === 0
      && executableScriptErrors(target, CODEX_EXECUTABLE_GENERATED).length === 0
      && agentAllRuntime.ok
      && visualQaRuntime.ok
      && !existsSync(homeConfig);

    return {
      ok,
      summary: `Codex operational fixture: ${ok ? "ok" : "failed"} (${CODEX_OPERATIONAL_PRESENT.length - missing.length}/${CODEX_OPERATIONAL_PRESENT.length} artifacts)`,
      details: ok
        ? "fresh git fixture received operational builder, role gate matrix, QA personas, root foundation activation, complete persona foundation/orchestration matrix, POSCO MDS Django/Vue routing proof, base/specialized reviewer audit tokens, floor, thrift, debug, executable hooks/task checker, configs, post-install operational doctor coverage, and sequential agent-all-codex prompt helper runs from the installed fixture with stack-specific frontend/backend role dispatch; sequential visual-qa-codex page helper runs from the installed fixture; positional argv omits unsupported --prompt/--skill flags; no HOME patching"
        : compactFailure(res, [...missing, ...failedStdout, ...executableScriptErrors(target, CODEX_EXECUTABLE_GENERATED), agentAllRuntime.ok ? null : agentAllRuntime.details, visualQaRuntime.ok ? null : visualQaRuntime.details, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexAgentAllSequentialRuntime(target, { expectStackRoles = false } = {}) {
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
const expectStackRoles = ${JSON.stringify(expectStackRoles)};

const {
  dispatchSequential,
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

if (expectStackRoles) {
const frontendDispatch = await dispatchSequential({
  task: {
    id: "release-smoke-frontend",
    title: "Release smoke frontend role",
    role: "frontend-dev",
    files: ["src/App.tsx"],
  },
  plan: { path: "docs/tasks/001-release-smoke.md" },
  codexBin: "codex",
  projectRoot: process.cwd(),
  assertSkillFrontmatter: true,
}, async (command) => {
  requireIncludes("frontend-dev sequential command", command, ".codex/skills/frontend-dev/SKILL.md");
  requireIncludes("frontend-dev sequential command", command, "Implement UI components, routes, styles, client state");
  requireIncludes("frontend-dev sequential command", command, "'codex' 'exec'");
  requireOmits("frontend-dev sequential command", command, "--prompt");
  requireOmits("frontend-dev sequential command", command, "--skill");
  return {
    status: 0,
    stdout: JSON.stringify({
      status: "completed",
      changedFiles: ["src/App.tsx"],
      verification: "npm test passed",
      errors: [],
    }),
    stderr: "",
  };
});
if (frontendDispatch.status !== "completed" || frontendDispatch.changedFiles[0] !== "src/App.tsx") {
  throw new Error("frontend-dev sequential dispatch result mismatch");
}

const backendDispatch = await dispatchSequential({
  task: {
    id: "release-smoke-backend",
    title: "Release smoke backend role",
    role: "backend-dev",
    files: ["src/server/api.ts"],
  },
  plan: { path: "docs/tasks/001-release-smoke.md" },
  codexBin: "codex",
  projectRoot: process.cwd(),
  assertSkillFrontmatter: true,
}, async (command) => {
  requireIncludes("backend-dev sequential command", command, ".codex/skills/backend-dev/SKILL.md");
  requireIncludes("backend-dev sequential command", command, "Implement APIs, services, jobs, migrations, persistence");
  requireIncludes("backend-dev sequential command", command, "'codex' 'exec'");
  requireOmits("backend-dev sequential command", command, "--prompt");
  requireOmits("backend-dev sequential command", command, "--skill");
  return {
    status: 0,
    stdout: JSON.stringify({
      status: "completed",
      changedFiles: ["src/server/api.ts"],
      verification: "node --test passed",
      errors: [],
    }),
    stderr: "",
  };
});
if (backendDispatch.status !== "completed" || backendDispatch.changedFiles[0] !== "src/server/api.ts") {
  throw new Error("backend-dev sequential dispatch result mismatch");
}
}

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
      ? expectStackRoles
        ? "sequential agent-all-codex prompt helper runs from the installed fixture and inlines frontend-dev/backend-dev role skills"
        : "sequential agent-all-codex prompt helper runs from the installed fixture"
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
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["omits PreToolUse hook snippet", !/\[\[hooks\.PreToolUse\]\]/.test(res.stdout)],
      ["omits Playwright MCP snippet", !/\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["renders lite guidance", /lite mode/i.test(agents)],
      ["uses floor-conditional language guidance", /If you install the floor bundle, keep `\.agent-all\.json` `language` aligned/.test(agents)],
      ["does not claim existing downstream workflow config", !/Downstream workflow config should keep/.test(agents)],
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
        ? "fresh git fixture received only builder-lite files, floor-conditional language guidance, no hook/task checker side effects, post-install lite doctor coverage, and no global config side effects"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failedStdout, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexBuilder(root) {
  return withFixture("agent-skill-release-codex-builder-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=builder"]);
    const missing = missingFiles(target, CODEX_BUILDER_PRESENT);
    const unexpected = existingFiles(target, CODEX_BUILDER_ABSENT);
    const homeConfig = resolve(home, ".codex/config.toml");
    const agents = readIfExists(resolve(target, "AGENTS.md"));
    const orchestrator = readIfExists(resolve(target, ".codex/skills/orchestrator/SKILL.md"));
    const frontendDev = readIfExists(resolve(target, ".codex/skills/frontend-dev/SKILL.md"));
    const backendDev = readIfExists(resolve(target, ".codex/skills/backend-dev/SKILL.md"));
    const qaReviewer = readIfExists(resolve(target, ".codex/skills/qa-reviewer/SKILL.md"));
    const roleBodies = readCodexOperationalRoleBodies(target);
    const verificationAuditReviewers = {
      "reviewer": readIfExists(resolve(target, ".codex/skills/reviewer/SKILL.md")),
      "verification-reviewer": readIfExists(resolve(target, ".codex/skills/verification-reviewer/SKILL.md")),
      "integration-dev": readIfExists(resolve(target, ".codex/skills/integration-dev/SKILL.md")),
      "design-reviewer": readIfExists(resolve(target, ".codex/skills/design-reviewer/SKILL.md")),
      "security-reviewer": readIfExists(resolve(target, ".codex/skills/security-reviewer/SKILL.md")),
      "data-reviewer": readIfExists(resolve(target, ".codex/skills/data-reviewer/SKILL.md")),
    };
    const stdoutChecks = [
      ["reports builder theme", /theme:\s+builder/i.test(res.stdout)],
      ["runs builder-profile doctor", /profile:\s+builder/i.test(res.stdout)],
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["AGENTS.md includes role gate matrix", /Role Gate Matrix/.test(agents)],
      ...rootFoundationActivationChecks("AGENTS.md", agents),
      ...implementationRoutingChecks("AGENTS.md", agents),
      ...implementationRoutingChecks(".codex orchestrator skill", orchestrator),
      ...personaFoundationMatrixChecks("Codex", "skill", roleBodies, /AGENTS\.md[\s\S]{0,160}docs\/tasks/),
      [".codex frontend-dev skill embeds frontend responsibilities", /Implement UI components, routes, styles, client state/.test(frontendDev)],
      [".codex backend-dev skill embeds backend responsibilities", /Implement APIs, services, jobs, migrations, persistence/.test(backendDev)],
      ["qa-reviewer skill includes QA audit tokens", /QA_AUDIT: passed[\s\S]{0,120}QA_AUDIT: failed[\s\S]{0,120}QA_AUDIT: skipped/.test(qaReviewer)],
      ...codexVerificationAuditTokenChecks(verificationAuditReviewers),
      ["uses floor-conditional language guidance", /If you install the floor bundle, keep `\.agent-all\.json` `language` aligned/.test(agents)],
      ["does not claim existing downstream workflow config", !/Downstream workflow config should keep/.test(agents)],
      ["omits Playwright MCP snippet", !/\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["omits thrift instrumentation summary", !/instrument:\s+no/.test(res.stdout)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failedStdout.length === 0
      && !existsSync(homeConfig);
    const total = CODEX_BUILDER_PRESENT.length + CODEX_BUILDER_ABSENT.length;

    return {
      ok,
      summary: `Codex builder fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh git fixture received only Codex builder artifacts, floor-conditional language guidance, executable hook/task checker, post-install builder doctor coverage, role gate matrix, root foundation activation, complete persona foundation/orchestration matrix, QA and base/specialized reviewer audit tokens, and no global config side effects"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failedStdout, ...executableScriptErrors(target, CODEX_EXECUTABLE_GENERATED), existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexFloor(root) {
  return withFixture("agent-skill-release-codex-floor-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=floor"]);
    const missing = missingFiles(target, CODEX_FLOOR_PRESENT);
    const unexpected = existingFiles(target, CODEX_FLOOR_ABSENT);
    const agentAllRuntime = checkCodexAgentAllSequentialRuntime(target);
    const visualQaRuntime = checkCodexVisualQaSequentialRuntime(target);
    const visualQa = parseJsonFile(resolve(target, ".visual-qa.json"), ".visual-qa.json");
    const agentAll = parseJsonFile(resolve(target, ".agent-all.json"), ".agent-all.json");
    const homeConfig = resolve(home, ".codex/config.toml");
    const stdoutChecks = [
      ["reports floor theme", /theme:\s+floor/i.test(res.stdout)],
      ["prints Playwright MCP snippet", /\[mcp_servers\.playwright\]/.test(res.stdout)],
      ["prints prompt-level floor hook guidance", /No hook snippet is emitted for agent-all-codex/i.test(res.stdout)],
      ["prints manual merge guidance", /Playwright MCP snippet and Codex floor guidance were printed to stdout for manual merge/i.test(res.stdout)],
      ["visual-qa is comprehensive", visualQa.value?.mode === "comprehensive"],
      ["agent-all config exists with waves", Boolean(agentAll.value?.waves)],
      ["omits builder summary", !/AGENTS\.md|docs\/tasks/.test(res.stdout)],
      ["omits thrift instrumentation summary", !/instrument:\s+no/.test(res.stdout)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failedStdout.length === 0
      && agentAllRuntime.ok
      && visualQaRuntime.ok
      && !existsSync(homeConfig);
    const total = CODEX_FLOOR_PRESENT.length + CODEX_FLOOR_ABSENT.length;

    return {
      ok,
      summary: `Codex floor fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh git fixture received only Codex floor artifacts, Playwright MCP/manual merge guidance, comprehensive visual-qa config, sequential agent-all-codex helper runtime, sequential visual-qa-codex helper runtime, and no global config side effects"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...visualQa.errors, ...agentAll.errors, ...failedStdout, agentAllRuntime.ok ? null : agentAllRuntime.details, visualQaRuntime.ok ? null : visualQaRuntime.details, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexThrift(root) {
  return withFixture("agent-skill-release-codex-thrift-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=thrift"]);
    const missing = missingFiles(target, CODEX_THRIFT_PRESENT);
    const unexpected = existingFiles(target, CODEX_THRIFT_ABSENT);
    const thrift = parseJsonFile(resolve(target, ".thrift.json"), ".thrift.json");
    const homeConfig = resolve(home, ".codex/config.toml");
    const stdoutChecks = [
      ["reports thrift theme", /theme:\s+thrift/i.test(res.stdout)],
      ["uses codex thrift no-instrument path", /instrument:\s+no/.test(res.stdout)],
      ["prints manual merge guidance", /Merge them into Codex config only after global command-hook instrumentation is approved/i.test(res.stdout)],
      ["thrift config keeps summariser model", thrift.value?.summariser?.model === "gpt-5-nano"],
      ["thrift config keeps context-mode policy", thrift.value?.contextMode?.coerceReadWhenOutputExceeds === 200],
      ["omits builder/floor summary", !/AGENTS\.md|\.visual-qa\.json|\.agent-all\.json|\.codex\/skills\//.test(res.stdout)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && thrift.errors.length === 0
      && failedStdout.length === 0
      && !existsSync(homeConfig);
    const total = CODEX_THRIFT_PRESENT.length + CODEX_THRIFT_ABSENT.length;

    return {
      ok,
      summary: `Codex thrift fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh git fixture received only Codex thrift artifacts, no-instrument command-hook snippets, manual merge guidance, and no global config side effects"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...thrift.errors, ...failedStdout, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexDebug(root) {
  return withFixture("agent-skill-release-codex-debug-", ({ target, home }) => {
    initGit(target);
    const res = runInstallPlatform(root, target, home, ["--theme=debug"]);
    const missing = missingFiles(target, CODEX_DEBUG_PRESENT);
    const unexpected = existingFiles(target, CODEX_DEBUG_ABSENT);
    const homeConfig = resolve(home, ".codex/config.toml");
    const skill = readIfExists(resolve(target, ".codex/skills/debug-codex/SKILL.md"));
    const stdoutChecks = [
      ["reports debug theme", /theme:\s+debug/i.test(res.stdout)],
      ["runs debug-profile doctor", /profile:\s+debug/i.test(res.stdout)],
      ["post-install doctor passes", /harness doctor: ok/i.test(res.stdout)],
      ["documents run /debug entrypoint", /run \/debug/.test(res.stdout) || /run \/debug/.test(skill)],
      ["debug skill has completion contract", /Debug complete/.test(skill)],
    ];
    const failedStdout = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0
      && missing.length === 0
      && unexpected.length === 0
      && failedStdout.length === 0
      && !existsSync(homeConfig);
    const total = CODEX_DEBUG_PRESENT.length + CODEX_DEBUG_ABSENT.length;

    return {
      ok,
      summary: `Codex debug fixture: ${ok ? "ok" : "failed"} (${total - missing.length - unexpected.length}/${total} file checks)`,
      details: ok
        ? "fresh git fixture received only debug-codex artifacts, post-install debug doctor coverage, and no global config side effects"
        : compactFailure(res, [...missing, ...unexpected.map((file) => `unexpected ${file}`), ...failedStdout, existsSync(homeConfig) ? "unexpected ~/.codex/config.toml" : null].filter(Boolean)),
    };
  });
}

function checkCodexPlatformUninstall(root) {
  return withFixture("agent-skill-release-codex-uninstall-", ({ target, home }) => {
    initGit(target);
    const install = runInstallPlatform(root, target, home, ["--theme=all", "--no-doctor"]);
    const installProducedScaffold = install.status === 0 && existsSync(resolve(target, ".codex/skills/dev/SKILL.md"));
    const dryRun = runInstallPlatform(root, target, home, ["--uninstall", "--dry-run"]);
    const dryRunMutated = CODEX_UNINSTALL_REMOVED.some((file) => !existsSync(resolve(target, file)));
    const uninstall = runInstallPlatform(root, target, home, ["--uninstall"]);

    const stillPresent = existingFiles(target, CODEX_UNINSTALL_REMOVED);
    const homeConfig = resolve(home, ".codex/config.toml");
    const stdoutChecks = [
      ["install produced Codex scaffold", installProducedScaffold],
      ["dry-run reports cleaner without mutation", dryRun.status === 0 && /harness clean: dry-run/i.test(dryRun.stdout) && !dryRunMutated],
      ["uninstall reports cleaner success", uninstall.status === 0 && /harness clean: ok/i.test(uninstall.stdout)],
      ["root AGENTS.md is preserved for manual review", existsSync(resolve(target, "AGENTS.md"))],
      ["debug docs are preserved as evidence", existsSync(resolve(target, "docs/debug/index.md"))],
      ["debug artifacts are preserved as evidence", existsSync(resolve(target, ".debug-artifacts"))],
      ["does not patch global Codex config", !existsSync(homeConfig)],
    ];
    const failed = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = install.status === 0
      && dryRun.status === 0
      && uninstall.status === 0
      && stillPresent.length === 0
      && failed.length === 0;

    return {
      ok,
      summary: `Codex uninstall fixture: ${ok ? "ok" : "failed"} (${CODEX_UNINSTALL_REMOVED.length - stillPresent.length}/${CODEX_UNINSTALL_REMOVED.length} removals)`,
      details: ok
        ? "fresh terminal Codex install-platform uninstall roundtrip removed generated skills, hooks, task ledger, and floor/thrift configs while preserving root guidance, debug evidence, and global config"
        : compactFailure(uninstall, [...stillPresent.map((file) => `still present ${file}`), ...failed]),
    };
  });
}

function checkCodexFoundationAutoUpdate(root) {
  return withFixture("agent-skill-release-codex-foundation-auto-", ({ target, home }) => {
    initGit(target);
    const { binDir, logPath } = writeStubClaude(home, [
      "superpowers@claude-plugins-official",
      "harness-builder-codex@agent-skill",
    ]);
    const res = runInstallPlatformWithFoundationAuto(root, target, home, ["--theme=builder", "--no-doctor"], "codex", binDir);
    const log = readIfExists(logPath);
    const homeSettings = resolve(home, ".claude/settings.local.json");
    const homeCodexConfig = resolve(home, ".codex/config.toml");
    const checks = [
      ["reports approved foundation auto-update", /approved foundation auto-update/.test(res.stdout)],
      ["writes Codex project scaffold after foundation update", existsSync(resolve(target, "AGENTS.md"))],
      ["refreshes official superpowers marketplace", /plugin marketplace update claude-plugins-official/.test(log)],
      ["refreshes context-mode marketplace", /plugin marketplace update context-mode/.test(log)],
      ["updates installed superpowers foundation", /plugin uninstall superpowers@claude-plugins-official/.test(log) && /plugin install superpowers@claude-plugins-official/.test(log)],
      ["installs context-mode foundation", /plugin install context-mode@context-mode/.test(log)],
      ["does not mutate agent-skill plugins during foundation auto-update", !/harness-builder-codex@agent-skill/.test(log)],
      ["does not patch HOME Claude settings", !existsSync(homeSettings)],
      ["does not patch HOME Codex config", !existsSync(homeCodexConfig)],
    ];
    const failed = checks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = res.status === 0 && failed.length === 0;

    return {
      ok,
      summary: `Codex foundation auto-update fixture: ${ok ? "ok" : "failed"} (${checks.length - failed.length}/${checks.length} checks)`,
      details: ok
        ? "fresh Codex platform install auto-updated approved superpowers/context-mode foundations only before scaffolding and did not patch HOME CLI config"
        : compactFailure(res, failed),
    };
  });
}

function checkCodexPlatformForceRootClean(root) {
  return withFixture("agent-skill-release-codex-force-root-clean-", ({ target, home }) => {
    initGit(target);
    const install = runInstallPlatform(root, target, home, ["--theme=all", "--no-doctor"]);
    const installProducedRootGuidance = install.status === 0 && existsSync(resolve(target, "AGENTS.md"));
    const dryRun = runInstallPlatform(root, target, home, ["--uninstall", "--dry-run", "--force-root-clean"]);
    const dryRunMutated = CODEX_FORCE_ROOT_REMOVED.some((file) => !existsSync(resolve(target, file)));
    const uninstall = runInstallPlatform(root, target, home, ["--uninstall", "--force-root-clean"]);

    const stillPresent = existingFiles(target, CODEX_FORCE_ROOT_REMOVED);
    const homeConfig = resolve(home, ".codex/config.toml");
    const stdoutChecks = [
      ["install produced Codex root guidance", installProducedRootGuidance],
      ["dry-run reports force-root cleaner without mutation", dryRun.status === 0 && /--force-root/.test(dryRun.stdout) && /harness clean: dry-run/i.test(dryRun.stdout) && !dryRunMutated],
      ["force-root uninstall reports cleaner success", uninstall.status === 0 && /harness clean: ok/i.test(uninstall.stdout)],
      ["root AGENTS.md is removed when force-root-clean is explicit", !existsSync(resolve(target, "AGENTS.md"))],
      ["debug docs are preserved as evidence", existsSync(resolve(target, "docs/debug/index.md"))],
      ["debug artifacts are preserved as evidence", existsSync(resolve(target, ".debug-artifacts"))],
      ["does not patch global Codex config", !existsSync(homeConfig)],
    ];
    const failed = stdoutChecks.filter(([, pass]) => !pass).map(([name]) => name);
    const ok = install.status === 0
      && dryRun.status === 0
      && uninstall.status === 0
      && stillPresent.length === 0
      && failed.length === 0;

    return {
      ok,
      summary: `Codex force-root uninstall fixture: ${ok ? "ok" : "failed"} (${CODEX_FORCE_ROOT_REMOVED.length - stillPresent.length}/${CODEX_FORCE_ROOT_REMOVED.length} removals)`,
      details: ok
        ? "fresh terminal Codex install-platform --uninstall --force-root-clean removed generated skills, hooks, task ledger, floor/thrift configs, and generated-looking root guidance while preserving debug evidence and global config"
        : compactFailure(uninstall, [...stillPresent.map((file) => `still present ${file}`), ...failed]),
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

function runInstallPlatform(root, target, home, extraArgs, platform = "codex") {
  return spawnSync("/bin/bash", [
    resolve(root, "scripts/install-platform.sh"),
    `--platform=${platform}`,
    `--target=${target}`,
    "--no-update-foundations",
    ...extraArgs,
  ], {
    encoding: "utf-8",
    env: { ...process.env, HOME: home },
  });
}

function runInstallPlatformWithFoundationAuto(root, target, home, extraArgs, platform = "codex", binDir = null) {
  return spawnSync("/bin/bash", [
    resolve(root, "scripts/install-platform.sh"),
    `--platform=${platform}`,
    `--target=${target}`,
    ...extraArgs,
  ], {
    encoding: "utf-8",
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir ? `${binDir}:${process.env.PATH}` : process.env.PATH,
    },
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

function readClaudeOperationalRoleBodies(target) {
  return Object.fromEntries(
    Object.keys(OPERATIONAL_ROLE_SUPERPOWERS).map((role) => [
      role,
      readIfExists(resolve(target, ".claude/agents", `${role}.md`)),
    ]),
  );
}

function readCodexOperationalRoleBodies(target) {
  return Object.fromEntries(
    Object.keys(OPERATIONAL_ROLE_SUPERPOWERS).map((role) => [
      role,
      readIfExists(resolve(target, ".codex/skills", role, "SKILL.md")),
    ]),
  );
}

function executableScriptErrors(root, files) {
  const errors = [];
  for (const file of files) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      errors.push(`missing executable ${file}`);
      continue;
    }
    const firstLine = readIfExists(path).split(/\r?\n/, 1)[0];
    if (!firstLine.startsWith("#!")) {
      errors.push(`missing shebang ${file}`);
    }
    if ((statSync(path).mode & 0o111) === 0) {
      errors.push(`non-executable ${file}`);
    }
  }
  return errors;
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, "utf-8") : "";
}

function writeFile(target, destRel, body) {
  const dest = resolve(target, destRel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
}

function writeStubClaude(home, installedPluginIds = []) {
  const binDir = resolve(home, "bin");
  const pluginsDir = resolve(home, ".claude/plugins");
  const logPath = resolve(home, "claude.log");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(pluginsDir, { recursive: true });
  writeFileSync(
    resolve(pluginsDir, "installed_plugins.json"),
    `${JSON.stringify({ plugins: Object.fromEntries(installedPluginIds.map((id) => [id, {}])) }, null, 2)}\n`,
  );
  writeFileSync(
    resolve(binDir, "claude"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}
exit 0
`,
    { mode: 0o755 },
  );
  return { binDir, logPath };
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

function implementationRoutingChecks(label, text) {
  return [
    [`${label} includes implementation routing matrix`, /Implementation Routing Matrix/.test(text)],
    [`${label} routes UI work to frontend-dev`, /UI, routes, client state, browser behavior[\s\S]{0,160}`frontend-dev`/.test(text)],
    [`${label} routes API work to backend-dev`, /API, services, jobs, persistence[\s\S]{0,160}`backend-dev`/.test(text)],
    [`${label} routes cross-stack contracts through integration-dev`, /Frontend plus backend\/API contract[\s\S]{0,220}`integration-dev`[\s\S]{0,220}`frontend-dev`[\s\S]{0,220}`backend-dev`/.test(text)],
  ];
}

function rootFoundationActivationChecks(label, text) {
  return [
    [`${label} names brainstorming foundation`, /superpowers:brainstorming/.test(text)],
    [`${label} names planning foundation`, /superpowers:writing-plans/.test(text)],
    [`${label} names orchestration foundations`, /superpowers:dispatching-parallel-agents[\s\S]{0,220}superpowers:subagent-driven-development/.test(text)],
    [`${label} names completion verification foundation`, /superpowers:verification-before-completion/.test(text)],
    [`${label} routes bulk context through context-mode or file-backed logs`, /context-mode[\s\S]{0,220}(file-backed logs|bulk context|broad reads|long outputs)/i.test(text)],
  ];
}

function projectDispatches(dispatches) {
  return dispatches.map(({ role, kind, mode, auditToken }) => ({ role, kind, mode, auditToken }));
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function personaFoundationMatrixChecks(platform, noun, roleBodies, rootContextPattern) {
  const checks = [];
  for (const [role, skills] of Object.entries(OPERATIONAL_ROLE_SUPERPOWERS)) {
    const body = roleBodies[role] || "";
    const label = `${platform} ${role} ${noun}`;
    checks.push([`${label} reads root and active task context`, rootContextPattern.test(body)]);
    checks.push([`${label} avoids generic superpowers placeholder`, !/superpowers:\*/.test(body)]);
    for (const skill of skills) {
      checks.push([`${label} names superpowers:${skill}`, body.includes(`superpowers:${skill}`)]);
    }
    checks.push([`${label} routes bulk output through context-mode or file-backed logs`, /context-mode/i.test(body) && /(file-backed logs|ctx_batch_execute|ctx_execute)/i.test(body)]);
    checks.push([`${label} preserves shared-tree safety`, /shared-tree|unrelated edits|HOT-file/i.test(body)]);
    checks.push([`${label} states degraded foundation fallback`, /if unavailable, state the fallback|if foundations are degraded, state the fallback/i.test(body)]);
  }
  return checks;
}

function poscoMdsDjangoVueRoutingChecks(label, classifyChangedFiles, buildGatePlan) {
  const classification = classifyChangedFiles(POSCO_MDS_DJANGO_VUE.changedFiles);
  const gatePlan = buildGatePlan({
    files: POSCO_MDS_DJANGO_VUE.changedFiles,
    gates: { specReview: true, qualityReview: true },
    taskId: "posco-mds",
    title: "POSCO MDS Django/Vue workflow",
  });

  return [
    [`${label} routes POSCO MDS Django/Vue reviewers`, sameJson(classification.reviewers, POSCO_MDS_DJANGO_VUE.expectedReviewers)],
    [`${label} routes POSCO MDS Django/Vue coordinator`, sameJson(classification.coordinators, POSCO_MDS_DJANGO_VUE.expectedCoordinators)],
    [`${label} gate plan preserves POSCO MDS Django/Vue dispatch order`, sameJson(projectDispatches(gatePlan.dispatches), POSCO_MDS_DJANGO_VUE.expectedDispatches)],
  ];
}

function claudeVerificationAuditTokenChecks(roleBodies) {
  const checks = [];
  for (const [role, body] of Object.entries(roleBodies)) {
    checks.push([`${role} agent includes Phase 4 review dispatch contract`, /Phase 4 reviewer[\s\S]{0,120}Review Task/i.test(body)]);
    checks.push([`${role} agent includes VERIFICATION_AUDIT passed token`, /VERIFICATION_AUDIT: passed/.test(body)]);
    checks.push([`${role} agent includes VERIFICATION_AUDIT failed token`, /VERIFICATION_AUDIT: failed/.test(body)]);
    checks.push([`${role} agent includes VERIFICATION_AUDIT skipped token`, /VERIFICATION_AUDIT: skipped/.test(body)]);
    checks.push([`${role} agent requires literal line at end`, /literal line at the END/i.test(body)]);
  }
  return checks;
}

function claudeQaAuditTokenChecks(body) {
  return [
    ["qa-reviewer agent includes Phase 4 QA review dispatch contract", /Phase 4 QA reviewer[\s\S]{0,120}QA Review Task/i.test(body)],
    ["qa-reviewer agent includes QA_AUDIT passed token", /QA_AUDIT: passed/.test(body)],
    ["qa-reviewer agent includes QA_AUDIT failed token", /QA_AUDIT: failed/.test(body)],
    ["qa-reviewer agent includes QA_AUDIT skipped token", /QA_AUDIT: skipped/.test(body)],
    ["qa-reviewer agent requires literal line at end", /literal line at the END/i.test(body)],
  ];
}

function codexVerificationAuditTokenChecks(roleBodies) {
  const checks = [];
  for (const [role, body] of Object.entries(roleBodies)) {
    checks.push([`${role} skill includes Phase 4 review dispatch contract`, /Phase 4 reviewer[\s\S]{0,120}Review Task/i.test(body)]);
    checks.push([`${role} skill includes VERIFICATION_AUDIT passed token`, /VERIFICATION_AUDIT: passed/.test(body)]);
    checks.push([`${role} skill includes VERIFICATION_AUDIT failed token`, /VERIFICATION_AUDIT: failed/.test(body)]);
    checks.push([`${role} skill includes VERIFICATION_AUDIT skipped token`, /VERIFICATION_AUDIT: skipped/.test(body)]);
    checks.push([`${role} skill requires literal line at end`, /literal line at the END/i.test(body)]);
  }
  return checks;
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
