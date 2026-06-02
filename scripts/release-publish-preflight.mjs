#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE = "origin/main";
const DEFAULT_REMOTE = "origin";

export function buildReleasePublishPreflightReport(options = {}) {
  const root = resolve(options.root || ROOT);
  const base = options.base || DEFAULT_BASE;
  const head = options.head || "HEAD";
  const remote = options.remote || DEFAULT_REMOTE;
  const allowDirty = Boolean(options.allowDirty);
  const runner = options.runner || runCommand;

  const git = readGitPublishState({ root, remote, runner });
  const changedFiles = readChangedFiles({ root, base, head, runner });
  const workflowChanges = changedFiles.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file));
  const gh = readGhAuthStatus({ root, runner });
  const checks = [
    checkCleanWorktree(git, allowDirty),
    checkBranch(git),
    checkRemote(git, remote),
    checkGhAuth(gh),
    checkWorkflowScope({ gh, workflowChanges }),
  ];

  return {
    ok: checks.every((check) => check.ok),
    root,
    generatedAt: new Date().toISOString(),
    base,
    head,
    remote,
    git,
    gh,
    changedFiles,
    workflowChanges,
    pushCommand: buildPushCommand({ remote, branch: git.branch }),
    recommendation: buildRecommendation({ gh, workflowChanges }),
    checks,
  };
}

function readGitPublishState({ root, remote, runner }) {
  const head = run(runner, { command: "git", args: ["rev-parse", "HEAD"], cwd: root, label: "git head" });
  const branch = run(runner, { command: "git", args: ["branch", "--show-current"], cwd: root, label: "git branch" });
  const status = run(runner, { command: "git", args: ["status", "--porcelain"], cwd: root, label: "git status" });
  const remoteUrl = run(runner, {
    command: "git",
    args: ["remote", "get-url", remote],
    cwd: root,
    label: "git remote",
    optional: true,
  });
  const upstream = run(runner, {
    command: "git",
    args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    cwd: root,
    label: "git upstream",
    optional: true,
  });
  return {
    head: head.stdout.trim(),
    branch: branch.stdout.trim(),
    status: status.stdout.trim(),
    remoteUrl: remoteUrl.status === 0 ? remoteUrl.stdout.trim() : "",
    upstream: upstream.status === 0 ? upstream.stdout.trim() : "",
  };
}

