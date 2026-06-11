import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { artifactPaths } from "./artifact-paths.mjs";

export const COST_TELEMETRY_SCHEMA_VERSION = "agent-cost-telemetry/v1";

export const DEFAULT_COST_TELEMETRY = {
  enabled: true,
  warnAtRatio: 0.8,
  fallbackUSDPerKChar: 0.0015,
  modelRates: {},
};

const SAFE_RUN_ID = /[^A-Za-z0-9._-]/g;

function sanitizeRunId(runId) {
  const safe = String(runId || "default").replace(SAFE_RUN_ID, "-");
  return safe || "default";
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function rounded(value, places = 6) {
  return Number(Number(value || 0).toFixed(places));
}

function addToBucket(bucket, key, amount) {
  const safeKey = stringOrNull(key) ?? "unknown";
  bucket[safeKey] = rounded((bucket[safeKey] ?? 0) + (amount ?? 0));
}

function tokenRate(record, modelRates = {}) {
  for (const key of [record.model, record.platform, "default"]) {
    const rate = objectOrEmpty(modelRates[key]);
    if (Object.keys(rate).length) return rate;
  }
  return {};
}

function rateValue(rate, ...keys) {
  for (const key of keys) {
    const value = numberOrNull(rate[key]);
    if (value !== null) return value;
  }
  return null;
}

function estimateWithTokens(record, modelRates) {
  const rate = tokenRate(record, modelRates);
  if (!Object.keys(rate).length) return null;

  const inputRate = rateValue(rate, "input", "inputUSDPerMTok", "in");
  const cachedInputRate = rateValue(rate, "cachedInput", "cacheRead", "cachedInputUSDPerMTok") ?? inputRate;
  const outputRate = rateValue(rate, "output", "outputUSDPerMTok", "out");
  if (inputRate === null && outputRate === null) return null;

  const cachedInputTokens = record.cachedInputTokens ?? 0;
  const uncachedInputTokens = Math.max(0, (record.inputTokens ?? 0) - cachedInputTokens);
  const inputUSD = inputRate === null ? 0 : (uncachedInputTokens * inputRate) / 1_000_000;
  const cachedInputUSD = cachedInputRate === null ? 0 : (cachedInputTokens * cachedInputRate) / 1_000_000;
  const outputUSD = outputRate === null ? 0 : ((record.outputTokens ?? 0) * outputRate) / 1_000_000;
  const total = inputUSD + cachedInputUSD + outputUSD;
  if (total <= 0) return null;

  return {
    costUSD: rounded(total),
    source: "estimated_tokens",
    breakdown: {
      inputUSD: rounded(inputUSD),
      cachedInputUSD: rounded(cachedInputUSD),
      outputUSD: rounded(outputUSD),
    },
  };
}

function estimateWithChars(record, fallbackUSDPerKChar) {
  if (!Number.isFinite(fallbackUSDPerKChar) || fallbackUSDPerKChar <= 0) return null;
  const chars = record.transcriptChars ?? record.outputChars ?? 0;
  if (chars <= 0) return null;
  return {
    costUSD: rounded((chars / 1000) * fallbackUSDPerKChar),
    source: "estimated_chars",
    breakdown: { chars, fallbackUSDPerKChar },
  };
}

function usageObject(input = {}) {
  return objectOrEmpty(input.usage ?? input.tokens ?? input.tokenUsage);
}

function textLength(input = {}) {
  const text = input.transcript ?? input.output ?? input.outputText ?? input.resultText ?? input.responseText;
  if (typeof text !== "string") return 0;
  return text.length;
}

export function normalizeUsageRecord(input = {}, options = {}) {
  const usage = usageObject(input);
  const now = options.now instanceof Date ? options.now.toISOString() : options.now;
  const inputTokens = numberOrNull(
    input.inputTokens,
    input.promptTokens,
    input.prompt_tokens,
    usage.inputTokens,
    usage.promptTokens,
    usage.prompt_tokens,
    usage.input_tokens,
  );
  const cachedInputTokens = numberOrNull(
    input.cachedInputTokens,
    input.cacheReadTokens,
    input.cached_input_tokens,
    usage.cachedInputTokens,
    usage.cacheReadTokens,
    usage.cached_input_tokens,
  );
  const outputTokens = numberOrNull(
    input.outputTokens,
    input.completionTokens,
    input.completion_tokens,
    usage.outputTokens,
    usage.completionTokens,
    usage.completion_tokens,
    usage.output_tokens,
  );
  const totalTokens = numberOrNull(
    input.totalTokens,
    input.total_tokens,
    usage.totalTokens,
    usage.total_tokens,
  ) ?? ((inputTokens ?? 0) + (outputTokens ?? 0) || null);
  const declaredCostUSD = numberOrNull(
    input.costUSD,
    input.cost_usd,
    input.cost,
    usage.costUSD,
    usage.cost_usd,
    usage.cost,
  );

  return {
    schemaVersion: COST_TELEMETRY_SCHEMA_VERSION,
    timestamp: stringOrNull(input.timestamp ?? input.at) ?? now ?? new Date().toISOString(),
    runId: stringOrNull(input.runId ?? input.run_id) ?? "default",
    taskId: stringOrNull(input.taskId ?? input.task_id),
    displayId: stringOrNull(input.displayId ?? input.display_id),
    platform: stringOrNull(input.platform) ?? "unknown",
    phase: stringOrNull(input.phase),
    wave: numberOrNull(input.wave, input.waveIndex),
    agentId: stringOrNull(input.agentId ?? input.agent_id),
    agentRole: stringOrNull(input.agentRole ?? input.role),
    model: stringOrNull(input.model ?? input.modelId ?? input.model_id ?? usage.model),
    source: stringOrNull(input.source) ?? "unknown",
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    dataBytes: numberOrNull(input.dataBytes, input.bytes, usage.dataBytes),
    outputChars: numberOrNull(input.outputChars) ?? textLength(input),
    transcriptChars: numberOrNull(input.transcriptChars) ?? textLength(input),
    declaredCostUSD,
  };
}

export function estimateRecordCost(record, {
  modelRates = {},
  fallbackUSDPerKChar = DEFAULT_COST_TELEMETRY.fallbackUSDPerKChar,
} = {}) {
  if (record.declaredCostUSD !== null && record.declaredCostUSD !== undefined) {
    return {
      costUSD: rounded(record.declaredCostUSD),
      source: "reported",
      breakdown: null,
    };
  }

  return estimateWithTokens(record, modelRates)
    ?? estimateWithChars(record, fallbackUSDPerKChar)
    ?? { costUSD: 0, source: "none", breakdown: null };
}

export function enrichUsageRecord(input = {}, options = {}) {
  const record = normalizeUsageRecord(input, options);
  const estimate = estimateRecordCost(record, options);
  return {
    ...record,
    costUSD: estimate.costUSD,
    estimateSource: estimate.source,
    estimateBreakdown: estimate.breakdown,
  };
}

export function budgetStatus({ totalUSD = 0, maxCostUSD = null, warnAtRatio = 0.8 } = {}) {
  const max = numberOrNull(maxCostUSD);
  if (max === null) {
    return {
      status: "unbounded",
      maxCostUSD: null,
      remainingUSD: null,
      usedRatio: null,
      warnAtRatio,
      nearLimit: false,
      exceeded: false,
    };
  }
  const ratio = max > 0 ? totalUSD / max : 0;
  const nearLimit = warnAtRatio > 0 && ratio >= warnAtRatio && totalUSD < max;
  const exceeded = totalUSD >= max;
  return {
    status: exceeded ? "exceeded" : nearLimit ? "near_limit" : "ok",
    maxCostUSD: max,
    remainingUSD: rounded(Math.max(0, max - totalUSD)),
    usedRatio: rounded(ratio, 4),
    warnAtRatio,
    nearLimit,
    exceeded,
  };
}

function recordsFrom(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.records)) return input.records;
  if (Array.isArray(input?.costTelemetry?.records)) return input.costTelemetry.records;
  return [];
}

