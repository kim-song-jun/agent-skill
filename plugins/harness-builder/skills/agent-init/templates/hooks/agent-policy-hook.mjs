#!/usr/bin/env node
// PreToolUse hook for Bash. Blocks high-risk shell commands and enforces
// pathspec commits from inside a generated project .claude/hooks/ directory.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const GIT_GLOBAL_OPTIONS_WITH_VALUES = new Set([
  "-C",
  "-c",
  "--config-env",
  "--exec-path",
  "--git-dir",
  "--namespace",
  "--work-tree",
]);

const GIT_GLOBAL_OPTIONS_WITH_INLINE_VALUES = ["-C", "--git-dir=", "--work-tree="];

const GIT_GLOBAL_OPTIONS_WITHOUT_VALUES = new Set([
  "--bare",
  "--help",
  "--html-path",
  "--info-path",
  "--literal-pathspecs",
  "--man-path",
  "--no-literal-pathspecs",
  "--no-optional-locks",
  "--no-pager",
  "--no-replace-objects",
  "--paginate",
  "--version",
]);

const COMMIT_LONG_OPTIONS_WITH_VALUES = new Set([
  "--author",
  "--cleanup",
  "--date",
  "--file",
  "--fixup",
  "--message",
  "--pathspec-from-file",
  "--reedit-message",
  "--reuse-message",
  "--squash",
  "--template",
  "--trailer",
  "--untracked-files",
]);

const COMMIT_SHORT_OPTIONS_WITH_VALUES = new Set(["C", "F", "c", "m", "t"]);

const IMPLEMENTER_DIRECTIVE = `\n\n---\nDecision-Surfacing Protocol\nBefore implementation, identify unresolved product/API/data/UX decisions. If decisions are needed, report them before editing. Before reporting STATUS: DONE, run verification and include a literal verification_passed line.\n`;

const REVIEWER_DIRECTIVE = `\n\n---\nAt the END of your review, output one literal line:\n\`VERIFICATION_AUDIT: passed\` if verification evidence is present and acceptable,\n\`VERIFICATION_AUDIT: failed\` if verification evidence is missing or failed,\n\`VERIFICATION_AUDIT: skipped\` only if verification is not applicable.\n`;

const QA_DIRECTIVE = `\n\n---\nYou are the QA team. Audit the user-side flow, not tech-stack correctness.\n\nAt the END of your review, output one literal line:\n\`QA_AUDIT: passed\` if the user-facing flow holds up,\n\`QA_AUDIT: failed\` if it does not,\n\`QA_AUDIT: skipped\` only if no user-visible change exists.\n`;

const COORDINATOR_DIRECTIVE = `\n\n---\nYou are the orchestration gate. Inspect shared files, HOT-file ownership, retry sequencing, and pathspec commit risk before reviewer dispatch.\n\nAt the END of your review, output one literal line:\n\`ORCHESTRATION_AUDIT: passed\` if ownership and sequencing are safe,\n\`ORCHESTRATION_AUDIT: failed\` if there is a blocking coordination risk,\n\`ORCHESTRATION_AUDIT: skipped\` only if orchestration review is not applicable.\n`;

const POLICY_EVENT_SCHEMA_VERSION = "agent-policy-event/v1";
const POLICY_RESULT_SCHEMA_VERSION = "agent-policy-result/v1";

function hookErrorDetail(error) {
  return error instanceof Error && error.message ? `: ${error.message}` : "";
}

function warnPolicyHook(message, error) {
  console.error(`agent-policy-hook warning: ${message}${hookErrorDetail(error)}`);
}

function failPolicyHook(message, error) {
  console.error(`agent-policy-hook error: ${message}${hookErrorDetail(error)}`);
  process.exit(2);
}

function shellTokens(command) {
  const tokens = [];
  let token = "";
  let quote = null;
  let escaped = false;
  let hasToken = false;

  const pushToken = () => {
    if (!hasToken) return;
    tokens.push(token);
    token = "";
    hasToken = false;
  };

  const pushOperator = (operator) => {
    pushToken();
    tokens.push(operator);
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaped) {
      token += char;
      hasToken = true;
      escaped = false;
      continue;
    }

    if (quote) {
      if (quote === '"' && char === "\\") {
        escaped = true;
        hasToken = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        hasToken = true;
        continue;
      }
      token += char;
      hasToken = true;
      continue;
    }

    if (char === "\\") {
      // Backslash-newline is a line continuation: drop both characters so the
      // lines join, instead of emitting a literal newline token. A literal
      // "\n" token is treated as a command boundary, which would split a
      // multi-line `git commit ... -- <pathspec>` and wrongly block it.
      if (command[index + 1] === "\n") { index += 1; continue; }
      if (command[index + 1] === "\r" && command[index + 2] === "\n") { index += 2; continue; }
      if (command[index + 1] === "\r") { index += 1; continue; }
      escaped = true;
      hasToken = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === ";") {
      pushOperator(char);
      continue;
    }

    if (char === "\n" || char === "\r") {
      pushOperator("\n");
      if (char === "\r" && command[index + 1] === "\n") index += 1;
      continue;
    }

    if (/\s/.test(char)) {
      pushToken();
      continue;
    }

    if ((char === "&" || char === "|") && command[index + 1] === char) {
      pushOperator(`${char}${char}`);
      index += 1;
      continue;
    }

    if (char === "|" || char === "&") {
      pushOperator(char);
      continue;
    }

    token += char;
    hasToken = true;
  }

  if (escaped) token += "\\";
  pushToken();
  return tokens;
}