function readChangedFiles({ root, base, head, runner }) {
  const result = run(runner, {
    command: "git",
    args: ["diff", "--name-only", `${base}...${head}`],
    cwd: root,
    label: "git changed files",
    optional: true,
  });
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readGhAuthStatus({ root, runner }) {
  const result = run(runner, {
    command: "gh",
    args: ["auth", "status"],
    cwd: root,
    label: "gh auth status",
    optional: true,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    ok: result.status === 0,
    scopes: parseTokenScopes(output),
    status: result.status,
    account: parseAccount(output),
    hasWorkflowScope: parseTokenScopes(output).includes("workflow"),
  };
}

function checkCleanWorktree(git, allowDirty) {
  const ok = allowDirty || git.status.length === 0;
  return {
    ok,
    name: "clean worktree before publishing release branch",
    details: ok ? (allowDirty && git.status ? "allowed dirty worktree for inspection" : "clean") : git.status,
  };
}

function checkBranch(git) {
  const ok = git.branch.length > 0;
  return {
    ok,
    name: "release branch is named before publishing",
    details: ok ? git.branch : "detached HEAD",
  };
}

function checkRemote(git, remote) {
  const ok = git.remoteUrl.length > 0;
  return {
    ok,
    name: `${remote} remote is configured for publish`,
    details: ok ? git.remoteUrl : `missing ${remote} remote`,
  };
}

function checkGhAuth(gh) {
  return {
    ok: gh.ok,
    name: "GitHub CLI authentication is available",
    details: gh.ok ? `account: ${gh.account || "unknown"}; scopes: ${gh.scopes.join(", ") || "(none)"}` : "gh auth status failed",
  };
}

function checkWorkflowScope({ gh, workflowChanges }) {
  const needsWorkflowScope = workflowChanges.length > 0;
  const ok = !needsWorkflowScope || gh.hasWorkflowScope;
  return {
    ok,
    name: "GitHub token has workflow scope when workflow files changed",
    details: needsWorkflowScope
      ? ok
        ? `workflow scope present for ${workflowChanges.join(", ")}`
        : `missing workflow scope for ${workflowChanges.join(", ")}`
      : "no workflow file changes",
  };
}

function buildPushCommand({ remote, branch }) {
  return branch ? printableCommand("git", ["push", "-u", remote, branch]) : null;
}

function buildRecommendation({ gh, workflowChanges }) {
  if (workflowChanges.length > 0 && !gh.hasWorkflowScope) {
    return [
      "Refresh GitHub CLI auth with workflow scope before pushing workflow changes:",
      "gh auth refresh -h github.com -s workflow",
    ].join(" ");
  }
  return "Publish preflight passed; push the branch after local release gate evidence is captured.";
}

function parseTokenScopes(output) {
  const line = output.split(/\r?\n/).find((item) => /Token scopes:/i.test(item));
  if (!line) return [];
  const raw = line.replace(/^.*Token scopes:\s*/i, "").trim();
  return raw
    .split(",")
    .map((scope) => scope.replace(/['"]/g, "").trim())
    .filter(Boolean)
    .sort();
}

function parseAccount(output) {
  const active = output.match(/Logged in to [^\s]+ account ([^\s]+)/i);
  if (active) return active[1];
  const fallback = output.match(/Active account:\s*([^\s]+)/i);
  return fallback ? fallback[1] : "";
}

function run(runner, call) {
  const result = normalizeCommandResult(runner(call));
  if (!call.optional && result.status !== 0) {
    throw new Error(`${call.label} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function runCommand({ command, args, cwd }) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function normalizeCommandResult(result) {
  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function printableCommand(command, args) {
  return [command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function parseArgs(argv) {
  const args = {
    base: DEFAULT_BASE,
    head: "HEAD",
    remote: DEFAULT_REMOTE,
    allowDirty: false,
    json: false,
  };

  for (const arg of argv) {
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--allow-dirty") {
      args.allowDirty = true;
    } else if (arg.startsWith("--base=")) {
      args.base = arg.slice("--base=".length);
    } else if (arg.startsWith("--head=")) {
      args.head = arg.slice("--head=".length);
    } else if (arg.startsWith("--remote=")) {
      args.remote = arg.slice("--remote=".length);
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHuman(report) {
  console.log(`release publish preflight: ${report.ok ? "ok" : "failed"}`);
  console.log(`head: ${report.git.head || "unknown"}`);
  console.log(`branch: ${report.git.branch || "(detached)"}`);
  console.log(`base: ${report.base}`);
  console.log(`workflow changes: ${report.workflowChanges.length ? report.workflowChanges.join(", ") : "(none)"}`);
  for (const check of report.checks) {
    console.log(`  ${check.ok ? "ok" : "fail"} - ${check.name}: ${check.details}`);
  }
  console.log(`next: ${report.recommendation}`);
  if (report.pushCommand) {
    console.log(`push command: ${report.pushCommand}`);
  }
}

function printUsage() {
  console.log(`Usage: node scripts/release-publish-preflight.mjs [--base=origin/main] [--head=HEAD] [--remote=origin] [--allow-dirty] [--json]

Checks the local publish path before pushing a release branch:
  - clean worktree and named branch
  - configured git remote
  - GitHub CLI authentication
  - workflow scope when .github/workflows/*.yml changed

No files are written and no push is performed.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = buildReleasePublishPreflightReport(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exit(2);
  }
}
