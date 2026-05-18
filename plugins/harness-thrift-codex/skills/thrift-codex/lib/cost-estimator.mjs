// Estimate actual vs naive-baseline cost for a Codex session.
//
// Codex port of harness-thrift's cost-estimator. Independent OpenAI
// rate table — no cross-plugin import (per the per-platform
// decomposition spec's "Option B: independent copies" recommendation).
//
// Contract:
//   estimate({tokensInUncached, tokensInCached, tokensOut, model})
//     → { actualUSD, baselineUSD, savedRatio, breakdown }
//
// Baseline assumption: "naive-codex" means no cache hits, no
// summarisation, no tool-call coercion — every "cached" input token
// would have been re-read at the full uncached rate.
//
// OpenAI cache-read multiplier is currently 0.5× input (vs 0.1× for
// Anthropic). Verify quarterly against OpenAI's pricing page.

// Rates per 1M tokens (USD). Update quarterly from OpenAI's pricing
// page. Cache-read multiplier baked into `cacheRead`.
//
// NOTE: Codex's accessible model roster is fluid. Models listed here
// represent the families most commonly exposed via Codex CLI as of
// 2026-05. If a model is not listed, callers should pass `model` of
// `"unknown"` to get telemetry without raising.
const RATES = {
  // Primary coding models
  "gpt-5": { in: 10.0, out: 30.0, cacheRead: 5.0 },
  "gpt-5-mini": { in: 1.5, out: 6.0, cacheRead: 0.75 },
  "gpt-5-nano": { in: 0.3, out: 1.2, cacheRead: 0.15 },
  // o-series reasoning models (placeholder rates — verify)
  "o4-mini": { in: 1.1, out: 4.4, cacheRead: 0.55 },
  "o3": { in: 15.0, out: 60.0, cacheRead: 7.5 },
  // GPT-4o tier (legacy summariser fallback)
  "gpt-4o": { in: 2.5, out: 10.0, cacheRead: 1.25 },
  "gpt-4o-mini": { in: 0.15, out: 0.6, cacheRead: 0.075 },
};

export const SUPPORTED_MODELS = Object.keys(RATES);

// Multiplier-of-input convention shared with the CC port for
// documentation purposes. OpenAI publishes per-tier; we average to
// 0.5× as a stable default for cross-model reasoning.
export const CACHE_READ_MULTIPLIER = 0.5;

function rateOrThrow(model) {
  if (!RATES[model]) {
    throw new Error(`unknown model rate: ${model}. Supported: ${SUPPORTED_MODELS.join(", ")}`);
  }
  return RATES[model];
}

export function estimate({ tokensInUncached, tokensInCached, tokensOut, model }) {
  const r = rateOrThrow(model);
  const actualIn = (tokensInUncached * r.in + tokensInCached * r.cacheRead) / 1_000_000;
  const actualOut = (tokensOut * r.out) / 1_000_000;
  const actualUSD = actualIn + actualOut;

  // Baseline: all input tokens would have been uncached.
  const baselineIn = ((tokensInUncached + tokensInCached) * r.in) / 1_000_000;
  const baselineOut = actualOut; // output cost is the same regardless of cache
  const baselineUSD = baselineIn + baselineOut;

  const savedRatio = baselineUSD > 0 ? 1 - actualUSD / baselineUSD : 0;

  return {
    actualUSD: Number(actualUSD.toFixed(6)),
    baselineUSD: Number(baselineUSD.toFixed(6)),
    savedRatio: Number(savedRatio.toFixed(4)),
    breakdown: {
      uncachedIn: Number(((tokensInUncached * r.in) / 1_000_000).toFixed(6)),
      cachedIn: Number(((tokensInCached * r.cacheRead) / 1_000_000).toFixed(6)),
      out: Number(actualOut.toFixed(6)),
    },
  };
}

// Aggregate across multiple model invocations within a session.
export function estimateSession(records) {
  let actualUSD = 0;
  let baselineUSD = 0;
  const perModel = {};
  for (const rec of records) {
    const r = estimate(rec);
    actualUSD += r.actualUSD;
    baselineUSD += r.baselineUSD;
    perModel[rec.model] ??= { actualUSD: 0, baselineUSD: 0, calls: 0 };
    perModel[rec.model].actualUSD += r.actualUSD;
    perModel[rec.model].baselineUSD += r.baselineUSD;
    perModel[rec.model].calls += 1;
  }
  return {
    actualUSD: Number(actualUSD.toFixed(6)),
    baselineUSD: Number(baselineUSD.toFixed(6)),
    savedRatio: baselineUSD > 0 ? Number((1 - actualUSD / baselineUSD).toFixed(4)) : 0,
    perModel,
  };
}
