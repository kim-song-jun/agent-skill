import { classifyOrchestrationState } from "./state-classifier.mjs";

const ROLE_ORDER = [
  "planner",
  "orchestrator",
  "frontend-dev",
  "backend-dev",
  "integration-dev",
  "reviewer",
  "verification-reviewer",
  "qa-reviewer",
  "design-reviewer",
  "security-reviewer",
  "data-reviewer",
];

const DEFAULT_COST_ESTIMATES = {
  planner: 1,
  coordinator: 1.5,
  implementer: 2,
  reviewer: 1,
};

function costFor(kind, role, overrides = {}) {
  const value = overrides[role] ?? overrides[kind] ?? DEFAULT_COST_ESTIMATES[role] ?? DEFAULT_COST_ESTIMATES[kind] ?? 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function rankAgent(agent) {
  const index = ROLE_ORDER.indexOf(agent.role);
  return index === -1 ? ROLE_ORDER.length : index;
}

function pushAgent(agents, {
  role,
  kind,
  reason,
  source,
  wave = 0,
  action = "spawn",
  costEstimates = {},
}) {
  if (!role) return;
  agents.push({
    role,
    kind,
    reason,
    wave,
    action,
    source,
    costEstimateUSD: costFor(kind, role, costEstimates),
  });
}

function dedupeAgents(agents) {
  const seen = new Map();
  for (const agent of agents) {
    const key = `${agent.kind}:${agent.role}`;
    if (!seen.has(key)) seen.set(key, agent);
  }
  return [...seen.values()].sort((a, b) => {
    const roleRank = rankAgent(a) - rankAgent(b);
    if (roleRank !== 0) return roleRank;
    return a.kind.localeCompare(b.kind) || a.role.localeCompare(b.role);
  });
}

function addImplementationAgents(agents, state, options) {
  const domains = new Set(state.changedDomains);
  if (domains.has("frontend") || domains.has("ui")) {
    pushAgent(agents, {
      role: "frontend-dev",
      kind: "implementer",
      reason: "Frontend or UI files changed.",
      source: "changed-domains",
      ...options,
    });
  }
  if (domains.has("backend") || domains.has("api") || domains.has("data") || domains.has("security")) {
    pushAgent(agents, {
      role: "backend-dev",
      kind: "implementer",
      reason: "Backend, API, data, or security files changed.",
      source: "changed-domains",
      ...options,
    });
  }
  if (domains.has("integration")) {
    pushAgent(agents, {
      role: "integration-dev",
      kind: "implementer",
      reason: "Frontend and backend/API surfaces changed together.",
      source: "changed-domains",
      ...options,
    });
  }
}

function addReviewerAgents(agents, state, options) {
  for (const role of state.requiredReviewerRoles) {
    const reason = {
      "reviewer": "Base quality review is required.",
      "verification-reviewer": "Verification evidence must be audited.",
      "qa-reviewer": state.visualQa.failed
        ? "Visual QA failed; user-flow review is required."
        : "User-visible UI flow changed; QA review is required.",
      "design-reviewer": "Frontend or UI files changed; design review is required.",
      "security-reviewer": "Auth, API, permission, token, or security-sensitive files changed.",
      "data-reviewer": "Migrations, models, fixtures, seeds, or backfills changed.",
      "integration-dev": "Frontend and backend/API contract changed together.",
    }[role] ?? "Changed-file classifier selected this reviewer.";
    pushAgent(agents, {
      role,
      kind: "reviewer",
      reason,
      source: "changed-file-classifier",
      ...options,
    });
  }
  if (state.visualQa.failed && !state.requiredReviewerRoles.includes("qa-reviewer")) {
    pushAgent(agents, {
      role: "qa-reviewer",
      kind: "reviewer",
      reason: "Visual QA failed; QA reviewer is required.",
      source: "visual-qa",
      ...options,
    });
  }
}

function addCoordinatorAgents(agents, state, options) {
  for (const role of state.requiredCoordinatorRoles) {
    pushAgent(agents, {
      role,
      kind: "coordinator",
      reason: "Shared HOT files, CI/config, or broad non-doc changes require orchestration review.",
      source: "changed-file-classifier",
      ...options,
    });
  }
}

export function planRequiredAgents({
  wave = 0,
  costEstimates = {},
  ...input
} = {}) {
  const state = classifyOrchestrationState(input);
  const agents = [];
  const options = { wave, costEstimates };

  if (state.failureEscalation.required || state.ambiguity.blocked) {
    const reason = state.failureEscalation.required
      ? `Repeated failure signature requires planner/user decision before another implementation pass: ${state.failureEscalation.signature}`
      : `Unresolved ambiguity requires planner/user decision: ${state.ambiguity.reason}`;
    pushAgent(agents, {
      role: "planner",
      kind: "planner",
      reason,
      source: state.failureEscalation.required ? "failure-signature" : "ambiguity",
      action: "escalate",
      ...options,
    });
  } else if (!state.budget.exceeded) {
    addImplementationAgents(agents, state, options);
  }

  addCoordinatorAgents(agents, state, options);
  addReviewerAgents(agents, state, options);

  const requiredAgents = dedupeAgents(agents);
  return {
    ...state,
    requiredAgents,
  };
}