function isCommandBoundary(token) {
  return token === "&&" || token === "||" || token === ";" || token === "\n" || token === "|" || token === "&";
}

function isAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function commandSegments(tokens) {
  const segments = [];
  let start = 0;
  for (let index = 0; index <= tokens.length; index += 1) {
    if (index < tokens.length && !isCommandBoundary(tokens[index])) continue;
    if (start < index) segments.push({ start, end: index });
    start = index + 1;
  }
  return segments;
}

function commandStart(tokens, segment) {
  let cursor = segment.start;
  while (cursor < segment.end && isAssignment(tokens[cursor])) cursor += 1;
  return cursor < segment.end ? cursor : null;
}

function isGitGlobalOptionWithInlineValue(token) {
  return GIT_GLOBAL_OPTIONS_WITH_INLINE_VALUES.some((option) => token.startsWith(option) && token !== option);
}

function parseGitInvocation(tokens, gitIndex, end) {
  let cursor = gitIndex + 1;
  while (cursor < end) {
    const token = tokens[cursor];
    if (GIT_GLOBAL_OPTIONS_WITH_VALUES.has(token)) {
      cursor += 2;
      continue;
    }
    if (isGitGlobalOptionWithInlineValue(token) || GIT_GLOBAL_OPTIONS_WITHOUT_VALUES.has(token)) {
      cursor += 1;
      continue;
    }
    if (token.startsWith("--") && token.includes("=")) {
      cursor += 1;
      continue;
    }
    if (token.startsWith("-")) {
      cursor += 1;
      continue;
    }
    return { subcommand: token, argsStart: cursor + 1, end };
  }
  return null;
}

function hasTokenBeforePathspec(tokens, start, end, predicate) {
  for (let cursor = start; cursor < end; cursor += 1) {
    if (tokens[cursor] === "--") break;
    if (predicate(tokens[cursor])) return true;
  }
  return false;
}

function inspectShortCommitOptionToken(token) {
  if (!token.startsWith("-") || token.startsWith("--")) return { all: false, skipNext: false };

  for (let cursor = 1; cursor < token.length; cursor += 1) {
    const option = token[cursor];
    if (option === "a") return { all: true, skipNext: false };
    if (option === "S" && cursor < token.length - 1) return { all: false, skipNext: false };
    if (COMMIT_SHORT_OPTIONS_WITH_VALUES.has(option)) {
      return { all: false, skipNext: cursor === token.length - 1 };
    }
  }

  return { all: false, skipNext: false };
}

function inspectCommitArgs(tokens, start, end) {
  const result = { all: false, amend: false, hasPathspec: false };

  for (let cursor = start; cursor < end; cursor += 1) {
    const token = tokens[cursor];
    if (token === "--") {
      result.hasPathspec = cursor + 1 < end;
      break;
    }
    if (token === "--all") {
      result.all = true;
      continue;
    }
    if (token === "--amend") {
      result.amend = true;
      continue;
    }
    if (COMMIT_LONG_OPTIONS_WITH_VALUES.has(token)) {
      cursor += 1;
      continue;
    }
    if ([...COMMIT_LONG_OPTIONS_WITH_VALUES].some((option) => token.startsWith(`${option}=`))) {
      continue;
    }

    const shortOptions = inspectShortCommitOptionToken(token);
    if (shortOptions.all) result.all = true;
    if (shortOptions.skipNext) cursor += 1;
  }

  return result;
}

function analyzeGitInvocation(tokens, invocation) {
  switch (invocation.subcommand) {
    case "add":
      if (hasTokenBeforePathspec(tokens, invocation.argsStart, invocation.end, (token) => token === "-A" || token === "--all")) {
        return { blocked: true, reason: "git add -A" };
      }
      break;
    case "commit": {
      const args = inspectCommitArgs(tokens, invocation.argsStart, invocation.end);
      if (args.all) return { blocked: true, reason: "git commit -a" };
      if (args.amend) return { blocked: true, reason: "git commit --amend" };
      if (!args.hasPathspec) return { blocked: true, reason: "git commit requires explicit pathspec after --" };
      break;
    }
    case "push":
      if (
        hasTokenBeforePathspec(
          tokens,
          invocation.argsStart,
          invocation.end,
          (token) => token === "--force" || token === "--force-with-lease" || token.startsWith("--force-with-lease="),
        )
      ) {
        return { blocked: true, reason: "git push --force" };
      }
      break;
    case "reset":
      if (hasTokenBeforePathspec(tokens, invocation.argsStart, invocation.end, (token) => token === "--hard")) {
        return { blocked: true, reason: "git reset --hard" };
      }
      break;
    case "checkout":
      for (let cursor = invocation.argsStart; cursor < invocation.end - 1; cursor += 1) {
        if (tokens[cursor] === "--") return { blocked: true, reason: "git checkout --" };
      }
      break;
    default:
      break;
  }

  return null;
}

