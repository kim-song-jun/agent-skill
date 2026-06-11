import { classifyChangedFiles } from "../changed-file-classifier.mjs";

const DEFAULT_REPEATED_FAILURE_THRESHOLD = 3;
const BUDGET_NEAR_LIMIT_RATIO = 0.8;

const FRONTEND_PATH_RE = /(^|\/)(app|components|frontend|pages|public|src\/components|src\/pages|ui)(\/|$)/;
const FRONTEND_APP_PATH_RE =
  /(^|\/)src\/(?:api|assets|composables|layouts|middleware|plugins|router|routes|services|stores?|views)(\/|$)/;
const FRONTEND_EXT_RE = /\.(css|scss|sass|less|jsx|tsx|vue|svelte)$/;
const BACKEND_PATH_RE = /(^|\/)(api|backend|server|services|workers|jobs|apps)(\/|$)/;
const API_PATH_RE = /(^|\/)api(\/|$)|(^|\/)(routes?|views?|viewsets?|serializers?)\.[^.]+$/;
const SECURITY_PATH_RE =
  /(^|\/)(auth|authentication|authorization|login|middleware|oauth|permissions?|security|sessions?)(\/|[-_.])/;
const SECURITY_NAME_RE = /(csrf|csp|destructive|jwt|oauth|password|permission|secret|session|token)/;
const DATA_PATH_RE = /(^|\/)(backfills?|db|database|fixtures?|migrations?|models?|prisma|schema|seeds?)(\/|[-_.])/;
const DATA_NAME_RE = /(^|\/)seed[-_.]/;
const DATA_EXT_RE = /\.(sql|prisma)$/;
const DOCS_PATH_RE = /(^|\/)(docs?|documentation|notes)(\/|$)/;
const TEST_PATH_RE = /(^|\/)(__tests__|tests?|spec|e2e)(\/|$)|\.(?:test|spec|e2e)\.[^.]+$/;
const CONFIG_PATH_RE =
  /(^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|poetry\.lock|requirements(?:[-_\w]*)?\.txt|cargo\.toml|cargo\.lock|go\.mod|go\.sum|tsconfig(?:\.[^.]+)?\.json|vite\.config\.[cm]?[jt]s|nuxt\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s)$/;
const ORCHESTRATION_PATH_RE =
  /(^|\/)(?:\.github\/workflows|\.circleci|\.buildkite|ci)(\/|$)|(^|\/)(?:dockerfile|docker-compose\.ya?ml|compose\.ya?ml|makefile)$/;

function normalizePath(file) {
  return String(file ?? "").replaceAll("\\", "/").trim();
}

function normalizedLowerPath(file) {
  return normalizePath(file).toLowerCase();
}

function addRoleDomains(domains, { reviewers = [], coordinators = [] } = {}) {
  if (reviewers.includes("design-reviewer") || reviewers.includes("qa-reviewer")) {
    domains.add("frontend");
    domains.add("ui");
  }
  if (reviewers.includes("security-reviewer")) domains.add("security");
  if (reviewers.includes("data-reviewer")) domains.add("data");
  if (reviewers.includes("integration-dev")) domains.add("integration");
  if (coordinators.includes("orchestrator")) domains.add("orchestration");
}

function addPathDomains(domains, file) {
  if (DOCS_PATH_RE.test(file)) domains.add("docs");
  if (TEST_PATH_RE.test(file)) domains.add("test");
  if (FRONTEND_PATH_RE.test(file) || FRONTEND_APP_PATH_RE.test(file) || FRONTEND_EXT_RE.test(file)) {
    domains.add("frontend");
    domains.add("ui");
  }
  if (BACKEND_PATH_RE.test(file)) domains.add("backend");
  if (API_PATH_RE.test(file)) domains.add("api");
  if (DATA_PATH_RE.test(file) || DATA_NAME_RE.test(file) || DATA_EXT_RE.test(file)) {
    domains.add("backend");
    domains.add("data");
  }
  if (SECURITY_PATH_RE.test(file) || SECURITY_NAME_RE.test(file)) domains.add("security");
  if (CONFIG_PATH_RE.test(file)) domains.add("config");
  if (ORCHESTRATION_PATH_RE.test(file)) domains.add("orchestration");
}

