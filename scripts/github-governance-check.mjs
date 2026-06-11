#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_FILES = [
  ".github/workflows/smoke.yml",
  ".github/workflows/docs.yml",
  ".github/workflows/templates.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/feature.yml",
  ".github/ISSUE_TEMPLATE/platform-bug.yml",
  ".github/ISSUE_TEMPLATE/docs-process.yml",
  ".github/ISSUE_TEMPLATE/quality-debt.yml",
  ".github/ISSUE_TEMPLATE/verification-adapter.yml",
  ".github/pull_request_template.md",
  ".github/labels.yml",
  "docs/github-governance.md",
];

const REQUIRED_LABELS = [
  "type:feature",
  "type:bug",
  "type:docs",
  "type:process",
  "type:quality",
  "area:platform",
  "area:verification",
  "area:hooks",
  "area:data",
  "area:release",
  "priority:p0",
  "priority:p1",
  "priority:p2",
];

const WORKFLOW_CONTRACTS = [
  {
    file: ".github/workflows/smoke.yml",
    label: "public smoke workflow",
    patterns: [
      /^name: Public Smoke CI$/m,
      /pull_request:/,
      /push:/,
      /scripts\/github-governance-check\.mjs/,
      /scripts\/release-smoke\.sh --fast/,
      /scripts\/release-smoke\.sh --fast --with-live-cli/,
    ],
    forbidden: [/run:\s*.*--with-live-cli/],
  },
  {
    file: ".github/workflows/docs.yml",
    label: "docs workflow",
    patterns: [
      /^name: Docs Structure CI$/m,
      /pull_request:/,
      /scripts\/docs-structure-check\.mjs/,
      /tests\/lib\/release-doc-contract\.test\.mjs/,
    ],
  },
  {
    file: ".github/workflows/templates.yml",
    label: "templates workflow",
    patterns: [
      /^name: Template Drift CI$/m,
      /pull_request:/,
      /scripts\/release-audit\.mjs --json/,
      /tests\/lib\/render\.test\.mjs/,
      /tests\/agent-all\/templates\/snapshot\.test\.mjs/,
      /tests\/visual-qa\/templates\/snapshot\.test\.mjs/,
      /scripts\/sync-lib\.mjs --check/,
      /scripts\/generate-support-matrix\.mjs --check/,
    ],
  },
];

const ISSUE_TEMPLATE_CONTRACTS = [
  {
    file: ".github/ISSUE_TEMPLATE/feature.yml",
    patterns: [/name: Feature/, /type:feature/, /area:/, /acceptance criteria/i],
  },
  {
    file: ".github/ISSUE_TEMPLATE/platform-bug.yml",
    patterns: [/name: Platform bug/, /type:bug/, /area:platform/, /affected platform/i],
  },
  {
    file: ".github/ISSUE_TEMPLATE/docs-process.yml",
    patterns: [/name: Docs or process/, /type:process/, /type:docs/, /release impact/i],
  },
  {
    file: ".github/ISSUE_TEMPLATE/quality-debt.yml",
    patterns: [/name: Quality debt/, /type:quality/, /quality debt exception/i, /expiry/i],
  },
  {
    file: ".github/ISSUE_TEMPLATE/verification-adapter.yml",
    patterns: [/name: Verification adapter/, /area:verification/, /adapter contract/i],
  },
];

export function buildGithubGovernanceReport(options = {}) {
  const root = resolve(options.root || ROOT);
  const checks = [
    checkRequiredFiles(root),
    checkWorkflowContracts(root),
    checkIssueTemplates(root),
    checkPullRequestTemplate(root),
    checkLabels(root),
    checkGovernanceDocs(root),
  ];

  return {
    ok: checks.every((check) => check.ok),
    root,
    checks,
  };
}

