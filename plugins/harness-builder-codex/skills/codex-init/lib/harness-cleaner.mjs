import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SENTINEL } from "./sentinel-merge.mjs";

const ROOT_GUIDANCE = {
  claude: [
    {
      rel: "CLAUDE.md",
      managedPattern: /Project memory for Claude Code\. Maintained by `\/agent-init`/i,
    },
    {
      rel: "AGENTS.md",
      managedPattern: /Companion project memory for agents that read `AGENTS\.md`\. Maintained by `\/agent-init`/i,
    },
  ],
  codex: [
    {
      rel: "AGENTS.md",
      managedPattern: /Project memory for Codex CLI\. Scaffolded by `\/codex-init`/i,
    },
  ],
};

const PLATFORM_FILES = {
  claude: [
    ".claude/.agent-init-state.json",
    ".claude/agents/planner.md",
    ".claude/agents/dev.md",
    ".claude/agents/reviewer.md",
    ".claude/agents/orchestrator.md",
    ".claude/agents/frontend-dev.md",
    ".claude/agents/backend-dev.md",
    ".claude/agents/integration-dev.md",
    ".claude/agents/quality-debt-reviewer.md",
    ".claude/agents/verification-reviewer.md",
    ".claude/agents/qa-reviewer.md",
    ".claude/agents/design-reviewer.md",
    ".claude/agents/security-reviewer.md",
    ".claude/agents/data-reviewer.md",
    ".claude/hooks/context-mode-router.mjs",
    ".claude/hooks/session-summary.mjs",
    ".claude/hooks/cache-heal.mjs",
    ".claude/hooks/agent-policy-hook.mjs",
  ],
  codex: [
    ".codex/hooks/agent-policy-hook.mjs",
    ".codex/hooks/thrift-pretool-bash-telemetry.toml",
    ".codex/hooks/thrift-pretool-read-coerce.toml",
    ".codex/hooks/thrift-posttool-summariser-trigger.toml",
    ".codex/hooks/thrift-sessionstart-cache-prime.toml",
    ".codex/hooks/thrift-sessionend-audit.toml",
  ],
};

const CODEX_SKILL_DIRS = [
  ".codex/skills/planner",
  ".codex/skills/dev",
  ".codex/skills/reviewer",
  ".codex/skills/orchestrator",
  ".codex/skills/frontend-dev",
  ".codex/skills/backend-dev",
  ".codex/skills/integration-dev",
  ".codex/skills/quality-debt-reviewer",
  ".codex/skills/verification-reviewer",
  ".codex/skills/qa-reviewer",
  ".codex/skills/design-reviewer",
  ".codex/skills/security-reviewer",
  ".codex/skills/data-reviewer",
  ".codex/skills/agent-all-codex",
  ".codex/skills/visual-qa-codex",
  ".codex/skills/visual-qa-page",
  ".codex/skills/debug-codex",
];

const SHARED_GENERATED_FILES = [
  ".visual-qa.json",
  ".agent-all.json",
  ".thrift.json",
  ".agent-skill/tasks/_template.md",
  ".agent-skill/tasks/_handoff-template.md",
  "docs/tasks/_template.md",
  "docs/tasks/_handoff-template.md",
  "scripts/agent-task-ledger-check.mjs",
];

const SENTINEL_GUIDES = [
  ".codex/AGENTS.md",
  ".agent-skill/tasks/CLAUDE.md",
  ".agent-skill/tasks/AGENTS.md",
  ".agent-skill/tasks/index.md",
  "docs/tasks/CLAUDE.md",
  "docs/tasks/AGENTS.md",
  "docs/tasks/index.md",
];

const EMPTY_DIRS = [
  ".claude/hooks",
  ".claude/agents",
  ".claude",
  ".codex/hooks",
  ".codex/skills",
  ".codex",
  ".agent-skill/baselines",
  ".agent-skill/reports/thrift",
  ".agent-skill/reports/debug",
  ".agent-skill/reports/visual-qa",
  ".agent-skill/reports",
  ".agent-skill/handoff",
  ".agent-skill/tasks",
  ".agent-skill/decisions",
  ".agent-skill/specs",
  ".agent-skill/plans",
  ".agent-skill",
  "docs/tasks",
  "docs/decisions",
  "docs/superpowers/specs",
  "docs/superpowers/plans",
  "docs/superpowers",
  "docs",
  "scripts",
];

const CLAUDE_HOOK_PATHS = [
  ".claude/hooks/context-mode-router.mjs",
  ".claude/hooks/session-summary.mjs",
  ".claude/hooks/cache-heal.mjs",
  ".claude/hooks/agent-policy-hook.mjs",
];