function matchesConfiguredCommand(text, pattern) {
  return typeof pattern === "string" && pattern.length > 0 && text.includes(pattern);
}

function commandHasConfirmFlag(tokens, flag) {
  const text = typeof flag === "string" ? flag : "";
  if (!text) return false;
  return tokens.some((token) => token === text || token.startsWith(`${text}=`));
}

function analyzeShellCommand(command, options = {}) {
  const text = String(command || "");
  const tokens = shellTokens(text);
  const { destructiveCommands = [], destructiveConfirmFlags = [] } = options || {};

  for (const pattern of destructiveCommands) {
    if (matchesConfiguredCommand(text, pattern)) {
      return { blocked: true, reason: `destructive command pattern: ${pattern}` };
    }
  }

  for (const flag of destructiveConfirmFlags) {
    if (commandHasConfirmFlag(tokens, flag)) {
      return { blocked: true, reason: `destructive confirmation flag: ${flag}` };
    }
  }

  for (const segment of commandSegments(tokens)) {
    const start = commandStart(tokens, segment);
    if (start === null) continue;

    if (tokens[start] === "git") {
      const result = parseGitInvocation(tokens, start, segment.end);
      if (!result) continue;
      const gitResult = analyzeGitInvocation(tokens, result);
      if (gitResult) return gitResult;
      continue;
    }

    if (tokens[start] === "docker" && tokens[start + 1] === "volume" && tokens[start + 2] === "rm") {
      return { blocked: true, reason: "docker volume rm" };
    }
  }

  return { blocked: false, reason: null };
}

