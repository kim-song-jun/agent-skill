import { validateCoordinatorAudit } from "./coordinator-audit-validator.mjs";
import { validateQaAudit } from "./qa-audit-validator.mjs";
import { validateReviewerAudit } from "./reviewer-audit-validator.mjs";
import { validateVerification } from "./verification-validator.mjs";
import { policyResult } from "./result-schema.mjs";
import { scanQualityDebtFiles } from "./quality-debt-scanner.mjs";
import { containsDestructiveSql } from "../data/sql-validator.mjs";
import { summarizeCostTelemetry } from "../cost-telemetry.mjs";
import {
  scanTextForRedactions,
  summarizeRedactionFindings,
} from "../security/redaction-scanner.mjs";

function isUnlimitedMaxIter(maxIter) {
  return maxIter == null || maxIter === 0;
}

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function firstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function costTelemetryOptions(policy = {}) {
  return {
    warnAtRatio: firstNumber(policy.costTelemetry?.warnAtRatio) ?? 0.8,
    modelRates: policy.costTelemetry?.modelRates ?? {},
    fallbackUSDPerKChar: firstNumber(policy.costTelemetry?.fallbackUSDPerKChar) ?? 0.0015,
  };
}

function eventCostSummary(event, policy) {
  const payload = event.payload ?? {};
  const telemetry = payload.costTelemetry ?? payload.cost_telemetry ?? payload.telemetry?.cost;
  const maxCostUSD = firstNumber(
    payload.maxCostUSD,
    payload.max_cost_usd,
    policy.maxCostUSD,
    telemetry?.maxCostUSD,
    telemetry?.summary?.budget?.maxCostUSD,
  );
  if (telemetry) {
    if (telemetry.summary && !Array.isArray(telemetry.records)) {
      return {
        ...telemetry.summary,
        budget: {
          ...(telemetry.summary.budget ?? {}),
          maxCostUSD,
          warnAtRatio: firstNumber(telemetry.summary.budget?.warnAtRatio, policy.costTelemetry?.warnAtRatio) ?? 0.8,
        },
      };
    }
    return summarizeCostTelemetry(telemetry, {
      ...costTelemetryOptions(policy),
      maxCostUSD,
    });
  }
  const summary = payload.costTelemetrySummary ?? payload.cost_summary;
  const cost = firstNumber(
    event.costUSD,
    payload.costUSD,
    payload.cost_usd,
    payload.totalCostUSD,
    summary?.totalUSD,
    summary?.totalCostUSD,
  );
  if (cost === null) return null;
  return {
    totalUSD: cost,
    budget: {
      maxCostUSD,
      warnAtRatio: costTelemetryOptions(policy).warnAtRatio,
    },
  };
}

