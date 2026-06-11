import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export const QUALITY_DEBT_RULES = {
  fallback: {
    description: "unrequested fallback or silent compatibility path",
    severity: "error",
    action: "requires_justification",
  },
  "debt-marker": {
    description: "TODO/FIXME/HACK/TEMP/XXX marker",
    severity: "error",
    action: "requires_justification",
  },
  suppression: {
    description: "lint/type suppression",
    severity: "error",
    action: "requires_justification",
  },
  "skipped-test": {
    description: "skipped or todo test",
    severity: "error",
    action: "requires_justification",
  },
  "meaningless-test": {
    description: "test assertion that cannot fail for the intended regression",
    severity: "critical",
    action: "deny",
  },
  "assertionless-test": {
    description: "test file contains tests without any assertion-like checks",
    severity: "critical",
    action: "deny",
  },
  "timeout-retry-sleep": {
    description: "timeout/retry/sleep increase that may hide root cause",
    severity: "warning",
    action: "ask_user",
  },
  "broad-catch": {
    description: "broad or silent catch block",
    severity: "error",
    action: "requires_justification",
  },
  "broad-any": {
    description: "broad any/cast usage",
    severity: "error",
    action: "requires_justification",
  },
  "test-only-production": {
    description: "test-only branch in production code",
    severity: "critical",
    action: "deny",
  },
  "debug-only-production": {
    description: "debug-only branch in production code",
    severity: "critical",
    action: "deny",
  },
};

const LINE_RULES = [
  {
    rule: "fallback",
    pattern: /\b(fallback|fall\s+back|falls\s+back|fallbacks)\b/i,
  },
  {
    rule: "debt-marker",
    pattern: /\b(TODO|FIXME|HACK|TEMP|XXX)\b/,
  },
  {
    rule: "suppression",
    pattern: /(@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|noinspection|type:\s*ignore|#\s*type:\s*ignore)/i,
  },
  {
    rule: "skipped-test",
    pattern: /\b(?:it|test|describe)\.(?:skip|todo)\s*\(/,
  },
  {
    rule: "meaningless-test",
    pattern: /(expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)|assert\.(?:ok|equal|strictEqual)\s*\(\s*true\s*(?:,\s*true)?\s*\)|assert\.equal\s*\(\s*1\s*,\s*1\s*\))/,
  },
  {
    rule: "timeout-retry-sleep",
    pattern: /\b(setTimeout|sleep\s*\(|retry|retries|timeout\s*[:=])\b/i,
  },
  {
    rule: "broad-catch",
    pattern: /\bcatch\s*(?:\(\s*(?:e|err|error|_)?\s*\))?\s*\{\s*(?:\/\/.*)?\s*\}/,
  },
  {
    rule: "broad-any",
    pattern: /(:\s*any\b|\bas\s+any\b|<any>)/,
  },
  {
    rule: "test-only-production",
    pattern: /(NODE_ENV\s*={0,2}\s*["']test["']|process\.env\.NODE_ENV\s*={2,3}\s*["']test["']|__TEST__|testOnly|for tests only)/i,
  },
  {
    rule: "debug-only-production",
    pattern: /(__DEBUG__|debugOnly|debug-only|console\.debug\b)/i,
  },
];

const ACTION_RANK = {
  allow: 0,
  warn: 1,
  ask_user: 2,
  requires_justification: 3,
  escalate: 4,
  stop_loop: 5,
  deny: 6,
};

const SEVERITY_RANK = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
    : [];
}

function normalizePolicy(policy = {}) {
  const root = objectOrEmpty(policy);
  const nested = objectOrEmpty(root.qualityDebt);
  return {
    enabled: root.qualityDebt !== false && nested.enabled !== false,
    allowPaths: [
      ...stringArray(root.qualityDebtAllowPaths),
      ...stringArray(nested.allowPaths),
    ],
    allowRules: [
      ...stringArray(root.qualityDebtAllowRules),
      ...stringArray(nested.allowRules),
    ],
    justifications: [
      ...normalizeJustifications(root.qualityDebtJustifications),
      ...normalizeJustifications(nested.justifications),
    ],
    failOn: stringArray(nested.failOn ?? root.qualityDebtFailOn),
    warnOnly: root.qualityDebtWarnOnly === true || nested.warnOnly === true,
  };
}

function normalizeJustifications(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      rule: typeof entry.rule === "string" ? entry.rule : "*",
      path: typeof entry.path === "string" ? entry.path : "*",
      reason: typeof entry.reason === "string" ? entry.reason : "",
      issue: typeof entry.issue === "string" ? entry.issue : "",
      expiry: typeof entry.expiry === "string" ? entry.expiry : "",
    }));
}

