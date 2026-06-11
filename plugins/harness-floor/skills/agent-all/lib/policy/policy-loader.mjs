import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_POLICY = {
  hookEngine: true,
  decisionSurfacing: true,
  verification: true,
  reviewerAudit: true,
  qaAudit: true,
  coordinatorAudit: true,
  loopRunawayPrevention: true,
  maxDynamicAgentsPerWave: 8,
  maxDynamicSpawnsPerRole: 2,
  maxRepeatedFailureSignature: 3,
  maxCostUSD: null,
  costTelemetry: {
    enabled: true,
    warnAtRatio: 0.8,
    fallbackUSDPerKChar: 0.0015,
    modelRates: {},
  },
  requireSpawnRole: true,
  requireSpawnReason: true,
  requireSpawnBudget: true,
  requireNonTTYDecisionAudit: true,
  destructiveCommands: [],
  destructiveConfirmFlags: [],
  qualityDebt: true,
  qualityDebtAllowPaths: [],
  qualityDebtAllowRules: [],
  qualityDebtJustifications: [],
  security: {
    redaction: {
      enabled: true,
      allowPaths: [],
      allowRules: [],
      failOn: ["high"],
      maskOn: ["high", "medium"],
    },
  },
};

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function deepMerge(base, override) {
  if (override === undefined) return base;
  if (override === null) return null;
  if (typeof base !== "object" || typeof override !== "object" || Array.isArray(base) || Array.isArray(override)) {
    return override;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = deepMerge(base[key], value);
  }
  return out;
}

function readJson(path) {
  if (!existsSync(path)) return { found: false, data: null, warning: null };
  try {
    return { found: true, data: JSON.parse(readFileSync(path, "utf-8")), warning: null };
  } catch (error) {
    return { found: true, data: null, warning: `${path}: invalid JSON: ${error.message}` };
  }
}

function policyFromAgentAllConfig(data) {
  const config = objectOrEmpty(data);
  const policy = objectOrEmpty(config.policy);
  const inherited = {};
  if (typeof config.defaults?.maxCostUSD === "number") inherited.maxCostUSD = config.defaults.maxCostUSD;
  if (config.telemetry?.cost && typeof config.telemetry.cost === "object" && !Array.isArray(config.telemetry.cost)) {
    inherited.costTelemetry = config.telemetry.cost;
  }
  if (typeof config.loop?.maxRepeatedFailureSignature === "number") {
    inherited.maxRepeatedFailureSignature = config.loop.maxRepeatedFailureSignature;
  }
  if (typeof config.loop?.maxIter === "number" || config.loop?.maxIter === null) {
    inherited.maxIter = config.loop.maxIter;
  }
  if (config.security && typeof config.security === "object" && !Array.isArray(config.security)) {
    inherited.security = config.security;
  }
  return deepMerge(inherited, policy);
}

export function loadPolicyConfig({ cwd = process.cwd(), explicitPolicy = null } = {}) {
  let policy = { ...DEFAULT_POLICY };
  const warnings = [];

  const agentAll = readJson(join(cwd, ".agent-all.json"));
  if (agentAll.warning) warnings.push(agentAll.warning);
  if (agentAll.data) policy = deepMerge(policy, policyFromAgentAllConfig(agentAll.data));

  const policyFile = readJson(join(cwd, ".agent-skill", "policy.json"));
  if (policyFile.warning) warnings.push(policyFile.warning);
  if (policyFile.data) policy = deepMerge(policy, objectOrEmpty(policyFile.data.policy ?? policyFile.data));

  if (explicitPolicy) policy = deepMerge(policy, explicitPolicy);

  return { ok: warnings.length === 0, policy, warnings };
}