export function planHarnessCleanup({
  target = process.cwd(),
  platform,
  forceRoot = false,
} = {}) {
  if (platform !== "claude" && platform !== "codex") {
    throw new Error("platform must be claude or codex");
  }

  const targetAbs = resolve(target);
  const operations = [];
  const skipped = [];

  for (const spec of ROOT_GUIDANCE[platform]) {
    addGuidanceCleanup({ targetAbs, spec, forceRoot, operations, skipped });
  }

  for (const rel of SENTINEL_GUIDES) {
    addSentinelCleanup({ targetAbs, rel, operations, skipped, rootGuidance: false });
  }

  for (const rel of SHARED_GENERATED_FILES) {
    addRemoveFile({ targetAbs, rel, operations });
  }

  for (const rel of PLATFORM_FILES[platform]) {
    addRemoveFile({ targetAbs, rel, operations });
  }

  if (platform === "claude") {
    addClaudeSettingsCleanup({ targetAbs, operations, skipped });
  }

  if (platform === "codex") {
    for (const rel of CODEX_SKILL_DIRS) {
      addRemoveDir({ targetAbs, rel, operations });
    }
  }

  for (const rel of EMPTY_DIRS) {
    addRemoveEmptyDir({ targetAbs, rel, operations });
  }

  return {
    ok: true,
    target: targetAbs,
    platform,
    forceRoot,
    operations,
    skipped,
    summary: {
      operations: operations.length,
      skipped: skipped.length,
    },
  };
}

export function runHarnessCleanup(options = {}) {
  const plan = planHarnessCleanup(options);
  if (options.dryRun) {
    return { ...plan, dryRun: true, applied: [] };
  }

  const applied = [];
  for (const operation of plan.operations) {
    applyOperation(operation);
    applied.push(operation);
  }

  return {
    ...plan,
    dryRun: false,
    applied,
  };
}

function addGuidanceCleanup({ targetAbs, spec, forceRoot, operations, skipped }) {
  const abs = resolve(targetAbs, spec.rel);
  if (!existsSync(abs)) return;

  const body = readFileSync(abs, "utf-8");
  const stripped = stripSentinelSection(body);
  if (stripped.changed) {
    operations.push({
      type: "strip-sentinel",
      path: abs,
      rel: spec.rel,
      body: stripped.body,
      message: `strip generated sentinel section from ${spec.rel}`,
    });
    return;
  }

  if (spec.managedPattern.test(body)) {
    if (forceRoot) {
      operations.push({
        type: "remove-file",
        path: abs,
        rel: spec.rel,
        message: `remove managed root guidance ${spec.rel}`,
      });
    } else {
      skipped.push({
        type: "root-guidance",
        rel: spec.rel,
        reason: "managed-looking root guidance has no sentinel; pass --force-root to remove it",
      });
    }
    return;
  }

  skipped.push({
    type: "root-guidance",
    rel: spec.rel,
    reason: "root guidance does not look generated by agent-skill",
  });
}

function addSentinelCleanup({ targetAbs, rel, operations, skipped }) {
  const abs = resolve(targetAbs, rel);
  if (!existsSync(abs)) return;
  const body = readFileSync(abs, "utf-8");
  const stripped = stripSentinelSection(body);
  if (stripped.changed) {
    operations.push({
      type: "strip-sentinel",
      path: abs,
      rel,
      body: stripped.body,
      message: `strip generated sentinel section from ${rel}`,
    });
  } else {
    skipped.push({
      type: "sentinel",
      rel,
      reason: "file exists but has no complete agent-skill sentinel section",
    });
  }
}

function addRemoveFile({ targetAbs, rel, operations }) {
  const abs = resolve(targetAbs, rel);
  if (!existsSync(abs)) return;
  operations.push({
    type: "remove-file",
    path: abs,
    rel,
    message: `remove generated file ${rel}`,
  });
}

function addRemoveDir({ targetAbs, rel, operations }) {
  const abs = resolve(targetAbs, rel);
  if (!existsSync(abs)) return;
  operations.push({
    type: "remove-dir",
    path: abs,
    rel,
    message: `remove generated directory ${rel}`,
  });
}

function addRemoveEmptyDir({ targetAbs, rel, operations }) {
  const abs = resolve(targetAbs, rel);
  operations.push({
    type: "remove-empty-dir",
    path: abs,
    rel,
    message: `remove empty directory ${rel}`,
  });
}

function addClaudeSettingsCleanup({ targetAbs, operations, skipped }) {
  const rel = ".claude/settings.local.json";
  const abs = resolve(targetAbs, rel);
  if (!existsSync(abs)) return;

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf-8"));
  } catch (error) {
    skipped.push({
      type: "settings",
      rel,
      reason: `settings JSON is invalid: ${error.message}`,
    });
    return;
  }

  const cleaned = removeClaudeHookCommands(parsed);
  if (cleaned.removed === 0) return;
  operations.push({
    type: "write-json",
    path: abs,
    rel,
    value: cleaned.settings,
    removed: cleaned.removed,
    message: `remove ${cleaned.removed} generated Claude hook registration(s)`,
  });
}