function isTestPath(path) {
  return /(^|\/)(__tests__|tests?|specs?)\//i.test(path)
    || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(path)
    || /(^|\/)test-[^/]+\.[cm]?[jt]s$/i.test(path);
}

function isProductionPath(path) {
  if (!path || isTestPath(path)) return false;
  if (/(\.md|\.mdx|\.snap|\.json|\.lock|\.yml|\.yaml)$/i.test(path)) return false;
  if (/(^|\/)(docs|tests?|__tests__|fixtures|scripts)\//i.test(path)) return false;
  return /\.(mjs|cjs|js|jsx|ts|tsx|py|rb|go|rs|java|kt|cs|php)$/i.test(path);
}

function globToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function pathMatches(path, pattern) {
  if (!pattern || pattern === "*") return true;
  const normalized = path.replaceAll("\\", "/");
  const pat = pattern.replaceAll("\\", "/");
  if (pat.endsWith("/**") && normalized.startsWith(pat.slice(0, -3))) return true;
  if (!pat.includes("*")) return normalized === pat || normalized.startsWith(`${pat}/`);
  return globToRegExp(pat).test(normalized);
}

function hasIssueLink(value) {
  return /(?:^|\s)#\d+\b|https:\/\/github\.com\/[^\s|]+\/issues\/\d+\b/i.test(String(value ?? ""));
}

function hasFutureExpiry(value, now = new Date()) {
  const match = String(value ?? "").match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!match) return false;
  const expiry = new Date(`${match[1]}T23:59:59Z`);
  return Number.isFinite(expiry.getTime()) && expiry >= now;
}

function exceptionRows(taskDocText = "") {
  const sectionMatch = String(taskDocText).match(/## Quality Debt Exceptions\b([\s\S]*?)(?:\n## |\s*$)/i);
  if (!sectionMatch) return [];
  return sectionMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !/^\|\s*Item\s*\|/i.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter(Boolean))
    .filter((cells) => cells.length >= 5);
}

function taskDocJustifies(finding, taskDocText, now) {
  for (const cells of exceptionRows(taskDocText)) {
    const [item, reason, owner, issue, expiry] = cells;
    const haystack = `${item} ${reason} ${owner}`;
    const mentionsFinding = haystack.includes(finding.rule)
      || haystack.includes(finding.file)
      || haystack.includes(finding.kind);
    if (mentionsFinding && hasIssueLink(issue) && hasFutureExpiry(expiry, now)) return true;
  }
  return false;
}

function explicitJustificationMatches(finding, justifications, now) {
  return justifications.some((entry) => {
    const ruleMatches = entry.rule === "*" || entry.rule === finding.rule;
    const pathMatch = pathMatches(finding.file, entry.path);
    return ruleMatches
      && pathMatch
      && hasIssueLink(entry.issue)
      && hasFutureExpiry(entry.expiry, now)
      && entry.reason.trim().length > 0;
  });
}

function readChangedFile({ cwd, path, fileContents }) {
  if (Object.prototype.hasOwnProperty.call(fileContents, path)) {
    return String(fileContents[path] ?? "");
  }
  const abs = resolve(cwd, path);
  const rel = relative(cwd, abs);
  if (rel.startsWith("..") || rel === "" || rel.startsWith("/")) return null;
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
}

function excerpt(line) {
  return String(line ?? "").trim().slice(0, 180);
}

