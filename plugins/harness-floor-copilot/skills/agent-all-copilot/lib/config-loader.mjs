import { readFileSync, existsSync } from "node:fs";

export const DEFAULTS = {
  defaults: { maxIter: 10, maxCostUSD: 500, waveSize: "large", brainstormFirst: true, createPR: true },
  telemetry: {
    cost: {
      enabled: true,
      warnAtRatio: 0.8,
      fallbackUSDPerKChar: 0.0015,
      modelRates: {},
    },
  },
  waves: {
    small:  { maxParallel: 2, rolesAllowed: ["dev", "reviewer"] },
    medium: { maxParallel: 4, rolesAllowed: ["dev", "frontend-dev", "backend-dev", "designer", "reviewer"] },
    large:  { maxParallel: 8, rolesAllowed: ["dev", "frontend-dev", "backend-dev", "designer", "qa-*", "reviewer", "doc-writer"] },
  },
  loop: { breakCondition: "npm test", stableIters: 1, maxRuntimeSec: null, maxRepeatedFailureSignature: 3 },
  gates: { specReview: true, qualityReview: true, adversarialVerify: true, blockOnCritical: true },
  pr: { branchPrefix: "feat/agent-all/", baseBranch: "main" },
  policy: { decisionSurfacing: true, verification: true, reviewerAudit: true, qaAudit: true },
  security: {
    redaction: {
      enabled: true,
      allowPaths: [],
      allowRules: [],
      failOn: ["high"],
      maskOn: ["high", "medium"],
    },
  },
  artifact: { root: ".agent-skill", exportDocs: false },
  language: "auto",
};

const LANGUAGES = ["auto", "en", "ko"];

export function resolveLanguage(value) {
  if (value !== "auto") return value;
  const env = (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "").toLowerCase();
  if (env.startsWith("ko")) return "ko";
  return "en";
}

function validate(cfg) {
  const errors = [];
  if (cfg.defaults?.maxIter !== undefined && cfg.defaults.maxIter !== null && typeof cfg.defaults.maxIter !== "number") {
    errors.push({ path: "defaults.maxIter", message: "must be number or null" });
  }
  if (cfg.defaults?.maxCostUSD !== undefined && typeof cfg.defaults.maxCostUSD !== "number") {
    errors.push({ path: "defaults.maxCostUSD", message: "must be number" });
  }
  if (cfg.telemetry?.cost?.enabled !== undefined && typeof cfg.telemetry.cost.enabled !== "boolean") {
    errors.push({ path: "telemetry.cost.enabled", message: "must be boolean" });
  }
  if (cfg.telemetry?.cost?.warnAtRatio !== undefined && typeof cfg.telemetry.cost.warnAtRatio !== "number") {
    errors.push({ path: "telemetry.cost.warnAtRatio", message: "must be number" });
  }
  if (cfg.telemetry?.cost?.fallbackUSDPerKChar !== undefined && typeof cfg.telemetry.cost.fallbackUSDPerKChar !== "number") {
    errors.push({ path: "telemetry.cost.fallbackUSDPerKChar", message: "must be number" });
  }
  if (cfg.telemetry?.cost?.modelRates !== undefined && (
    !cfg.telemetry.cost.modelRates || typeof cfg.telemetry.cost.modelRates !== "object" || Array.isArray(cfg.telemetry.cost.modelRates)
  )) {
    errors.push({ path: "telemetry.cost.modelRates", message: "must be object" });
  }
  if (cfg.defaults?.waveSize !== undefined && !["small", "medium", "large"].includes(cfg.defaults.waveSize)) {
    errors.push({ path: "defaults.waveSize", message: "must be small|medium|large" });
  }
  if (cfg.language !== undefined && !LANGUAGES.includes(cfg.language)) {
    errors.push({ path: "language", message: `must be one of ${LANGUAGES.join("|")}` });
  }
  if (cfg.artifactRoot !== undefined && typeof cfg.artifactRoot !== "string") {
    errors.push({ path: "artifactRoot", message: "must be string" });
  }
  if (cfg.artifact?.root !== undefined && typeof cfg.artifact.root !== "string") {
    errors.push({ path: "artifact.root", message: "must be string" });
  }
  if (cfg.artifact?.exportDocs !== undefined && typeof cfg.artifact.exportDocs !== "boolean") {
    errors.push({ path: "artifact.exportDocs", message: "must be boolean" });
  }
  if (cfg.security?.redaction?.enabled !== undefined && typeof cfg.security.redaction.enabled !== "boolean") {
    errors.push({ path: "security.redaction.enabled", message: "must be boolean" });
  }
  for (const key of ["allowPaths", "allowRules", "failOn", "maskOn"]) {
    if (cfg.security?.redaction?.[key] !== undefined && !Array.isArray(cfg.security.redaction[key])) {
      errors.push({ path: `security.redaction.${key}`, message: "must be array" });
    }
  }
  if (cfg.loop?.maxIter !== undefined && cfg.loop.maxIter !== null && typeof cfg.loop.maxIter !== "number") {
    errors.push({ path: "loop.maxIter", message: "must be number or null" });
  }
  if (cfg.loop?.maxRepeatedFailureSignature !== undefined && typeof cfg.loop.maxRepeatedFailureSignature !== "number") {
    errors.push({ path: "loop.maxRepeatedFailureSignature", message: "must be number" });
  }
  if (cfg.loop?.maxRuntimeSec !== undefined && cfg.loop.maxRuntimeSec !== null && typeof cfg.loop.maxRuntimeSec !== "number") {
    errors.push({ path: "loop.maxRuntimeSec", message: "must be number or null" });
  }
  if (cfg.loop?.breakCondition !== undefined) {
    const bc = cfg.loop.breakCondition;
    if (typeof bc === "string") {
      if (!bc.trim()) errors.push({ path: "loop.breakCondition", message: "string must be non-empty" });
    } else if (bc && typeof bc === "object") {
      const allowed = ["shell", "test-auto", "visual-qa", "verification-adapter", "composite"];
      if (!allowed.includes(bc.type)) {
        errors.push({ path: "loop.breakCondition.type", message: `must be one of ${allowed.join("|")}` });
      }
    } else {
      errors.push({ path: "loop.breakCondition", message: "must be string or {type,...}" });
    }
  }
  for (const key of ["specReview", "qualityReview", "adversarialVerify", "blockOnCritical"]) {
    if (cfg.gates?.[key] !== undefined && typeof cfg.gates[key] !== "boolean") {
      errors.push({ path: `gates.${key}`, message: "must be boolean" });
    }
  }
  return errors;
}

function deepMerge(base, override) {
  if (override === undefined) return base;
  if (override === null) return null;
  if (typeof base !== "object" || typeof override !== "object" || Array.isArray(base) || Array.isArray(override)) return override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = deepMerge(base[k], v);
  }
  return out;
}

export function loadConfig(path) {
  if (!existsSync(path)) {
    return { ok: true, config: DEFAULTS, warning: true };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return { ok: false, errors: [{ path, message: `invalid JSON: ${e.message}` }] };
  }
  const errors = validate(raw);
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: deepMerge(DEFAULTS, raw) };
}