export function summarizeCostTelemetry(input = [], {
  maxCostUSD = null,
  warnAtRatio = DEFAULT_COST_TELEMETRY.warnAtRatio,
  modelRates = {},
  fallbackUSDPerKChar = DEFAULT_COST_TELEMETRY.fallbackUSDPerKChar,
} = {}) {
  const sourceRecords = recordsFrom(input);
  const records = sourceRecords.map((record) => (
    record?.schemaVersion === COST_TELEMETRY_SCHEMA_VERSION && typeof record.costUSD === "number"
      ? record
      : enrichUsageRecord(record, { modelRates, fallbackUSDPerKChar })
  ));

  const summary = {
    schemaVersion: `${COST_TELEMETRY_SCHEMA_VERSION}-summary`,
    calls: records.length,
    totalUSD: 0,
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    dataBytes: 0,
    byPlatform: {},
    byModel: {},
    bySource: {},
  };

  for (const record of records) {
    summary.totalUSD = rounded(summary.totalUSD + (record.costUSD ?? 0));
    summary.totalTokens += record.totalTokens ?? 0;
    summary.inputTokens += record.inputTokens ?? 0;
    summary.cachedInputTokens += record.cachedInputTokens ?? 0;
    summary.outputTokens += record.outputTokens ?? 0;
    summary.dataBytes += record.dataBytes ?? 0;
    addToBucket(summary.byPlatform, record.platform, record.costUSD ?? 0);
    addToBucket(summary.byModel, record.model, record.costUSD ?? 0);
    addToBucket(summary.bySource, record.estimateSource, record.costUSD ?? 0);
  }

  summary.budget = budgetStatus({ totalUSD: summary.totalUSD, maxCostUSD, warnAtRatio });
  return summary;
}