function makeFinding({ rule, file, line, lineText }) {
  const spec = QUALITY_DEBT_RULES[rule] ?? {
    description: rule,
    severity: "warning",
    action: "warn",
  };
  return {
    rule,
    kind: spec.description,
    action: spec.action,
    severity: spec.severity,
    file,
    line,
    excerpt: excerpt(lineText),
    reason: `${spec.description} in ${file}${line ? `:${line}` : ""}`,
  };
}

function lineFindings({ file, content }) {
  const findings = [];
  const production = isProductionPath(file);
  const lines = String(content).split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const { rule, pattern } of LINE_RULES) {
      if ((rule === "test-only-production" || rule === "debug-only-production") && !production) continue;
      if (pattern.test(lineText)) {
        findings.push(makeFinding({ rule, file, line: index + 1, lineText }));
      }
    }
  });
  return findings;
}

function fileFindings({ file, content }) {
  if (!isTestPath(file)) return [];
  const body = String(content);
  if (!/\b(?:test|it)\s*\(/.test(body)) return [];
  if (/\b(?:expect|assert|t\.|should|sinon\.assert)\b/.test(body)) return [];
  return [makeFinding({
    rule: "assertionless-test",
    file,
    line: 1,
    lineText: "test file contains test()/it() but no assertion-like call",
  })];
}

function classifyFinding(finding, { cfg, taskDocText, now }) {
  if (cfg.allowRules.includes(finding.rule)) return { ...finding, allowed: true, allowReason: "rule allowlist" };
  if (cfg.allowPaths.some((pattern) => pathMatches(finding.file, pattern))) {
    return { ...finding, allowed: true, allowReason: "path allowlist" };
  }
  if (explicitJustificationMatches(finding, cfg.justifications, now)) {
    return { ...finding, allowed: true, allowReason: "policy justification" };
  }
  if (taskDocJustifies(finding, taskDocText, now)) {
    return { ...finding, allowed: true, allowReason: "task Quality Debt Exceptions" };
  }
  if (cfg.warnOnly) return { ...finding, action: "warn", severity: "warning" };
  if (cfg.failOn.length > 0 && !cfg.failOn.includes(finding.rule)) {
    return { ...finding, action: "warn", severity: "warning" };
  }
  return finding;
}

export function summarizeQualityDebtFindings(findings = []) {
  return findings.reduce((summary, finding) => {
    const actionRank = ACTION_RANK[finding.action] ?? 0;
    const severityRank = SEVERITY_RANK[finding.severity] ?? 0;
    return {
      action: actionRank > (ACTION_RANK[summary.action] ?? 0) ? finding.action : summary.action,
      severity: severityRank > (SEVERITY_RANK[summary.severity] ?? 0) ? finding.severity : summary.severity,
      count: summary.count + 1,
    };
  }, { action: "allow", severity: "info", count: 0 });
}

export function scanQualityDebtFiles({
  cwd = process.cwd(),
  files = [],
  fileContents = {},
  taskDocText = "",
  policy = {},
  now = new Date(),
} = {}) {
  const cfg = normalizePolicy(policy);
  if (!cfg.enabled) {
    return {
      enabled: false,
      findings: [],
      allowedFindings: [],
      summary: { action: "allow", severity: "info", count: 0 },
    };
  }

  const normalizedFiles = [...new Set(stringArray(files).map((file) => file.replaceAll("\\", "/")))];
  const classified = [];
  for (const file of normalizedFiles) {
    const content = readChangedFile({ cwd, path: file, fileContents: objectOrEmpty(fileContents) });
    if (content == null) continue;
    for (const finding of [...lineFindings({ file, content }), ...fileFindings({ file, content })]) {
      classified.push(classifyFinding(finding, { cfg, taskDocText, now }));
    }
  }

  const findings = classified.filter((finding) => !finding.allowed);
  const allowedFindings = classified.filter((finding) => finding.allowed);
  return {
    enabled: true,
    findings,
    allowedFindings,
    summary: summarizeQualityDebtFindings(findings),
  };
}