function agentResultText(event) {
  const payload = event.payload ?? {};
  const value = payload.resultText ?? payload.result ?? payload.tool_response ?? payload.toolResponse ?? payload.response ?? "";
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function roleForAudit(event) {
  const role = String(event.agent?.role ?? event.payload?.role ?? "").toLowerCase();
  if (role === "implementer" || role === "dev" || role.endsWith("-dev")) return "implementer";
  if (role === "qa" || role === "qa-reviewer") return "qa";
  if (role === "coordinator" || role === "orchestrator") return "coordinator";
  if (role === "reviewer" || role.endsWith("-reviewer") || role.includes("review")) return "reviewer";
  return role;
}

function repeatedFailureCount(event) {
  const payload = event.payload ?? {};
  const signature = payload.failureSignature ?? payload.lastFailureSignature;
  const explicitCount = firstNumber(payload.repeatedCount, payload.failureCount);
  if (explicitCount !== null) return { signature, count: explicitCount };
  const counts = payload.failureSignatures && typeof payload.failureSignatures === "object"
    ? payload.failureSignatures
    : {};
  return { signature, count: signature ? counts[signature] ?? 0 : 0 };
}

function maxCostPolicy(event, policy) {
  if (policy.costTelemetry === false || policy.costTelemetry?.enabled === false) return null;
  const costSummary = eventCostSummary(event, policy);
  const maxCost = firstNumber(costSummary?.budget?.maxCostUSD, policy.maxCostUSD, event.payload?.maxCostUSD);
  const cost = firstNumber(costSummary?.totalUSD, event.costUSD, event.payload?.costUSD);
  if (maxCost === null || cost === null || cost < maxCost) return null;
  return policyResult({
    policyId: "max-cost-exceeded",
    action: "stop_loop",
    severity: "critical",
    reason: `cost budget exceeded (${cost} >= ${maxCost})`,
    nextAction: "Stop the loop and ask the user before spending more budget.",
    details: { costUSD: cost, maxCostUSD: maxCost },
  });
}

function costWarningPolicy(event, policy) {
  if (policy.costTelemetry === false || policy.costTelemetry?.enabled === false) return null;
  const payload = event.payload ?? {};
  if (payload.budgetWarningAcknowledged === true || payload.costTelemetry?.budgetWarningAcknowledged === true) return null;
  const costSummary = eventCostSummary(event, policy);
  const maxCost = firstNumber(costSummary?.budget?.maxCostUSD, policy.maxCostUSD, payload.maxCostUSD);
  const cost = firstNumber(costSummary?.totalUSD, event.costUSD, payload.costUSD);
  const warnAtRatio = firstNumber(costSummary?.budget?.warnAtRatio, policy.costTelemetry?.warnAtRatio) ?? 0.8;
  if (maxCost === null || cost === null || maxCost <= 0 || warnAtRatio <= 0 || cost >= maxCost) return null;
  const threshold = maxCost * warnAtRatio;
  if (cost < threshold) return null;
  return policyResult({
    policyId: "cost-budget-near-limit",
    action: "ask_user",
    severity: "warning",
    reason: `cost budget near limit (${cost} / ${maxCost}; ${(warnAtRatio * 100).toFixed(0)}% threshold)`,
    nextAction: "Ask the user whether to continue, reduce scope, or stop before spending the remaining budget.",
    details: { costUSD: cost, maxCostUSD: maxCost, warnAtRatio },
  });
}

function loopRunawayPolicy(event, policy) {
  if (!policy.loopRunawayPrevention || event.event !== "BeforeLoopIteration") return null;
  const maxIter = firstValue(event.payload?.maxIter, policy.maxIter);
  const iter = firstNumber(event.iteration, event.payload?.iter);
  if (!isUnlimitedMaxIter(maxIter) && iter !== null && iter >= maxIter) {
    return policyResult({
      policyId: "loop-runaway-prevention",
      action: "stop_loop",
      severity: "critical",
      reason: `max iteration guard reached (${iter} >= ${maxIter})`,
      nextAction: "Increase maxIter, set maxIter to 0/null for explicit unlimited mode, or inspect the current failure.",
      details: { iter, maxIter },
    });
  }
  if (isUnlimitedMaxIter(maxIter) && !event.breakCondition && !event.payload?.breakCondition) {
    return policyResult({
      policyId: "loop-runaway-prevention",
      action: "warn",
      severity: "warning",
      reason: "unlimited loop has no recorded break condition",
      nextAction: "Record a break condition before allowing unattended loop execution.",
    });
  }
  return null;
}

function repeatedFailureSignaturePolicy(event, policy) {
  if (event.event !== "AfterBreakCondition") return null;
  const limit = firstNumber(policy.maxRepeatedFailureSignature, event.payload?.maxRepeatedFailureSignature) ?? 3;
  if (limit <= 0) return null;
  const { signature, count } = repeatedFailureCount(event);
  if (!signature || count < limit) return null;
  return policyResult({
    policyId: "repeated-failure-signature",
    action: "stop_loop",
    severity: "critical",
    reason: `failure signature repeated ${count} time(s): ${signature}`,
    nextAction: "Escalate to planner/user decision before another implementation iteration.",
    details: { signature, count, limit },
  });
}

function commandPolicy(event) {
  const analysis = event.payload?.commandAnalysis ?? event.payload?.shellAnalysis;
  if (!analysis?.blocked) return null;
  const reason = String(analysis.reason ?? "blocked command");
  const isPathspec = /commit requires explicit pathspec/i.test(reason);
  return policyResult({
    policyId: isPathspec ? "commit-without-pathspec" : "hard-blocked-command",
    action: "deny",
    severity: "critical",
    reason,
    nextAction: isPathspec
      ? "Retry the commit with explicit pathspecs after `--`."
      : "Change the command or ask the user for an explicit override.",
    details: {
      command: event.payload?.command ?? null,
    },
  });
}

function destructiveDataOperationPolicy(event, policy) {
  if (event.event !== "BeforeToolUse" || policy.destructiveDataOperations === false) return null;
  const payload = event.payload ?? {};
  const sqlText = [
    payload.sql,
    payload.query,
    payload.sqlText,
    Array.isArray(payload.queries) ? payload.queries.join("\n") : null,
    payload.dataOperation,
  ].filter((value) => typeof value === "string" && value.trim()).join("\n");
  if (!sqlText || !containsDestructiveSql(sqlText) || payload.allowDestructive === true) return null;
  return policyResult({
    policyId: "destructive-data-operation",
    action: "deny",
    severity: "critical",
    reason: "destructive SQL/data operation requires explicit allowDestructive approval",
    nextAction: "Use read-only validation queries, or ask the user before setting allowDestructive=true.",
    details: {
      toolName: event.toolName,
      destructiveSources: payload.destructiveSources ?? null,
    },
  });
}

function verificationEvidencePolicy(event, policy) {
  if (event.event !== "AfterAgentReturn" || policy.verification === false) return null;
  if (roleForAudit(event) !== "implementer") return null;
  const verdict = validateVerification(agentResultText(event));
  if (verdict.ok) return null;
  return policyResult({
    policyId: "missing-verification-token",
    action: "deny",
    severity: "critical",
    reason: verdict.reason,
    nextAction: "Re-dispatch the implementer with verification-before-completion.",
  });
}

function reviewerAuditPolicy(event, policy) {
  if (event.event !== "AfterAgentReturn") return null;
  const role = roleForAudit(event);
  const text = agentResultText(event);
  const validators = {
    reviewer: policy.reviewerAudit === false ? null : validateReviewerAudit,
    qa: policy.qaAudit === false ? null : validateQaAudit,
    coordinator: policy.coordinatorAudit === false ? null : validateCoordinatorAudit,
  };
  const validate = validators[role];
  if (!validate) return null;
  const verdict = validate(text);
  if (verdict.ok) return null;
  return policyResult({
    policyId: `missing-${role}-audit-token`,
    action: "deny",
    severity: "critical",
    reason: verdict.reason,
    nextAction: "Re-dispatch the reviewer with the required audit token contract.",
  });
}

function dynamicAgentSpawnPolicy(event, policy) {
  if (event.event !== "BeforeAgentSpawn") return null;
  const results = [];
  if (policy.requireSpawnRole !== false && !event.agent?.role) {
    results.push(policyResult({
      policyId: "dynamic-agent-spawn-role",
      action: "deny",
      severity: "critical",
      reason: "dynamic agent spawn missing role",
      nextAction: "Include the target agent role before dispatch.",
    }));
  }
  if (policy.requireSpawnReason !== false && !event.agent?.reason) {
    results.push(policyResult({
      policyId: "dynamic-agent-spawn-reason",
      action: "deny",
      severity: "critical",
      reason: "dynamic agent spawn missing reason",
      nextAction: "Include the dispatch reason before spawning the agent.",
    }));
  }
  if (policy.requireSpawnBudget !== false && event.agent?.budgetImpactUSD === null) {
    results.push(policyResult({
      policyId: "dynamic-agent-spawn-budget",
      action: "deny",
      severity: "critical",
      reason: "dynamic agent spawn missing budget impact",
      nextAction: "Include the expected budget impact before spawning the agent.",
    }));
  }
  const max = firstNumber(policy.maxDynamicAgentsPerWave);
  const count = firstNumber(event.payload?.waveSpawnCount, event.payload?.spawnCount, event.payload?.dynamicAgentCount);
  if (max !== null && count !== null && count > max) {
    results.push(policyResult({
      policyId: "dynamic-agent-spawn-cap",
      action: "deny",
      severity: "critical",
      reason: `dynamic agent spawn cap exceeded (${count} > ${max})`,
      nextAction: "Reduce wave size or ask the user to raise policy.maxDynamicAgentsPerWave.",
      details: { count, max },
    }));
  }
  const roleMax = firstNumber(policy.maxDynamicSpawnsPerRole);
  const roleCount = firstNumber(
    event.payload?.sameRoleSpawnCount,
    event.payload?.roleSpawnCount,
    event.payload?.sameRoleDynamicAgentCount,
  );
  if (roleMax !== null && roleCount !== null && roleCount > roleMax) {
    results.push(policyResult({
      policyId: "dynamic-agent-spawn-role-repeat",
      action: "deny",
      severity: "critical",
      reason: `dynamic agent role repeated too often (${event.agent?.role ?? "unknown"}=${roleCount} > ${roleMax})`,
      nextAction: "Escalate to planner/user decision or choose a different role before spawning another same-role agent.",
      details: { role: event.agent?.role ?? null, count: roleCount, max: roleMax },
    }));
  }
  return results;
}

function nonTTYDecisionLoggingPolicy(event, policy) {
  const payload = event.payload ?? {};
  const isNonTTYDecision = event.event === "NonTTYDecision" || payload.nonTTYAutoDecision === true;
  if (!isNonTTYDecision || policy.requireNonTTYDecisionAudit === false) return null;
  if (payload.auditLogged || payload.stateLogged || payload.decisionAuditPath) return null;
  return policyResult({
    policyId: "non-tty-auto-decision-log",
    action: "deny",
    severity: "critical",
    reason: "non-TTY auto decision missing audit log token/path",
    nextAction: "Write the auto-pick to state, .agent-skill/runs/<run-id>/decisions.md, and .agent-skill/runs/<run-id>/interactions.jsonl before continuing.",
  });
}

function changedFilesForQualityDebt(event) {
  const payload = event.payload ?? {};
  return [
    ...new Set([
      ...(event.changedFiles ?? []),
      ...(Array.isArray(payload.changedFiles) ? payload.changedFiles : []),
      ...(Array.isArray(payload.files) ? payload.files : []),
    ]),
  ];
}

function qualityDebtPolicy(event, policy, context = {}) {
  if (policy.qualityDebt === false) return null;
  if (event.event !== "AfterAgentReturn" && event.event !== "BeforeCommit") return null;
  const payload = event.payload ?? {};
  const files = changedFilesForQualityDebt(event);
  if (files.length === 0 && !payload.fileContents) return null;

  const scan = scanQualityDebtFiles({
    cwd: context.cwd ?? process.cwd(),
    files,
    fileContents: payload.fileContents,
    taskDocText: payload.taskDocText ?? payload.task_doc_text ?? "",
    policy,
    now: context.now ?? new Date(),
  });
  if (scan.findings.length === 0) return null;

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

function redactionConfig(policy) {
  return {
    security: {
      redaction: policy.security?.redaction ?? policy.redaction ?? {},
    },
  };
}

function artifactRedactionCandidates(event) {
  const payload = event.payload ?? {};
  const candidates = [];
  const add = (artifactPath, content) => {
    if (content === undefined || content === null) return;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    candidates.push({
      artifactPath: artifactPath || payload.artifactPath || payload.path || "control-plane-artifact",
      content: text,
    });
  };
  add(payload.artifactPath, payload.artifactContent);
  add(payload.artifactPath ?? "PR body", payload.prBody ?? payload.pullRequestBody);
  add(payload.artifactPath ?? "handoff/session artifact", payload.handoff ?? payload.sessionPrompt);
  add(payload.artifactPath ?? "verification evidence", payload.verificationEvidence);
  add(payload.artifactPath ?? "report artifact", payload.reportText ?? payload.reportHtml ?? payload.reportJson);
  add(payload.artifactPath ?? "debug artifact", payload.debugLog ?? payload.debugState);
  if (Array.isArray(payload.artifacts)) {
    for (const artifact of payload.artifacts) {
      if (!artifact || typeof artifact !== "object") continue;
      add(artifact.path ?? artifact.artifactPath, artifact.content ?? artifact.body ?? artifact.value);
    }
  }
  return candidates;
}

function redactionGatePolicy(event, policy) {
  if (policy.security?.redaction?.enabled === false || policy.redaction === false) return null;
  const candidates = artifactRedactionCandidates(event);
  if (candidates.length === 0) return null;

  const findings = candidates.flatMap(({ artifactPath, content }) => scanTextForRedactions(content, {
    artifactPath,
    config: redactionConfig(policy),
  }).findings);
  if (findings.length === 0) return null;

  const summary = summarizeRedactionFindings(findings);
  const blocked = summary.some((finding) => finding.action === "block");
  return policyResult({
    policyId: "secret-redaction-gate",
    action: blocked ? "deny" : "warn",
    severity: blocked ? "critical" : "warning",
    reason: blocked
      ? "high severity secret/privacy candidate found in control-plane artifact"
      : "secret/privacy candidate was masked or warned in control-plane artifact",
    nextAction: blocked
      ? "Remove the sensitive value or add a path/rule allowlist entry; do not store the raw artifact."
      : "Review the redaction audit summary before publishing or sharing the artifact.",
    details: { findings: summary },
  });
}

export const DEFAULT_POLICY_CHECKS = [
  redactionGatePolicy,
  maxCostPolicy,
  costWarningPolicy,
  loopRunawayPolicy,
  repeatedFailureSignaturePolicy,
  commandPolicy,
  destructiveDataOperationPolicy,
  verificationEvidencePolicy,
  reviewerAuditPolicy,
  dynamicAgentSpawnPolicy,
  nonTTYDecisionLoggingPolicy,
  qualityDebtPolicy,
];

export function runDefaultPolicies(event, policy, context = {}) {
  if (policy.hookEngine === false) {
    return [policyResult({
      policyId: "hook-engine-disabled",
      action: "allow",
      severity: "info",
      reason: "policy hook engine disabled by project policy",
    })];
  }
  return DEFAULT_POLICY_CHECKS.flatMap((check) => {
    const result = check(event, policy, context);
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  });
}