function removeClaudeHookCommands(settings) {
  const next = structuredClone(settings);
  let removed = 0;
  if (!next.hooks || typeof next.hooks !== "object") {
    return { removed, settings: next };
  }

  for (const [event, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) continue;
    const keptGroups = [];
    for (const group of groups) {
      const hooks = Array.isArray(group?.hooks) ? group.hooks : [];
      const keptHooks = hooks.filter((hook) => {
        const command = typeof hook?.command === "string" ? hook.command : "";
        const generated = CLAUDE_HOOK_PATHS.some((hookPath) => command.includes(hookPath));
        if (generated) removed++;
        return !generated;
      });
      if (keptHooks.length > 0) {
        keptGroups.push({ ...group, hooks: keptHooks });
      }
    }
    if (keptGroups.length > 0) {
      next.hooks[event] = keptGroups;
    } else {
      delete next.hooks[event];
    }
  }

  if (Object.keys(next.hooks).length === 0) {
    delete next.hooks;
  }
  return { removed, settings: next };
}

function stripSentinelSection(body) {
  const start = findMarkerLine(body, SENTINEL.start);
  const end = findMarkerLine(body, SENTINEL.end);
  if (!start || !end || end.lineStart < start.lineStart) {
    return { changed: false, body };
  }

  const next = `${body.slice(0, start.lineStart)}${body.slice(end.nextLineStart)}`;
  return {
    changed: true,
    body: normaliseBlankLines(next),
  };
}

function findMarkerLine(text, marker) {
  let lineStart = 0;
  while (lineStart < text.length) {
    const newline = text.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const nextLineStart = newline === -1 ? text.length : newline + 1;
    const line = text.slice(lineStart, lineEnd);
    if (line.trim() === marker) return { lineStart, nextLineStart };
    lineStart = nextLineStart;
  }
  return null;
}

function normaliseBlankLines(text) {
  const trimmedRight = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  return trimmedRight ? `${trimmedRight}\n` : "";
}

function applyOperation(operation) {
  if (operation.type === "strip-sentinel") {
    if (operation.body) {
      writeFileSync(operation.path, operation.body);
    } else {
      rmSync(operation.path, { force: true });
    }
  } else if (operation.type === "remove-file") {
    rmSync(operation.path, { force: true });
  } else if (operation.type === "remove-dir") {
    rmSync(operation.path, { recursive: true, force: true });
  } else if (operation.type === "remove-empty-dir") {
    removeEmptyDir(operation.path);
  } else if (operation.type === "write-json") {
    writeFileSync(operation.path, `${JSON.stringify(operation.value, null, 2)}\n`);
  } else {
    throw new Error(`unknown cleanup operation: ${operation.type}`);
  }
}

function removeEmptyDir(path) {
  if (!existsSync(path)) return;
  try {
    if (readdirSync(path).length === 0) {
      rmSync(path, { recursive: true, force: true });
    }
  } catch {
    // Best-effort cleanup only; file removal operations already did the real work.
  }
}

export function parseCleanupArgs(argv) {
  const args = {
    target: process.cwd(),
    platform: null,
    forceRoot: false,
    dryRun: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force-root") args.forceRoot = true;
    else if (arg.startsWith("--target=")) args.target = arg.slice("--target=".length);
    else if (arg === "--target") args.target = argv[++i];
    else if (arg.startsWith("--platform=")) args.platform = arg.slice("--platform=".length);
    else if (arg === "--platform") args.platform = argv[++i];
    else if (arg.startsWith("-")) throw new Error(`unknown argument: ${arg}`);
    else args.target = arg;
  }

  if (args.help) return args;
  if (!args.platform) throw new Error("--platform is required");
  if (args.platform !== "claude" && args.platform !== "codex") {
    throw new Error("--platform must be claude or codex");
  }
  return args;
}

export const CLEANUP_USAGE = `Usage: clean.mjs --platform=claude|codex [--target=<dir>] [--dry-run] [--force-root] [--json]

Safely removes project-local agent-skill harness artifacts.

By default, root CLAUDE.md/AGENTS.md files without agent-skill sentinel markers
are left for manual review. Pass --force-root to remove root files that still
match the generated agent-skill root guidance marker.`;

export function printCleanupHuman(result) {
  console.log(`harness clean: ${result.dryRun ? "dry-run" : "ok"}`);
  console.log(`target: ${result.target}`);
  console.log(`platform: ${result.platform}`);
  console.log(`operations: ${result.operations.length}`);
  if (result.operations.length > 0) {
    console.log("");
    console.log(result.dryRun ? "Would remove/update:" : "Removed/updated:");
    for (const operation of result.operations) {
      console.log(`  - ${operation.message}`);
    }
  }
  if (result.skipped.length > 0) {
    console.log("");
    console.log("Skipped:");
    for (const skip of result.skipped) {
      console.log(`  - ${skip.rel}: ${skip.reason}`);
    }
  }
}

export function runCleanupCli(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseCleanupArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(CLEANUP_USAGE);
    process.exitCode = 2;
    return 2;
  }
  if (args.help) {
    console.log(CLEANUP_USAGE);
    return 0;
  }

  const result = runHarnessCleanup(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printCleanupHuman(result);
  }
  process.exitCode = 0;
  return 0;
}