const QUALITY_DEBT_RULES = {
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

const QUALITY_DEBT_LINE_RULES = [
  { rule: "fallback", pattern: /\b(fallback|fall\s+back|falls\s+back|fallbacks)\b/i },
  { rule: "debt-marker", pattern: /\b(TODO|FIXME|HACK|TEMP|XXX)\b/ },
  { rule: "suppression", pattern: /(@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|noinspection|type:\s*ignore|#\s*type:\s*ignore)/i },
  { rule: "skipped-test", pattern: /\b(?:it|test|describe)\.(?:skip|todo)\s*\(/ },
  { rule: "meaningless-test", pattern: /(expect\s*\(\s*true\s*\)\s*\.\s*toBe\s*\(\s*true\s*\)|assert\.(?:ok|equal|strictEqual)\s*\(\s*true\s*(?:,\s*true)?\s*\)|assert\.equal\s*\(\s*1\s*,\s*1\s*\))/ },
  { rule: "timeout-retry-sleep", pattern: /\b(setTimeout|sleep\s*\(|retry|retries|timeout\s*[:=])\b/i },
  { rule: "broad-catch", pattern: /\bcatch\s*(?:\(\s*(?:e|err|error|_)?\s*\))?\s*\{\s*(?:\/\/.*)?\s*\}/ },
  { rule: "broad-any", pattern: /(:\s*any\b|\bas\s+any\b|<any>)/ },
  { rule: "test-only-production", pattern: /(NODE_ENV\s*={0,2}\s*["']test["']|process\.env\.NODE_ENV\s*={2,3}\s*["']test["']|__TEST__|testOnly|for tests only)/i },
  { rule: "debug-only-production", pattern: /(__DEBUG__|debugOnly|debug-only|console\.debug\b)/i },
];

const QUALITY_DEBT_ACTION_RANK = {
  allow: 0,
  warn: 1,
  ask_user: 2,
  requires_justification: 3,
  escalate: 4,
  stop_loop: 5,
  deny: 6,
};

const QUALITY_DEBT_SEVERITY_RANK = {
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

function normalizeQualityDebtPolicy(policy = {}) {
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

function safeProjectPath(root, rawPath) {
  const abs = resolve(root, String(rawPath || ""));
  const rel = relative(root, abs);
  if (rel === "" || rel.startsWith("..") || rel.startsWith("/")) return null;
  return abs;
}

function readProjectText(root, rawPath) {
  const abs = safeProjectPath(root, rawPath);
  if (!abs || !existsSync(abs)) return null;
  try {
    if (!statSync(abs).isFile()) return null;
    return readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
}

function readChangedFile({ root, path, fileContents }) {
  if (Object.prototype.hasOwnProperty.call(fileContents, path)) {
    return String(fileContents[path] ?? "");
  }
  return readProjectText(root, path);
}

function excerpt(line) {
  return String(line ?? "").trim().slice(0, 180);
}

function makeQualityDebtFinding({ rule, file, line, lineText }) {
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

function lineQualityDebtFindings({ file, content }) {
  const findings = [];
  const production = isProductionPath(file);
  const lines = String(content).split(/\r?\n/);
  lines.forEach((lineText, index) => {
    for (const { rule, pattern } of QUALITY_DEBT_LINE_RULES) {
      if ((rule === "test-only-production" || rule === "debug-only-production") && !production) continue;
      if (pattern.test(lineText)) {
        findings.push(makeQualityDebtFinding({ rule, file, line: index + 1, lineText }));
      }
    }
  });
  return findings;
}

function fileQualityDebtFindings({ file, content }) {
  if (!isTestPath(file)) return [];
  const body = String(content);
  if (!/\b(?:test|it)\s*\(/.test(body)) return [];
  if (/\b(?:expect|assert|t\.|should|sinon\.assert)\b/.test(body)) return [];
  return [makeQualityDebtFinding({
    rule: "assertionless-test",
    file,
    line: 1,
    lineText: "test file contains test()/it() but no assertion-like call",
  })];
}

function classifyQualityDebtFinding(finding, { cfg, taskDocText, now }) {
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

function summarizeQualityDebtFindings(findings = []) {
  return findings.reduce((summary, finding) => {
    const actionRank = QUALITY_DEBT_ACTION_RANK[finding.action] ?? 0;
    const severityRank = QUALITY_DEBT_SEVERITY_RANK[finding.severity] ?? 0;
    return {
      action: actionRank > (QUALITY_DEBT_ACTION_RANK[summary.action] ?? 0) ? finding.action : summary.action,
      severity: severityRank > (QUALITY_DEBT_SEVERITY_RANK[summary.severity] ?? 0) ? finding.severity : summary.severity,
      count: summary.count + 1,
    };
  }, { action: "allow", severity: "info", count: 0 });
}

function scanQualityDebtFiles({
  root = projectDir(),
  files = [],
  fileContents = {},
  taskDocText = "",
  policy = {},
  now = new Date(),
} = {}) {
  const cfg = normalizeQualityDebtPolicy(policy);
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
    const content = readChangedFile({ root, path: file, fileContents: objectOrEmpty(fileContents) });
    if (content == null) continue;
    for (const finding of [
      ...lineQualityDebtFindings({ file, content }),
      ...fileQualityDebtFindings({ file, content }),
    ]) {
      classified.push(classifyQualityDebtFinding(finding, { cfg, taskDocText, now }));
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

function activeTaskPathFromIndex(indexText = "") {
  const activeMatch = String(indexText).match(/## Active\b([\s\S]*?)(?:\n## |\s*$)/i);
  if (!activeMatch) return null;
  const body = activeMatch[1];
  const link = body.match(/\[[^\]]*]\(([^)\s]+\.md)(?:#[^)]+)?\)/);
  if (link) return link[1];
  const bare = body.match(/(?:\.agent-skill\/tasks|docs\/tasks)\/[^\s`'")]+\.md/);
  return bare ? bare[0] : null;
}

function taskDocTextForPayload(payload = {}) {
  const direct = payload.taskDocText ?? payload.task_doc_text;
  if (typeof direct === "string" && direct.trim()) return direct;

  const root = projectDir();
  const envTaskPath = process.env.AGENT_SKILL_TASK_DOC || process.env.AGENT_ALL_TASK_DOC || process.env.AGENT_TASK_DOC;
  if (envTaskPath) {
    const text = readProjectText(root, envTaskPath);
    if (text) return text;
  }

  const stateText = readProjectText(root, ".agent-all-state.json");
  if (stateText) {
    try {
      const state = JSON.parse(stateText);
      const stateTaskPath = state?.task?.path ?? state?.taskPath ?? state?.task?.taskPath;
      if (typeof stateTaskPath === "string") {
        const text = readProjectText(root, stateTaskPath);
        if (text) return text;
      }
    } catch (error) {
      warnPolicyHook("ignoring invalid .agent-all-state.json", error);
    }
  }

  const indexText = readProjectText(root, ".agent-skill/tasks/index.md")
    ?? readProjectText(root, "docs/tasks/index.md");
  const indexTaskPath = indexText ? activeTaskPathFromIndex(indexText) : null;
  return indexTaskPath ? readProjectText(root, indexTaskPath) ?? "" : "";
}

function commitPathspecsFromCommand(command) {
  const tokens = shellTokens(String(command || ""));
  for (const segment of commandSegments(tokens)) {
    const start = commandStart(tokens, segment);
    if (start === null || tokens[start] !== "git") continue;
    const invocation = parseGitInvocation(tokens, start, segment.end);
    if (invocation?.subcommand !== "commit") continue;
    let marker = -1;
    for (let cursor = invocation.argsStart; cursor < invocation.end; cursor += 1) {
      if (tokens[cursor] === "--") {
        marker = cursor;
        break;
      }
    }
    if (marker < 0 || marker >= invocation.end - 1) return [];
    return tokens.slice(marker + 1, invocation.end).filter((token) => token && token !== "--");
  }
  return [];
}

function gitFiles(args, root) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function walkFiles(root, rawPath, output) {
  const abs = safeProjectPath(root, rawPath);
  if (!abs || !existsSync(abs)) return;
  const rel = relative(root, abs).replaceAll("\\", "/");
  if (/(^|\/)(\.git|node_modules)\b/.test(rel)) return;
  let stat = null;
  try {
    stat = statSync(abs);
  } catch {
    return;
  }
  if (stat.isFile()) {
    output.push(rel);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(abs)) {
    walkFiles(root, join(rel, entry), output);
  }
}

function changedFilesForCommitCommand(command) {
  const pathspecs = commitPathspecsFromCommand(command);
  if (pathspecs.length === 0) return [];
  const root = projectDir();
  const gitPathspec = ["--", ...pathspecs];
  const files = [
    ...gitFiles(["diff", "--name-only", ...gitPathspec], root),
    ...gitFiles(["diff", "--cached", "--name-only", ...gitPathspec], root),
    ...gitFiles(["ls-files", "--others", "--exclude-standard", ...gitPathspec], root),
  ].map((file) => file.replaceAll("\\", "/"));
  if (files.length > 0) return [...new Set(files)].sort();

  const fallback = [];
  for (const pathspec of pathspecs) walkFiles(root, pathspec, fallback);
  return [...new Set(fallback)].sort();
}

function changedFilesFromPayload(payload = {}) {
  return [
    ...new Set([
      ...stringArray(payload.changedFiles),
      ...stringArray(payload.changed_files),
      ...stringArray(payload.files),
    ]),
  ];
}

function qualityDebtScanForFiles(files, payload, options) {
  const contentFiles = Object.keys(objectOrEmpty(payload?.fileContents));
  const scanFiles = files.length > 0 ? files : contentFiles;
  if (scanFiles.length === 0) return null;
  return scanQualityDebtFiles({
    root: projectDir(),
    files: scanFiles,
    fileContents: payload?.fileContents,
    taskDocText: taskDocTextForPayload(payload),
    policy: options,
  });
}

function qualityDebtResultFromScan(scan) {
  if (!scan?.findings?.length) return null;
  const first = scan.findings[0];
  const reason = scan.findings.length === 1
    ? first.reason
    : `${scan.findings.length} quality debt findings require review; first: ${first.reason}`;
  return policyResult({
    policyId: "quality-debt-gate",
    action: scan.summary.action,
    severity: scan.summary.severity,
    reason,
    nextAction: "Remove the debt, or record a Quality Debt Exceptions row with reason, owner, follow-up issue, and expiry.",
    details: {
      findings: scan.findings.slice(0, 25),
      allowedFindings: scan.allowedFindings.slice(0, 25),
    },
  });
}

function loadPolicyOptionsFromFile(projectDir, fileName) {
  let parsed = {};
  try {
    parsed = JSON.parse(readFileSync(join(projectDir, fileName), "utf-8"));
  } catch {
    return { destructiveCommands: [], destructiveConfirmFlags: [] };
  }

  const policy = parsed?.policy && typeof parsed.policy === "object" ? parsed.policy : {};
  return {
    destructiveCommands: [
      ...stringArray(policy.destructiveCommands),
      ...stringArray(parsed?.destructiveCommands),
    ],
    destructiveConfirmFlags: [
      ...stringArray(policy.destructiveConfirmFlags),
      ...stringArray(parsed?.destructiveConfirmFlags),
    ],
    qualityDebt: policy.qualityDebt ?? parsed?.qualityDebt,
    qualityDebtAllowPaths: [
      ...stringArray(policy.qualityDebtAllowPaths),
      ...stringArray(parsed?.qualityDebtAllowPaths),
    ],
    qualityDebtAllowRules: [
      ...stringArray(policy.qualityDebtAllowRules),
      ...stringArray(parsed?.qualityDebtAllowRules),
    ],
    qualityDebtJustifications: [
      ...normalizeJustifications(policy.qualityDebtJustifications),
      ...normalizeJustifications(parsed?.qualityDebtJustifications),
    ],
    qualityDebtFailOn: stringArray(policy.qualityDebtFailOn ?? parsed?.qualityDebtFailOn),
    qualityDebtWarnOnly: policy.qualityDebtWarnOnly === true || parsed?.qualityDebtWarnOnly === true,
  };
}

function loadPolicyOptions() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const options = {
    destructiveCommands: [],
    destructiveConfirmFlags: [],
    qualityDebt: true,
    qualityDebtAllowPaths: [],
    qualityDebtAllowRules: [],
    qualityDebtJustifications: [],
    qualityDebtFailOn: [],
    qualityDebtWarnOnly: false,
  };

  for (const fileName of [".agent-all.json", ".agent-skill/policy.json", ".agent-policy.json"]) {
    const fileOptions = loadPolicyOptionsFromFile(projectDir, fileName);
    options.destructiveCommands.push(...fileOptions.destructiveCommands);
    options.destructiveConfirmFlags.push(...fileOptions.destructiveConfirmFlags);
    if (fileOptions.qualityDebt !== undefined) options.qualityDebt = fileOptions.qualityDebt;
    options.qualityDebtAllowPaths.push(...stringArray(fileOptions.qualityDebtAllowPaths));
    options.qualityDebtAllowRules.push(...stringArray(fileOptions.qualityDebtAllowRules));
    options.qualityDebtJustifications.push(...normalizeJustifications(fileOptions.qualityDebtJustifications));
    options.qualityDebtFailOn.push(...stringArray(fileOptions.qualityDebtFailOn));
    options.qualityDebtWarnOnly = options.qualityDebtWarnOnly || fileOptions.qualityDebtWarnOnly === true;
  }

  return options;
}

function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function policyRunId() {
  return process.env.AGENT_SKILL_RUN_ID || process.env.AGENT_ALL_RUN_ID || "default";
}

function sanitizeRunId(runId) {
  return String(runId || "default").replace(/[^A-Za-z0-9._-]/g, "-") || "default";
}

function policyLogPath(runId) {
  return join(projectDir(), ".agent-skill", "runs", sanitizeRunId(runId), "policy-log.jsonl");
}

function policyResult({ policyId, action = "allow", severity = "info", reason = "allowed", nextAction = null, details = null }) {
  return {
    schemaVersion: POLICY_RESULT_SCHEMA_VERSION,
    policyId,
    action,
    severity,
    reason,
    patch: null,
    nextAction,
    details,
  };
}

function summarizePolicyResults(results) {
  const actionRank = {
    allow: 0,
    warn: 1,
    rewrite_prompt: 2,
    ask_user: 3,
    requires_justification: 4,
    escalate: 5,
    stop_loop: 6,
    deny: 7,
  };
  const severityRank = { info: 0, warning: 1, error: 2, critical: 3 };
  return results.reduce((summary, result) => ({
    action: actionRank[result.action] > actionRank[summary.action] ? result.action : summary.action,
    severity: severityRank[result.severity] > severityRank[summary.severity] ? result.severity : summary.severity,
    ok: summary.ok
      && result.action !== "deny"
      && result.action !== "stop_loop"
      && result.action !== "ask_user"
      && result.action !== "requires_justification",
  }), { action: "allow", severity: "info", ok: true });
}

function appendPolicyAudit(event, results, summary) {
  const path = policyLogPath(event.runId);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    event: event.event,
    platform: event.platform,
    runId: event.runId,
    displayId: event.displayId ?? null,
    toolName: event.toolName ?? null,
    agent: event.agent ?? null,
    action: summary.action,
    severity: summary.severity,
    results,
    payloadKeys: Object.keys(event.payload ?? {}).sort(),
  })}\n`);
  return path;
}

function evaluateEmbeddedPolicyEvent(rawEvent) {
  const event = {
    schemaVersion: POLICY_EVENT_SCHEMA_VERSION,
    platform: rawEvent.platform || "claude",
    runId: rawEvent.runId || policyRunId(),
    event: rawEvent.event,
    toolName: rawEvent.toolName ?? null,
    displayId: rawEvent.displayId ?? null,
    agent: rawEvent.agent ?? null,
    payload: rawEvent.payload ?? {},
  };
  const results = [];

  const analysis = event.payload.commandAnalysis;
  if (analysis?.blocked) {
    const reason = String(analysis.reason || "blocked command");
    results.push(policyResult({
      policyId: /commit requires explicit pathspec/i.test(reason) ? "commit-without-pathspec" : "hard-blocked-command",
      action: "deny",
      severity: "critical",
      reason,
      nextAction: /commit requires explicit pathspec/i.test(reason)
        ? "Retry the commit with explicit pathspecs after `--`."
        : "Change the command or ask the user for an explicit override.",
    }));
  }

  const qualityDebtResult = qualityDebtResultFromScan(event.payload.qualityDebtScan);
  if (qualityDebtResult) results.push(qualityDebtResult);

  if (event.event === "BeforeAgentSpawn") {
    if (!event.agent?.role) {
      results.push(policyResult({
        policyId: "dynamic-agent-spawn-role",
        action: "deny",
        severity: "critical",
        reason: "dynamic agent spawn missing role",
      }));
    }
    if (!event.agent?.reason) {
      results.push(policyResult({
        policyId: "dynamic-agent-spawn-reason",
        action: "deny",
        severity: "critical",
        reason: "dynamic agent spawn missing reason",
      }));
    }
    if (event.agent?.budgetImpactUSD === undefined || event.agent?.budgetImpactUSD === null) {
      results.push(policyResult({
        policyId: "dynamic-agent-spawn-budget",
        action: "deny",
        severity: "critical",
        reason: "dynamic agent spawn missing budget impact",
      }));
    }
  }

  if (event.event === "AfterAgentReturn") {
    const text = String(event.payload.resultText ?? "");
    const role = event.agent?.role;
    if (role === "implementer" && !validateVerificationReport(text)) {
      results.push(policyResult({
        policyId: "missing-verification-token",
        action: "deny",
        severity: "critical",
        reason: "Implementer must include verification_passed before reporting STATUS: DONE.",
      }));
    }
    if (role === "coordinator" && !validateAuditToken(text, "ORCHESTRATION_AUDIT")) {
      results.push(policyResult({
        policyId: "missing-coordinator-audit-token",
        action: "deny",
        severity: "critical",
        reason: "Coordinator must include ORCHESTRATION_AUDIT: passed|failed|skipped.",
      }));
    }
    if (role === "qa" && !validateAuditToken(text, "QA_AUDIT")) {
      results.push(policyResult({
        policyId: "missing-qa-audit-token",
        action: "deny",
        severity: "critical",
        reason: "QA reviewer must include QA_AUDIT: passed|failed|skipped.",
      }));
    }
    if (role === "reviewer" && !validateAuditToken(text, "VERIFICATION_AUDIT")) {
      results.push(policyResult({
        policyId: "missing-reviewer-audit-token",
        action: "deny",
        severity: "critical",
        reason: "Reviewer must include VERIFICATION_AUDIT: passed|failed|skipped.",
      }));
    }
  }

  if (results.length === 0) {
    results.push(policyResult({ policyId: "default-allow", reason: "no policy violations" }));
  }
  const summary = summarizePolicyResults(results);
  const auditPath = process.env.AGENT_POLICY_AUDIT === "0" ? null : appendPolicyAudit(event, results, summary);
  return { ...summary, event, results, auditPath };
}

function firstBlockingReason(policyVerdict) {
  return policyVerdict.results.find((result) => [
    "deny",
    "stop_loop",
    "ask_user",
    "requires_justification",
  ].includes(result.action))?.reason;
}

function taskParams(payload) {
  if (payload?.parameters && typeof payload.parameters === "object") return payload.parameters;
  if (payload?.tool_input && typeof payload.tool_input === "object") return payload.tool_input;
  if (payload?.toolInput && typeof payload.toolInput === "object") return payload.toolInput;
  return {};
}

function setTaskParams(payload, params) {
  if (payload?.parameters && typeof payload.parameters === "object") payload.parameters = params;
  else if (payload?.tool_input && typeof payload.tool_input === "object") payload.tool_input = params;
  else if (payload?.toolInput && typeof payload.toolInput === "object") payload.toolInput = params;
  else payload.parameters = params;
  return payload;
}

function toolName(payload) {
  return payload?.tool ?? payload?.tool_name ?? payload?.toolName;
}

function isTaskPayload(payload) {
  return toolName(payload) === "Task";
}

function isImplementerDispatch(params) {
  return typeof params?.description === "string" && /^implement task\b/i.test(params.description);
}

function isQaReviewerDispatch(params) {
  return typeof params?.description === "string" && /^qa review task\b/i.test(params.description);
}

function isCoordinatorDispatch(params) {
  return typeof params?.description === "string" && /^orchestration gate task\b/i.test(params.description);
}

function isReviewerDispatch(params) {
  if (typeof params?.description !== "string") return false;
  if (isQaReviewerDispatch(params)) return false;
  return /^(?:review task|.+\sreview task)\b/i.test(params.description);
}

function taskPolicyRole(params) {
  if (isImplementerDispatch(params)) return "implementer";
  if (isCoordinatorDispatch(params)) return "coordinator";
  if (isQaReviewerDispatch(params)) return "qa";
  if (isReviewerDispatch(params)) return "reviewer";
  return null;
}

function taskResultText(payload) {
  const value = payload?.result ?? payload?.tool_response ?? payload?.toolResponse ?? payload?.response ?? "";
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? "");
}

function validateAuditToken(text, token) {
  const re = new RegExp(`${token}:\\s*(passed|failed|skipped)\\b`);
  return re.test(String(text ?? ""));
}

function validateVerificationReport(text) {
  const body = String(text ?? "");
  if (!/STATUS:\s*DONE\b/i.test(body)) return true;
  return /verification_passed\b/i.test(body);
}

function handleTaskHook(event, payload) {
  const params = taskParams(payload);
  const isImpl = isImplementerDispatch(params);
  const isQa = isQaReviewerDispatch(params);
  const isCoord = isCoordinatorDispatch(params);
  const isRev = isReviewerDispatch(params);
  if (!isImpl && !isQa && !isCoord && !isRev) return false;

  if (event === "PreToolUse") {
    const policyVerdict = evaluateEmbeddedPolicyEvent({
      event: "BeforeAgentSpawn",
      platform: "claude",
      runId: policyRunId(),
      toolName: "Task",
      displayId: params.description,
      agent: {
        role: taskPolicyRole(params),
        reason: params.description || params.prompt || "Task dispatch",
        budgetImpactUSD: 0,
      },
      payload: { description: params.description },
    });
    if (!policyVerdict.ok) {
      console.error(firstBlockingReason(policyVerdict) || "policy denied Task dispatch");
      process.exit(2);
    }
    if (isImpl) params.prompt = `${params.prompt || ""}${IMPLEMENTER_DIRECTIVE}`;
    else if (isCoord) params.prompt = `${params.prompt || ""}${COORDINATOR_DIRECTIVE}`;
    else if (isQa) params.prompt = `${params.prompt || ""}${QA_DIRECTIVE}`;
    else if (isRev) params.prompt = `${params.prompt || ""}${REVIEWER_DIRECTIVE}`;
    process.stdout.write(JSON.stringify(setTaskParams(payload, params)));
    process.exit(0);
  }

  if (event === "PostToolUse") {
    const text = taskResultText(payload);
    const policyOptions = loadPolicyOptions();
    const changedFiles = changedFilesFromPayload(payload);
    const policyVerdict = evaluateEmbeddedPolicyEvent({
      event: "AfterAgentReturn",
      platform: "claude",
      runId: policyRunId(),
      toolName: "Task",
      displayId: params.description,
      agent: {
        role: taskPolicyRole(params),
        reason: params.description || "Task result",
        budgetImpactUSD: 0,
      },
      payload: {
        description: params.description,
        resultText: text,
        changedFiles,
        qualityDebtScan: qualityDebtScanForFiles(changedFiles, payload, policyOptions),
      },
    });
    if (!policyVerdict.ok) {
      console.error(firstBlockingReason(policyVerdict) || "policy denied Task result");
      process.exit(2);
    }
    if (isImpl && !validateVerificationReport(text)) {
      console.error("Implementer must include verification_passed before reporting STATUS: DONE.");
      process.exit(2);
    }
    if (isCoord && !validateAuditToken(text, "ORCHESTRATION_AUDIT")) {
      console.error("Coordinator must include ORCHESTRATION_AUDIT: passed|failed|skipped.");
      process.exit(2);
    }
    if (isQa && !validateAuditToken(text, "QA_AUDIT")) {
      console.error("QA reviewer must include QA_AUDIT: passed|failed|skipped.");
      process.exit(2);
    }
    if (isRev && !validateAuditToken(text, "VERIFICATION_AUDIT")) {
      console.error("Reviewer must include VERIFICATION_AUDIT: passed|failed|skipped.");
      process.exit(2);
    }
    process.exit(0);
  }

  return false;
}

function handleFileWriteHook(event, payload) {
  if (event !== "PreToolUse") return false;
  const tool = payload?.tool_name;
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit" && tool !== "NotebookEdit") return false;
  const snapshotPath = process.env.AGENT_ALL_DIRTY_SNAPSHOT;
  if (!snapshotPath) return true; // no protection configured → allow
  let protectedPaths = [];
  try {
    protectedPaths = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  } catch (error) {
    console.error(`agent-policy-hook warning: AGENT_ALL_DIRTY_SNAPSHOT set but snapshot unreadable/malformed — skipping file guard${hookErrorDetail(error)}`);
    return true;
  }
  const filePath = payload?.tool_input?.file_path;
  if (!filePath) return true;
  // C1/C2: canonicalize both sides to absolute paths for comparison.
  // Claude Code passes file_path as absolute; snapshot holds relative paths.
  // path.resolve normalizes traversals (a/../b → b) and makes relative paths absolute.
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const absFilePath = resolve(projectRoot, String(filePath));
  const protectedAbsPaths = new Set(
    protectedPaths.map((p) => resolve(projectRoot, String(p)))
  );
  if (protectedAbsPaths.has(absFilePath)) {
    console.error(`protected file (pre-existing uncommitted): ${filePath} — agent-all PROTECT mode forbids editing it. Commit it first, or it stays untouched.`);
    process.exit(2);
  }
  return true; // recognized + allowed
}

let input = "";
try {
  input = readFileSync(0, "utf-8");
} catch (error) {
  failPolicyHook("failed to read hook payload from stdin", error);
}

let payload = {};
try {
  payload = input.trim() ? JSON.parse(input) : {};
} catch (error) {
  failPolicyHook("malformed hook JSON payload", error);
}

const event = process.argv[2] || payload?.hook_event_name || payload?.hookEventName || "";
if (handleFileWriteHook(event, payload)) { process.exit(0); }
if (isTaskPayload(payload) && handleTaskHook(event, payload)) {
  process.exit(0);
}

const command = (payload?.tool_input?.command ?? payload?.command ?? "").toString();
const policyOptions = loadPolicyOptions();
const result = analyzeShellCommand(command, policyOptions);
const isCommit = /git\s+(?:[^\s]+\s+)*commit\b/.test(command);
const changedFiles = isCommit ? changedFilesForCommitCommand(command) : [];
const policyVerdict = evaluateEmbeddedPolicyEvent({
  event: isCommit ? "BeforeCommit" : "BeforeToolUse",
  platform: "claude",
  runId: policyRunId(),
  toolName: toolName(payload) || "Bash",
  payload: {
    command,
    commandAnalysis: result,
    changedFiles,
    qualityDebtScan: isCommit ? qualityDebtScanForFiles(changedFiles, payload, policyOptions) : null,
  },
});

if (!policyVerdict.ok) {
  console.error(`agent policy blocked command: ${firstBlockingReason(policyVerdict) || result.reason}`);
  process.exit(2);
}

process.exit(0);
