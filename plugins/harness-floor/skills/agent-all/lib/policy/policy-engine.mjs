import { appendPolicyAudit } from "./audit-log-writer.mjs";
import { normalizeHookEvent, validateHookEvent } from "./event-schema.mjs";
import { runDefaultPolicies } from "./default-policies.mjs";
import { loadPolicyConfig } from "./policy-loader.mjs";
import {
  policyResult,
  summarizePolicyResults,
  validatePolicyResult,
} from "./result-schema.mjs";

export function evaluatePolicyEvent(rawEvent = {}, {
  cwd = process.cwd(),
  policy = null,
  writeAudit = false,
  now = new Date(),
} = {}) {
  const loaded = loadPolicyConfig({ cwd, explicitPolicy: policy });
  const event = normalizeHookEvent(rawEvent);
  const eventValidation = validateHookEvent(event);
  let results = [];

  if (!eventValidation.ok) {
    results.push(policyResult({
      policyId: "event-schema",
      action: "deny",
      severity: "critical",
      reason: `invalid policy event: ${eventValidation.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`,
      details: { errors: eventValidation.errors },
    }));
  } else {
    results = runDefaultPolicies(event, loaded.policy, { cwd, now });
  }

  if (results.length === 0) {
    results = [policyResult({
      policyId: "default-allow",
      action: "allow",
      severity: "info",
      reason: "no policy violations",
    })];
  }

  const resultValidationErrors = results.flatMap((result) => validatePolicyResult(result).errors);
  if (resultValidationErrors.length > 0) {
    results.push(policyResult({
      policyId: "result-schema",
      action: "deny",
      severity: "critical",
      reason: `invalid policy result: ${resultValidationErrors.map((e) => `${e.path} ${e.message}`).join("; ")}`,
      details: { errors: resultValidationErrors },
    }));
  }

  const summary = summarizePolicyResults(results);
  let auditPath = null;
  if (writeAudit) {
    auditPath = appendPolicyAudit({
      cwd,
      runId: event.runId,
      event,
      results,
      summary,
      now,
    });
  }

  return {
    ok: summary.ok,
    action: summary.action,
    severity: summary.severity,
    event,
    results,
    policy: loaded.policy,
    warnings: loaded.warnings,
    auditPath,
  };
}
