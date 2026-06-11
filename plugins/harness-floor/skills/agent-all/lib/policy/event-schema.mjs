export const POLICY_EVENT_SCHEMA_VERSION = "agent-policy-event/v1";

export const POLICY_EVENTS = [
  "BeforeLoopIteration",
  "AfterBreakCondition",
  "BeforeAgentSpawn",
  "AfterAgentReturn",
  "BeforeToolUse",
  "BeforeCommit",
  "BeforeVerification",
  "AfterVerification",
  "BeforeHandoff",
  "BeforePRCreate",
  "NonTTYDecision",
];

export const POLICY_PLATFORMS = [
  "claude",
  "codex",
  "cursor",
  "copilot",
  "gemini",
  "vscode-copilot",
  "unknown",
];

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function costFromTelemetry(payload) {
  const telemetry = payload.costTelemetry ?? payload.cost_telemetry ?? payload.telemetry?.cost;
  const summary = telemetry?.summary ?? payload.costTelemetrySummary ?? payload.cost_summary;
  return numberOrNull(summary?.totalUSD ?? summary?.totalCostUSD ?? telemetry?.totalUSD ?? telemetry?.costUSD);
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string" && entry.length > 0)
    : [];
}

export function normalizeHookEvent(input = {}) {
  const raw = objectOrEmpty(input);
  const payload = objectOrEmpty(raw.payload);
  const agent = objectOrEmpty(raw.agent);

  return {
    schemaVersion: raw.schemaVersion || POLICY_EVENT_SCHEMA_VERSION,
    event: stringOrNull(raw.event ?? raw.hookEvent ?? raw.hook_event_name),
    platform: stringOrNull(raw.platform) || "unknown",
    runId: stringOrNull(raw.runId ?? raw.run_id) || "default",
    taskId: stringOrNull(raw.taskId ?? raw.task_id),
    displayId: stringOrNull(raw.displayId ?? raw.display_id),
    iteration: numberOrNull(raw.iteration ?? raw.iter ?? payload.iter),
    phase: stringOrNull(raw.phase),
    toolName: stringOrNull(raw.toolName ?? raw.tool ?? raw.tool_name),
    changedFiles: stringArray(raw.changedFiles ?? raw.changed_files ?? payload.changedFiles),
    costUSD: numberOrNull(raw.costUSD ?? raw.cost_usd ?? payload.costUSD) ?? costFromTelemetry(payload),
    breakCondition: raw.breakCondition ?? raw.break_condition ?? payload.breakCondition ?? null,
    agent: {
      role: stringOrNull(agent.role ?? raw.agentRole ?? raw.role),
      reason: stringOrNull(agent.reason ?? raw.agentReason ?? raw.reason),
      budgetImpactUSD: numberOrNull(
        agent.budgetImpactUSD
          ?? agent.budget_impact_usd
          ?? raw.budgetImpactUSD
          ?? payload.budgetImpactUSD
          ?? payload.costEstimateUSD,
      ),
      id: stringOrNull(agent.id ?? raw.agentId),
    },
    payload,
  };
}

export function validateHookEvent(event) {
  const errors = [];
  if (!POLICY_EVENTS.includes(event.event)) {
    errors.push({
      path: "event",
      message: `must be one of ${POLICY_EVENTS.join("|")}`,
    });
  }
  if (!POLICY_PLATFORMS.includes(event.platform)) {
    errors.push({
      path: "platform",
      message: `must be one of ${POLICY_PLATFORMS.join("|")}`,
    });
  }
  if (event.schemaVersion !== POLICY_EVENT_SCHEMA_VERSION) {
    errors.push({
      path: "schemaVersion",
      message: `must be ${POLICY_EVENT_SCHEMA_VERSION}`,
    });
  }
  if (event.iteration !== null && event.iteration < 0) {
    errors.push({ path: "iteration", message: "must be >= 0" });
  }
  if (event.costUSD !== null && event.costUSD < 0) {
    errors.push({ path: "costUSD", message: "must be >= 0" });
  }
  if (event.agent.budgetImpactUSD !== null && event.agent.budgetImpactUSD < 0) {
    errors.push({ path: "agent.budgetImpactUSD", message: "must be >= 0" });
  }
  return { ok: errors.length === 0, errors };
}
