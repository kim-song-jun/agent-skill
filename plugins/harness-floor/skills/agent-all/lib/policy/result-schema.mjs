export const POLICY_RESULT_SCHEMA_VERSION = "agent-policy-result/v1";

export const POLICY_ACTIONS = [
  "allow",
  "warn",
  "rewrite_prompt",
  "ask_user",
  "requires_justification",
  "deny",
  "stop_loop",
  "escalate",
];
export const POLICY_SEVERITIES = ["info", "warning", "error", "critical"];

const ACTION_RANK = {
  allow: 0,
  warn: 1,
  rewrite_prompt: 2,
  ask_user: 3,
  requires_justification: 4,
  escalate: 5,
  stop_loop: 6,
  deny: 7,
};

const SEVERITY_RANK = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

export function policyResult({
  policyId,
  action = "allow",
  severity = "info",
  reason = "allowed",
  patch = null,
  nextAction = null,
  details = null,
} = {}) {
  return {
    schemaVersion: POLICY_RESULT_SCHEMA_VERSION,
    policyId: policyId || "unknown-policy",
    action,
    severity,
    reason,
    patch,
    nextAction,
    details,
  };
}

export function validatePolicyResult(result) {
  const errors = [];
  if (result?.schemaVersion !== POLICY_RESULT_SCHEMA_VERSION) {
    errors.push({
      path: "schemaVersion",
      message: `must be ${POLICY_RESULT_SCHEMA_VERSION}`,
    });
  }
  if (!POLICY_ACTIONS.includes(result?.action)) {
    errors.push({ path: "action", message: `must be one of ${POLICY_ACTIONS.join("|")}` });
  }
  if (!POLICY_SEVERITIES.includes(result?.severity)) {
    errors.push({
      path: "severity",
      message: `must be one of ${POLICY_SEVERITIES.join("|")}`,
    });
  }
  if (typeof result?.policyId !== "string" || !result.policyId) {
    errors.push({ path: "policyId", message: "must be non-empty string" });
  }
  if (typeof result?.reason !== "string" || !result.reason) {
    errors.push({ path: "reason", message: "must be non-empty string" });
  }
  return { ok: errors.length === 0, errors };
}

export function isBlockingPolicyResult(result) {
  return result?.action === "deny"
    || result?.action === "stop_loop"
    || result?.action === "requires_justification"
    || result?.action === "ask_user";
}

export function summarizePolicyResults(results = []) {
  const normalized = Array.isArray(results) && results.length > 0
    ? results
    : [policyResult()];
  return normalized.reduce((summary, result) => {
    const actionRank = ACTION_RANK[result.action] ?? 0;
    const severityRank = SEVERITY_RANK[result.severity] ?? 0;
    return {
      action: actionRank > ACTION_RANK[summary.action] ? result.action : summary.action,
      severity: severityRank > SEVERITY_RANK[summary.severity] ? result.severity : summary.severity,
      ok: summary.ok && !isBlockingPolicyResult(result),
    };
  }, { action: "allow", severity: "info", ok: true });
}
