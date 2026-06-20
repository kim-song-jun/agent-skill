// cost-accumulator.mjs — parses `--output-format json` token counts and
// accumulates per-wave / per-run cost. Falls back to a transcript-length
// heuristic when the JSON payload doesn't include cost data.
//
// Input sources (in priority order):
//   1) payload.costUSD          — explicit USD cost (preferred)
//   2) payload.usage.{input_tokens,output_tokens} × MODEL_RATE
//   3) payload.tokens.{input,output} × MODEL_RATE
//   4) transcript.length × FALLBACK_CHAR_RATE (last-resort estimate)
//
// Rates are conservative; users should override via opts.modelRates if
// they have plan-specific pricing.
//
// Authenticated Gemini CLI payloads may omit `costUSD`; usage fields are
// accepted when present and otherwise the caller falls back to estimates.

// Default USD/token rates. Conservative estimates; override as needed.
export const DEFAULT_RATES = {
  // Per spec porting-notes: agent-all defaults to gemini-2.5-pro tier.
  "gemini-2.5-pro": { input: 1.25e-6, output: 5.00e-6 },
  "gemini-2.5-flash": { input: 0.075e-6, output: 0.30e-6 },
  "gemini-1.5-pro": { input: 1.25e-6, output: 5.00e-6 },
  "gemini-1.5-flash": { input: 0.075e-6, output: 0.30e-6 },
  default: { input: 1.25e-6, output: 5.00e-6 },
};

// Fallback: USD per character of transcript. Order-of-magnitude only.
// Calibrated to ~ 4 chars/token × default output rate.
export const FALLBACK_CHAR_RATE = 1.25e-6;

function pickRate(model, rates) {
  const table = rates || DEFAULT_RATES;
  return table[model] || table.default || DEFAULT_RATES.default;
}

// Extract cost from a single subprocess payload. Returns
// { costUSD, source: "explicit"|"tokens"|"fallback"|"none", details }.
export function extractCost(payload, opts = {}) {
  if (payload == null || typeof payload !== "object") {
    return { costUSD: 0, source: "none", details: { reason: "no payload" } };
  }

  if (typeof payload.costUSD === "number" && Number.isFinite(payload.costUSD)) {
    return { costUSD: Math.max(0, payload.costUSD), source: "explicit", details: { field: "costUSD" } };
  }
  if (typeof payload.cost_usd === "number" && Number.isFinite(payload.cost_usd)) {
    return { costUSD: Math.max(0, payload.cost_usd), source: "explicit", details: { field: "cost_usd" } };
  }

  const usage = payload.usage || payload.tokens || null;
  if (usage && typeof usage === "object") {
    const inTokens = Number(usage.input_tokens ?? usage.input ?? usage.prompt_tokens ?? 0);
    const outTokens = Number(usage.output_tokens ?? usage.output ?? usage.completion_tokens ?? 0);
    if (Number.isFinite(inTokens) && Number.isFinite(outTokens) && (inTokens > 0 || outTokens > 0)) {
      const rate = pickRate(payload.model || opts.model, opts.modelRates);
      const cost = inTokens * rate.input + outTokens * rate.output;
      return { costUSD: cost, source: "tokens", details: { inTokens, outTokens, rate, model: payload.model || opts.model || "default" } };
    }
  }

  // Fallback: transcript length heuristic.
  const transcript = typeof payload.transcript === "string" ? payload.transcript : "";
  if (transcript.length > 0) {
    const cost = transcript.length * (opts.fallbackCharRate ?? FALLBACK_CHAR_RATE);
    return { costUSD: cost, source: "fallback", details: { chars: transcript.length, rate: opts.fallbackCharRate ?? FALLBACK_CHAR_RATE } };
  }

  return { costUSD: 0, source: "none", details: { reason: "no usage data" } };
}

// Estimate from raw transcript text (used when a subprocess crashed mid-write
// and we only have stdout / partial output to inspect).
export function estimateFromTranscript(text, opts = {}) {
  const len = typeof text === "string" ? text.length : 0;
  if (len === 0) return { costUSD: 0, source: "none" };
  const rate = opts.fallbackCharRate ?? FALLBACK_CHAR_RATE;
  return { costUSD: len * rate, source: "fallback", details: { chars: len, rate } };
}

// Accumulator: track running total, per-task breakdown, budget cap.
export class CostAccumulator {
  constructor(opts = {}) {
    this.maxCostUSD = typeof opts.maxCostUSD === "number" ? opts.maxCostUSD : Infinity;
    this.modelRates = opts.modelRates || DEFAULT_RATES;
    this.fallbackCharRate = opts.fallbackCharRate ?? FALLBACK_CHAR_RATE;
    this.totalUSD = 0;
    this.byTask = []; // [{taskId, costUSD, source}]
    this.overBudgetAt = null;
  }

  add(taskId, payload, opts = {}) {
    const c = extractCost(payload, {
      model: opts.model,
      modelRates: this.modelRates,
      fallbackCharRate: this.fallbackCharRate,
    });
    this.byTask.push({ taskId, costUSD: c.costUSD, source: c.source });
    this.totalUSD += c.costUSD;
    if (this.overBudgetAt == null && this.totalUSD > this.maxCostUSD) {
      this.overBudgetAt = { taskId, totalUSD: this.totalUSD, maxCostUSD: this.maxCostUSD };
    }
    return c;
  }

  isOverBudget() {
    return this.totalUSD > this.maxCostUSD;
  }

  summary() {
    return {
      totalUSD: this.totalUSD,
      maxCostUSD: this.maxCostUSD,
      overBudget: this.isOverBudget(),
      overBudgetAt: this.overBudgetAt,
      taskCount: this.byTask.length,
      bySource: this.byTask.reduce((acc, t) => {
        acc[t.source] = (acc[t.source] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

// Convenience: accumulate over a batch of {taskId, payload} pairs.
export function accumulate(batch, opts = {}) {
  const acc = new CostAccumulator(opts);
  for (const item of batch) {
    acc.add(item.taskId, item.payload, { model: item.model });
  }
  return acc.summary();
}

export const __internal = { pickRate };
