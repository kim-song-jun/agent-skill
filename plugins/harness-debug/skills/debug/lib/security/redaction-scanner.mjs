import { DEFAULT_REDACTION_RULES } from "./redaction-rules.mjs";

export const REDACTION_SCAN_SCHEMA_VERSION = "agent-redaction-scan/v1";

const DEFAULT_FAIL_ON = ["high"];
const DEFAULT_MASK_ON = ["high", "medium"];

function toPosixPath(path) {
  return String(path || "").replace(/\\/g, "/");
}

function escapeRegex(value) {
  return String(value).replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function globToRegExp(glob) {
  const source = escapeRegex(toPosixPath(glob))
    .replace(/\\\*\\\*/g, ".*")
    .replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${source}$`);
}

function matchesGlob(path, patterns = []) {
  const normalized = toPosixPath(path);
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}

function array(value, fallback = []) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : fallback;
}

export function normalizeRedactionPolicy(config = {}) {
  const redaction = config?.security?.redaction ?? config?.redaction ?? {};
  return {
    enabled: redaction.enabled !== false,
    allowPaths: array(redaction.allowPaths),
    allowRules: new Set(array(redaction.allowRules)),
    failOn: new Set(array(redaction.failOn, DEFAULT_FAIL_ON)),
    maskOn: new Set(array(redaction.maskOn, DEFAULT_MASK_ON)),
  };
}

function cloneRegex(regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function actionForRule(rule, policy) {
  if (policy.failOn.has(rule.severity)) return "block";
  if (policy.maskOn.has(rule.severity)) return "mask";
  return "warn";
}

function normalizeRule(rule) {
  if (!rule?.id || !(rule.pattern instanceof RegExp)) {
    throw new Error(`invalid redaction rule: ${rule?.id ?? "(missing id)"}`);
  }
  return {
    ...rule,
    mask: rule.mask ?? `[REDACTED:${rule.id}]`,
  };
}

export function scanTextForRedactions(text, {
  artifactPath = "(unknown)",
  config = {},
  rules = DEFAULT_REDACTION_RULES,
} = {}) {
  const policy = normalizeRedactionPolicy(config);
  const input = String(text ?? "");
  if (!policy.enabled || matchesGlob(artifactPath, policy.allowPaths)) {
    return {
      schemaVersion: REDACTION_SCAN_SCHEMA_VERSION,
      artifactPath,
      redactedText: input,
      findings: [],
      blocked: false,
    };
  }

  let redactedText = input;
  const findings = [];

  for (const rawRule of rules) {
    const rule = normalizeRule(rawRule);
    if (policy.allowRules.has(rule.id)) continue;

    const regex = cloneRegex(rule.pattern);
    let count = 0;
    const action = actionForRule(rule, policy);
    redactedText = redactedText.replace(regex, (match) => {
      count += 1;
      return action === "warn" ? match : rule.mask;
    });
    if (count > 0) {
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        count,
        artifactPath,
        action,
      });
    }
  }

  return {
    schemaVersion: REDACTION_SCAN_SCHEMA_VERSION,
    artifactPath,
    redactedText,
    findings,
    blocked: findings.some((finding) => finding.action === "block"),
  };
}

export function summarizeRedactionFindings(findings = []) {
  const grouped = new Map();
  for (const finding of findings) {
    const key = `${finding.rule}:${finding.severity}:${finding.action}`;
    const existing = grouped.get(key) ?? {
      rule: finding.rule,
      severity: finding.severity,
      action: finding.action,
      count: 0,
    };
    existing.count += Number(finding.count ?? 0);
    grouped.set(key, existing);
  }
  return [...grouped.values()].sort((left, right) => {
    const severityRank = { high: 0, medium: 1, low: 2 };
    return (severityRank[left.severity] ?? 99) - (severityRank[right.severity] ?? 99)
      || left.rule.localeCompare(right.rule);
  });
}
