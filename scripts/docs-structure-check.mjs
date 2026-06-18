#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_DOCS = [
  "README.md",
  "README.ko.md",
  "CHANGELOG.md",
  "CHANGELOG.ko.md",
  "PROJECT_PLAN.md",
  "ROADMAP.md",
  "docs/USER_MANUAL.md",
  "docs/USER_MANUAL.ko.md",
  "docs/USAGE.md",
  "docs/USAGE.ko.md",
  "docs/architecture/README.md",
  "docs/github-governance.md",
  "tests/manual-checklist.md",
];

const QUICKSTART_DOCS = [
  "docs/quickstart/README.md",
  "docs/quickstart/README.ko.md",
  "docs/quickstart/claude.md",
  "docs/quickstart/claude.ko.md",
  "docs/quickstart/codex.md",
  "docs/quickstart/codex.ko.md",
  "docs/quickstart/copilot.md",
  "docs/quickstart/copilot.ko.md",
  "docs/quickstart/cursor.md",
  "docs/quickstart/cursor.ko.md",
  "docs/quickstart/gemini.md",
  "docs/quickstart/gemini.ko.md",
  "docs/quickstart/vscode-copilot.md",
  "docs/quickstart/vscode-copilot.ko.md",
];

const REQUIRED_SECTIONS = [
  {
    file: "docs/github-governance.md",
    patterns: [
      /^# GitHub Governance$/m,
      /^## Public PR Smoke CI$/m,
      /^## Issue Templates$/m,
      /^## Pull Request Template$/m,
      /^## Label Taxonomy$/m,
      /^## Release Roles$/m,
    ],
  },
  {
    file: "PROJECT_PLAN.md",
    patterns: [/Public governance/i, /PR smoke CI/i, /local release gate/i],
  },
  {
    file: "tests/manual-checklist.md",
    patterns: [/Public PR smoke CI/i, /Local release gate remains authoritative/i],
  },
];

const LINK_SOURCE_FILES = [
  "README.md",
  "README.ko.md",
  "PROJECT_PLAN.md",
  "ROADMAP.md",
  "docs/USER_MANUAL.md",
  "docs/USER_MANUAL.ko.md",
  "docs/USAGE.md",
  "docs/USAGE.ko.md",
  "docs/architecture/README.md",
  "docs/github-governance.md",
  "tests/manual-checklist.md",
  ...QUICKSTART_DOCS,
];

export function buildDocsStructureReport(options = {}) {
  const root = resolve(options.root || ROOT);
  const checks = [
    checkRequiredDocs(root),
    checkRequiredSections(root),
    checkLocalMarkdownLinks(root),
    checkNoWorkflowReleaseClaim(root),
  ];

  return {
    ok: checks.every((check) => check.ok),
    root,
    checks,
  };
}

function checkRequiredDocs(root) {
  const missing = REQUIRED_DOCS.filter((file) => !existsSync(resolve(root, file)));
  return {
    ok: missing.length === 0,
    name: "required public docs exist",
    details: missing.length === 0 ? `${REQUIRED_DOCS.length} docs present` : `missing: ${missing.join(", ")}`,
  };
}

function checkRequiredSections(root) {
  const failures = [];
  for (const spec of REQUIRED_SECTIONS) {
    const path = resolve(root, spec.file);
    if (!existsSync(path)) {
      failures.push(`${spec.file}: missing`);
      continue;
    }
    const text = readFileSync(path, "utf-8");
    for (const pattern of spec.patterns) {
      if (!pattern.test(text)) failures.push(`${spec.file}: missing ${pattern}`);
    }
  }

  return {
    ok: failures.length === 0,
    name: "required governance doc sections exist",
    details: failures.length === 0 ? "matched" : failures.join("; "),
  };
}

function checkLocalMarkdownLinks(root) {
  const failures = [];
  let checked = 0;

  for (const relPath of LINK_SOURCE_FILES) {
    const path = resolve(root, relPath);
    if (!existsSync(path)) {
      failures.push(`${relPath}: missing`);
      continue;
    }
    const text = stripCodeBlocks(readFileSync(path, "utf-8"));
    for (const target of markdownTargets(text)) {
      const normalized = normalizeTarget(target);
      if (!normalized || shouldSkipTarget(normalized)) continue;
      checked += 1;
      const targetPath = normalized.split("#", 1)[0];
      if (!targetPath) continue;
      const resolved = resolve(dirname(path), targetPath);
      if (!existsSync(resolved)) {
        failures.push(`${relPath}: broken link ${target}`);
        continue;
      }
      if (targetPath.endsWith("/") && !statSync(resolved).isDirectory()) {
        failures.push(`${relPath}: link is not a directory ${target}`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    name: "local markdown links resolve",
    details: failures.length === 0 ? `${checked} local links checked` : failures.join("; "),
  };
}

function checkNoWorkflowReleaseClaim(root) {
  const workflows = listWorkflowFiles(resolve(root, ".github/workflows"));
  const releaseWorkflows = workflows.filter((file) => /(^|\/)release\.ya?ml$/i.test(file));
  return {
    ok: releaseWorkflows.length === 0,
    name: "public CI does not replace local release gate",
    details:
      releaseWorkflows.length === 0
        ? "no release.yml workflow; smoke/docs/templates CI stays PR-scoped"
        : `unexpected release workflow: ${releaseWorkflows.map((file) => relative(root, file)).join(", ")}`,
  };
}

function listWorkflowFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => /\.ya?ml$/i.test(entry))
    .map((entry) => join(dir, entry));
}

function stripCodeBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}

function markdownTargets(text) {
  const targets = [];
  const pattern = /!?\[[^\]]*]\(([^)\n]+)\)/g;
  for (const match of text.matchAll(pattern)) targets.push(match[1]);
  return targets;
}

function normalizeTarget(rawTarget) {
  let target = rawTarget.trim();
  if (!target) return null;
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1).trim();
  }
  const titleMatch = target.match(/^(\S+)\s+["'][^"']+["']$/);
  if (titleMatch) target = titleMatch[1];
  try {
    target = decodeURI(target);
  } catch {
    // Leave malformed escapes as-is so the existence check reports the link.
  }
  return target;
}

function shouldSkipTarget(target) {
  return (
    target.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target) ||
    target.includes("*") ||
    target.includes("<") ||
    extname(target) === ".svg"
  );
}

function printHuman(report) {
  console.log(`docs structure check: ${report.ok ? "ok" : "failed"}`);
  for (const check of report.checks) {
    console.log(`- ${check.ok ? "ok" : "FAIL"} ${check.name}: ${check.details}`);
  }
}

function parseArgs(argv) {
  return {
    json: argv.includes("--json"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = buildDocsStructureReport();
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.ok ? 0 : 1);
}
