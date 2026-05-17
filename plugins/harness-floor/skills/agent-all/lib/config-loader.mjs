import { readFileSync, existsSync } from "node:fs";

export const DEFAULTS = {
  defaults: { maxIter: 1, maxCostUSD: 50, waveSize: "medium", brainstormFirst: true, createPR: true },
  waves: {
    small:  { maxParallel: 2, rolesAllowed: ["dev", "reviewer"] },
    medium: { maxParallel: 4, rolesAllowed: ["frontend-dev", "backend-dev", "designer", "reviewer"] },
    large:  { maxParallel: 8, rolesAllowed: ["frontend-dev", "backend-dev", "designer", "qa-*", "reviewer", "doc-writer"] },
  },
  loop: { breakCondition: "npm test", stableIters: 1 },
  gates: { specReview: true, qualityReview: true, blockOnCritical: true },
  pr: { branchPrefix: "feat/agent-all/", baseBranch: "main" },
};

function validate(cfg) {
  const errors = [];
  if (cfg.defaults?.maxIter !== undefined && typeof cfg.defaults.maxIter !== "number") {
    errors.push({ path: "defaults.maxIter", message: "must be number" });
  }
  if (cfg.defaults?.maxCostUSD !== undefined && typeof cfg.defaults.maxCostUSD !== "number") {
    errors.push({ path: "defaults.maxCostUSD", message: "must be number" });
  }
  if (cfg.defaults?.waveSize !== undefined && !["small", "medium", "large"].includes(cfg.defaults.waveSize)) {
    errors.push({ path: "defaults.waveSize", message: "must be small|medium|large" });
  }
  return errors;
}

function deepMerge(base, override) {
  if (override == null) return base;
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