function normalizeFailureSignatures(failures = [], failureSignatures = {}) {
  const counts = new Map();
  if (failureSignatures && typeof failureSignatures === "object") {
    for (const [signature, count] of Object.entries(failureSignatures)) {
      const n = Number(count);
      if (signature && Number.isFinite(n) && n > 0) counts.set(signature, n);
    }
  }

  for (const failure of Array.isArray(failures) ? failures : [failures]) {
    if (!failure) continue;
    const signature = typeof failure === "string"
      ? failure
      : failure.signature ?? failure.failureSignature ?? failure.message ?? null;
    if (!signature) continue;
    const count = typeof failure === "object" && Number.isFinite(Number(failure.count))
      ? Number(failure.count)
      : 1;
    counts.set(signature, (counts.get(signature) ?? 0) + count);
  }

  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function classifyBudget({ costUSD = 0, maxCostUSD = null } = {}) {
  const cost = Number.isFinite(Number(costUSD)) ? Number(costUSD) : 0;
  const max = maxCostUSD === null || maxCostUSD === undefined
    ? null
    : Number.isFinite(Number(maxCostUSD))
      ? Number(maxCostUSD)
      : null;
  const remainingUSD = max === null ? null : Math.max(0, max - cost);
  return {
    costUSD: cost,
    maxCostUSD: max,
    remainingUSD,
    nearLimit: max !== null && max > 0 ? cost >= max * BUDGET_NEAR_LIMIT_RATIO : false,
    exceeded: max !== null ? cost >= max : false,
  };
}

function classifyVisualQa(visualQa) {
  if (!visualQa) return { failed: false, reason: null };
  if (typeof visualQa === "string") {
    const failed = /fail|block|critical|regression/i.test(visualQa);
    return { failed, reason: failed ? visualQa : null };
  }
  const status = String(visualQa.status ?? visualQa.verdict ?? visualQa.result ?? "").toLowerCase();
  const failed = Boolean(visualQa.failed) || ["failed", "fail", "blocked", "critical"].includes(status);
  return { failed, reason: failed ? visualQa.reason ?? status ?? "visual QA failed" : null };
}

function classifyAmbiguity(ambiguity) {
  if (!ambiguity) return { blocked: false, reason: null };
  if (typeof ambiguity === "string") return { blocked: true, reason: ambiguity };
  if (Array.isArray(ambiguity)) {
    return {
      blocked: ambiguity.length > 0,
      reason: ambiguity.length > 0 ? `unresolved ambiguity (${ambiguity.length})` : null,
    };
  }
  if (typeof ambiguity === "object") {
    return {
      blocked: Boolean(ambiguity.blocked ?? ambiguity.required ?? ambiguity.unresolved),
      reason: ambiguity.reason ?? "unresolved ambiguity",
    };
  }
  return { blocked: Boolean(ambiguity), reason: "unresolved ambiguity" };
}

export function classifyChangedDomains(files = [], classification = classifyChangedFiles(files)) {
  const domains = new Set();
  const normalizedFiles = files.map(normalizedLowerPath).filter(Boolean);
  for (const file of normalizedFiles) addPathDomains(domains, file);
  addRoleDomains(domains, classification);

  if (domains.has("frontend") && (domains.has("backend") || domains.has("api") || domains.has("data"))) {
    domains.add("integration");
  }

  return [...domains].sort();
}

export function classifyOrchestrationState({
  changedFiles = [],
  failures = [],
  failureSignatures = {},
  visualQa = null,
  ambiguity = null,
  costUSD = 0,
  maxCostUSD = null,
  repeatedFailureThreshold = DEFAULT_REPEATED_FAILURE_THRESHOLD,
} = {}) {
  const files = [...new Set(changedFiles.map(normalizePath).filter(Boolean))].sort();
  const classification = classifyChangedFiles(files);
  const changedDomains = classifyChangedDomains(files, classification);
  const signatures = normalizeFailureSignatures(failures, failureSignatures);
  const threshold = Number.isFinite(Number(repeatedFailureThreshold))
    ? Number(repeatedFailureThreshold)
    : DEFAULT_REPEATED_FAILURE_THRESHOLD;
  const repeated = Object.entries(signatures)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  const visualQaState = classifyVisualQa(visualQa);
  const ambiguityState = classifyAmbiguity(ambiguity);
  const budget = classifyBudget({ costUSD, maxCostUSD });
  const blockedReasons = [];

  if (repeated) {
    blockedReasons.push(`failure signature repeated ${repeated[1]} time(s): ${repeated[0]}`);
  }
  if (visualQaState.failed) blockedReasons.push(`visual QA failed: ${visualQaState.reason}`);
  if (ambiguityState.blocked) blockedReasons.push(ambiguityState.reason);
  if (budget.exceeded) blockedReasons.push(`cost budget exceeded (${budget.costUSD} >= ${budget.maxCostUSD})`);
  else if (budget.nearLimit) blockedReasons.push(`cost budget near limit (${budget.costUSD} / ${budget.maxCostUSD})`);

  return {
    changedFiles: files,
    changedDomains,
    requiredReviewerRoles: classification.reviewers ?? [],
    requiredCoordinatorRoles: classification.coordinators ?? [],
    failureSignatures: signatures,
    failureEscalation: repeated
      ? { required: true, signature: repeated[0], count: repeated[1], threshold }
      : { required: false, signature: null, count: 0, threshold },
    visualQa: visualQaState,
    ambiguity: ambiguityState,
    blockedReasons,
    budget,
  };
}