export function createCostTelemetry(options = {}) {
  const config = { ...DEFAULT_COST_TELEMETRY, ...options };
  const records = [];

  function recordUsage(input = {}) {
    const record = enrichUsageRecord(input, config);
    records.push(record);
    return record;
  }

  function recordAgentUsage({ agentId, wave, role, payload = {}, ...rest } = {}) {
    return recordUsage({
      ...payload,
      ...rest,
      agentId,
      wave,
      agentRole: role ?? payload.role,
      source: rest.source ?? payload.source ?? "agent",
    });
  }

  function restore(snapshot = {}) {
    records.length = 0;
    for (const record of recordsFrom(snapshot)) {
      records.push(record?.schemaVersion === COST_TELEMETRY_SCHEMA_VERSION
        ? record
        : enrichUsageRecord(record, config));
    }
  }

  function summary() {
    return summarizeCostTelemetry(records, config);
  }

  function snapshot() {
    return {
      schemaVersion: COST_TELEMETRY_SCHEMA_VERSION,
      records: [...records],
      summary: summary(),
    };
  }

  return {
    recordUsage,
    recordAgentUsage,
    restore,
    records: () => [...records],
    summary,
    snapshot,
  };
}

export function costTelemetryLogPath({ cwd = process.cwd(), runId = "default", config = {} } = {}) {
  return join(cwd, artifactPaths(config).runsDir, sanitizeRunId(runId), "cost-telemetry.jsonl");
}

export function appendCostTelemetry({
  cwd = process.cwd(),
  runId = "default",
  records = [],
  summary = null,
  config = {},
  now = new Date(),
} = {}) {
  const path = costTelemetryLogPath({ cwd, runId, config });
  mkdirSync(dirname(path), { recursive: true });
  const timestamp = now instanceof Date ? now.toISOString() : String(now);
  const normalizedRecords = records.map((record) => (
    record?.schemaVersion === COST_TELEMETRY_SCHEMA_VERSION ? record : enrichUsageRecord(record)
  ));
  const entry = {
    schemaVersion: COST_TELEMETRY_SCHEMA_VERSION,
    timestamp,
    runId,
    records: normalizedRecords,
    summary: summary ?? summarizeCostTelemetry(normalizedRecords),
  };
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
  return path;
}