function checkRequiredFiles(root) {
  const missing = REQUIRED_FILES.filter((file) => !existsSync(resolve(root, file)));
  return {
    ok: missing.length === 0,
    name: "GitHub governance files exist",
    details: missing.length === 0 ? `${REQUIRED_FILES.length} files present` : `missing: ${missing.join(", ")}`,
  };
}

function checkWorkflowContracts(root) {
  return checkContracts(root, "public workflow contracts", WORKFLOW_CONTRACTS);
}

function checkIssueTemplates(root) {
  return checkContracts(root, "issue template contracts", ISSUE_TEMPLATE_CONTRACTS);
}

function checkPullRequestTemplate(root) {
  const file = ".github/pull_request_template.md";
  const patterns = [
    /Linked issue/i,
    /Changed capability/i,
    /Affected platforms/i,
    /Verification evidence/i,
    /Quality debt exceptions/i,
    /Docs update/i,
    /Release impact/i,
  ];
  return checkContract(root, "pull request template contract", { file, patterns });
}

function checkLabels(root) {
  const file = ".github/labels.yml";
  if (!existsSync(resolve(root, file))) {
    return { ok: false, name: "label taxonomy contract", details: `${file}: missing` };
  }
  const text = readText(root, file);
  const missing = REQUIRED_LABELS.filter((label) => !new RegExp(`name:\\s*${escapeRegex(label)}\\b`).test(text));
  const documented = REQUIRED_LABELS.filter((label) => new RegExp(`\\b${escapeRegex(label)}\\b`).test(readText(root, "docs/github-governance.md")));
  const missingDocs = REQUIRED_LABELS.filter((label) => !documented.includes(label));
  return {
    ok: missing.length === 0 && missingDocs.length === 0,
    name: "label taxonomy contract",
    details:
      missing.length === 0 && missingDocs.length === 0
        ? `${REQUIRED_LABELS.length} labels documented`
        : [`labels missing from .github/labels.yml: ${missing.join(", ")}`, `labels missing from docs: ${missingDocs.join(", ")}`]
            .filter((line) => !line.endsWith(": "))
            .join("; "),
  };
}

function checkGovernanceDocs(root) {
  const file = "docs/github-governance.md";
  const patterns = [
    /Public PR Smoke CI/,
    /\.github\/workflows\/smoke\.yml/,
    /\.github\/workflows\/docs\.yml/,
    /\.github\/workflows\/templates\.yml/,
    /Local release gate remains authoritative/,
    /issue templates/i,
    /pull request template/i,
    /label taxonomy/i,
  ];
  return checkContract(root, "governance docs contract", { file, patterns });
}

function checkContracts(root, name, contracts) {
  const failures = [];
  for (const contract of contracts) {
    const result = checkContract(root, contract.label || contract.file, contract);
    if (!result.ok) failures.push(result.details);
  }
  return {
    ok: failures.length === 0,
    name,
    details: failures.length === 0 ? `${contracts.length} contracts matched` : failures.join("; "),
  };
}

function checkContract(root, name, contract) {
  const path = resolve(root, contract.file);
  if (!existsSync(path)) return { ok: false, name, details: `${contract.file}: missing` };
  const text = readFileSync(path, "utf-8");
  const missing = (contract.patterns || []).filter((pattern) => !pattern.test(text));
  const forbidden = (contract.forbidden || []).filter((pattern) => pattern.test(text));
  return {
    ok: missing.length === 0 && forbidden.length === 0,
    name,
    details:
      missing.length === 0 && forbidden.length === 0
        ? `${contract.file}: matched`
        : [
            missing.length > 0 ? `${contract.file}: missing ${missing.map(String).join(", ")}` : null,
            forbidden.length > 0 ? `${contract.file}: forbidden ${forbidden.map(String).join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; "),
  };
}

function readText(root, file) {
  const path = resolve(root, file);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printHuman(report) {
  console.log(`github governance check: ${report.ok ? "ok" : "failed"}`);
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
  const report = buildGithubGovernanceReport();
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  process.exit(report.ok ? 0 : 1);
}
