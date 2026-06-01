import { classifyChangedFiles } from "./changed-file-classifier.mjs";

const DEFAULT_GATES = {
  specReview: true,
  qualityReview: true,
};

const REVIEWER_ORDER = [
  "reviewer",
  "verification-reviewer",
  "qa-reviewer",
  "design-reviewer",
  "security-reviewer",
  "data-reviewer",
  "integration-dev",
];

const DESCRIPTION_PREFIXES = {
  "orchestrator": "Orchestration Gate Task",
  "reviewer": "Review Task",
  "spec-reviewer": "Spec Review Task",
  "verification-reviewer": "Verification Review Task",
  "qa-reviewer": "QA Review Task",
  "design-reviewer": "Design Review Task",
  "security-reviewer": "Security Review Task",
  "data-reviewer": "Data Review Task",
  "integration-dev": "Integration-dev Review Task",
};

const GATE_REASONS = {
  "orchestrator": "Changed-file classifier selected the orchestration gate for HOT/shared files or broad non-doc changes.",
  "reviewer:spec": "Spec review is enabled; compare the wave diff against the task goal, plan, and acceptance criteria.",
  "reviewer:quality": "Base quality review is enabled; inspect the wave diff for code quality, maintainability, and regressions.",
  "verification-reviewer": "Feature or bug-fix work requires verification evidence: tests, typecheck, lint, diff scope, and reruns after fixes.",
  "qa-reviewer": "User-visible work requires user-side QA: scenarios, persona confusion, accessibility-visible behavior, loading, empty, and error states.",
  "design-reviewer": "Frontend or UI files changed; review visual hierarchy, responsive fit, component conventions, and state styling.",
  "security-reviewer": "Auth, API, permissions, secrets, or destructive-action surfaces changed; review authorization and blast radius.",
  "data-reviewer": "Data-shape or lifecycle files changed; review migrations, models, seeds, fixtures, backfills, and rollback safety.",
  "integration-dev": "Frontend and backend/API surfaces changed together; review contracts, wiring, fixtures, and end-to-end compatibility.",
};

function orderRoles(roles, order = REVIEWER_ORDER) {
  const rank = new Map(order.map((role, index) => [role, index]));
  return [...new Set(roles)].sort((a, b) => {
    const ar = rank.has(a) ? rank.get(a) : Number.MAX_SAFE_INTEGER;
    const br = rank.has(b) ? rank.get(b) : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return a.localeCompare(b);
  });
}

function auditForRole(role, kind) {
  if (kind === "coordinator") return "ORCHESTRATION_AUDIT";
  if (role === "qa-reviewer") return "QA_AUDIT";
  return "VERIFICATION_AUDIT";
}

function prefixForRole(role, mode, kind) {
  if (kind === "coordinator") return DESCRIPTION_PREFIXES[role] ?? `${role} Coordination Task`;
  if (mode === "spec" && role === "reviewer") return DESCRIPTION_PREFIXES["spec-reviewer"];
  return DESCRIPTION_PREFIXES[role] ?? `${role[0]?.toUpperCase() ?? ""}${role.slice(1)} Review Task`;
}

function gateReasonForRole(role, mode, kind) {
  if (kind === "coordinator") return GATE_REASONS[role] ?? GATE_REASONS.orchestrator;
  return GATE_REASONS[`${role}:${mode}`] ?? GATE_REASONS[role] ?? "Classifier-selected reviewer gate.";
}

function passCriteriaForDispatch({ role, kind, auditToken }) {
  if (kind === "coordinator") {
    return [
      `${auditToken}: passed or skipped.`,
      "No HOT-file ownership conflicts, unsafe retry sequencing, or pathspec commit risk.",
    ];
  }
  if (role === "qa-reviewer") {
    return [
      `${auditToken}: passed or skipped.`,
      "No blocking user-flow, persona, accessibility-visible, loading, empty, or error-state issues.",
    ];
  }
  return [
    `${auditToken}: passed or skipped.`,
    "No blocking technical, security, data, design, integration, or verification-evidence issues for this persona.",
  ];
}

function makeDispatch({ role, kind, mode, taskId, title }) {
  const descriptionPrefix = prefixForRole(role, mode, kind);
  const auditToken = auditForRole(role, kind);
  const dispatch = {
    role,
    kind,
    mode,
    descriptionPrefix,
    auditToken,
    requiredAudit: `${auditToken}: passed|failed|skipped`,
    gateReason: gateReasonForRole(role, mode, kind),
  };
  dispatch.passCriteria = passCriteriaForDispatch(dispatch);
  dispatch.description = descriptionForDispatch(dispatch, { taskId, title });
  return dispatch;
}

function collectRequiredAudits(dispatches) {
  const audits = {};
  for (const dispatch of dispatches) {
    if (!audits[dispatch.auditToken]) audits[dispatch.auditToken] = [];
    audits[dispatch.auditToken].push(dispatch.role);
  }
  return audits;
}

export function descriptionForDispatch(dispatch, { taskId = "<N>", title = "<title>" } = {}) {
  if (!dispatch?.descriptionPrefix) {
    throw new Error("descriptionForDispatch: dispatch.descriptionPrefix required");
  }
  return `${dispatch.descriptionPrefix} ${taskId}: ${title}`;
}

export function buildGatePlan({
  files = [],
  gates = DEFAULT_GATES,
  taskId = "<N>",
  title = "<title>",
} = {}) {
  const resolvedGates = { ...DEFAULT_GATES, ...(gates ?? {}) };
  if (!resolvedGates.specReview && !resolvedGates.qualityReview) {
    return {
      skipped: true,
      coordinators: [],
      reviewers: [],
      dispatches: [],
      requiredAudits: {},
      passCriteria: [],
    };
  }

  const classification = resolvedGates.qualityReview
    ? classifyChangedFiles(files)
    : { reviewers: [], coordinators: [] };
  const coordinators = orderRoles(classification.coordinators ?? [], ["orchestrator"]);
  const reviewers = orderRoles(classification.reviewers ?? []);

  const dispatches = [];
  for (const role of coordinators) {
    dispatches.push(makeDispatch({ role, kind: "coordinator", mode: "orchestration", taskId, title }));
  }
  if (resolvedGates.specReview) {
    dispatches.push(makeDispatch({ role: "reviewer", kind: "reviewer", mode: "spec", taskId, title }));
  }
  if (resolvedGates.qualityReview) {
    for (const role of reviewers) {
      dispatches.push(makeDispatch({ role, kind: "reviewer", mode: "quality", taskId, title }));
    }
  }

  return {
    skipped: false,
    coordinators,
    reviewers,
    dispatches,
    requiredAudits: collectRequiredAudits(dispatches),
    passCriteria: [
      "ORCHESTRATION_AUDIT for every coordinator is passed or skipped.",
      "VERIFICATION_AUDIT for verification-reviewer and technical reviewers is passed or skipped.",
      "QA_AUDIT for qa-reviewer is passed or skipped when qa-reviewer is dispatched.",
      "No coordinator reports HOT-file ownership conflicts, unsafe retry sequencing, or pathspec commit risk.",
      "No reviewer persona reports blocking issues.",
    ],
  };
}
