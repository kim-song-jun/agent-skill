export const VERIFICATION_ADAPTER_SCHEMA_VERSION = "verification-adapter/v1";
export const VERIFICATION_PLAN_SCHEMA_VERSION = "verification-plan/v1";
export const VERIFICATION_EVIDENCE_SCHEMA_VERSION = "verification-evidence/v1";

export const VERIFICATION_ADAPTER_IDS = [
  "verify:web-ui",
  "verify:cli",
  "verify:api-contract",
  "verify:notebook-data",
  "verify:sql-db",
  "verify:batch-job",
];

export const VERIFICATION_STATUSES = ["passed", "failed", "blocked", "skipped"];
export const FAILURE_SEVERITIES = ["critical", "major", "minor", "info"];

const ADAPTER_ALIASES = new Map([
  ["web-ui", "verify:web-ui"],
  ["visual-qa", "verify:web-ui"],
  ["ui", "verify:web-ui"],
  ["cli", "verify:cli"],
  ["api", "verify:api-contract"],
  ["api-contract", "verify:api-contract"],
  ["openapi", "verify:api-contract"],
  ["notebook", "verify:notebook-data"],
  ["notebook-data", "verify:notebook-data"],
  ["data", "verify:notebook-data"],
  ["sql", "verify:sql-db"],
  ["sql-db", "verify:sql-db"],
  ["db", "verify:sql-db"],
  ["batch", "verify:batch-job"],
  ["batch-job", "verify:batch-job"],
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function normalizeAdapterId(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (VERIFICATION_ADAPTER_IDS.includes(lowered)) return lowered;
  const withoutPrefix = lowered.startsWith("verify:") ? lowered.slice("verify:".length) : lowered;
  return ADAPTER_ALIASES.get(withoutPrefix) ?? null;
}

export function isVerificationAdapterId(value) {
  return normalizeAdapterId(value) != null;
}

export function normalizeVerificationPlan(input = {}) {
  if (!isPlainObject(input)) return null;
  const adapter = normalizeAdapterId(input.adapter ?? input.id);
  if (!adapter) return null;
  const plan = {
    schemaVersion: VERIFICATION_PLAN_SCHEMA_VERSION,
    adapter,
    config: isPlainObject(input.config) ? cloneJson(input.config) : {},
  };
  if (typeof input.label === "string" && input.label.trim()) plan.label = input.label.trim();
  if (Array.isArray(input.commands)) plan.commands = input.commands.map(String).filter(Boolean);
  if (typeof input.command === "string" && input.command.trim()) plan.command = input.command.trim();
  return plan;
}

export function normalizeFailure(input = {}, index = 0) {
  const severity = FAILURE_SEVERITIES.includes(input.severity) ? input.severity : "major";
  return {
    id: typeof input.id === "string" && input.id.trim() ? input.id.trim() : `failure-${index + 1}`,
    message: typeof input.message === "string" && input.message.trim() ? input.message.trim() : "verification failed",
    severity,
  };
}

export function normalizeEvidence(input = {}) {
  if (!isPlainObject(input)) return null;
  const adapter = normalizeAdapterId(input.adapter);
  const status = VERIFICATION_STATUSES.includes(input.status) ? input.status : null;
  if (!adapter || !status) return null;
  const evidence = {
    schemaVersion: VERIFICATION_EVIDENCE_SCHEMA_VERSION,
    adapter,
    status,
    summary: typeof input.summary === "string" && input.summary.trim()
      ? input.summary.trim()
      : `${adapter} ${status}`,
  };
  if (typeof input.command === "string" && input.command.trim()) evidence.command = input.command.trim();
  if (Array.isArray(input.artifacts)) evidence.artifacts = input.artifacts.map(String).filter(Boolean);
  if (Array.isArray(input.failures) && input.failures.length > 0) {
    evidence.failures = input.failures.map(normalizeFailure);
  }
  if (isPlainObject(input.reproducibility)) {
    evidence.reproducibility = cloneJson(input.reproducibility);
  }
  if (isPlainObject(input.metadata)) evidence.metadata = cloneJson(input.metadata);
  if (typeof input.timestamp === "string" && input.timestamp.trim()) evidence.timestamp = input.timestamp.trim();
  return evidence;
}

export function validateEvidence(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return [{ path: "evidence", message: "must be an object" }];
  }
  if (input.schemaVersion !== undefined && input.schemaVersion !== VERIFICATION_EVIDENCE_SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: `must be ${VERIFICATION_EVIDENCE_SCHEMA_VERSION}` });
  }
  if (!normalizeAdapterId(input.adapter)) {
    errors.push({ path: "adapter", message: `must be one of ${VERIFICATION_ADAPTER_IDS.join("|")}` });
  }
  if (!VERIFICATION_STATUSES.includes(input.status)) {
    errors.push({ path: "status", message: `must be one of ${VERIFICATION_STATUSES.join("|")}` });
  }
  if (typeof input.summary !== "string" || !input.summary.trim()) {
    errors.push({ path: "summary", message: "must be a non-empty string" });
  }
  if (input.failures !== undefined && !Array.isArray(input.failures)) {
    errors.push({ path: "failures", message: "must be an array when present" });
  }
  return errors;
}

export function assertValidEvidence(input) {
  const normalized = normalizeEvidence(input);
  const errors = validateEvidence(normalized ?? input);
  if (errors.length > 0) {
    const message = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`invalid verification evidence: ${message}`);
  }
  return normalized;
}

export function evidencePassed(evidence) {
  return normalizeEvidence(evidence)?.status === "passed";
}

export function summarizeEvidence(input) {
  const evidence = normalizeEvidence(input);
  if (!evidence) return "invalid verification evidence";
  const failures = evidence.failures?.length ? `; failures=${evidence.failures.length}` : "";
  return `${evidence.adapter} ${evidence.status}: ${evidence.summary}${failures}`;
}
