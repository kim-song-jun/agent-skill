// Estimate actual vs naive-baseline cost for a session.
//
// Contract:
//   estimate({tokensInUncached, tokensInCached, tokensOut, model})
//     → { actualUSD, baselineUSD, savedRatio, breakdown }
//
// Baseline assumption: "naive-claude-code" means no cache hits, no
// summarisation, no tool-call coercion — every "cached" input token
// would have been re-read at the full uncached rate.

// Rates per 1M tokens (USD). Update quarterly from Anthropic's pricing
// page. Cache write is implicit (Anthropic auto-handles); cache read is
// 0.1x the input rate per current pricing tier.
const RATES = {
  "claude-opus-4-7": { in: 15.0, out: 75.0, cacheRead: 1.5 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4.0, cacheRead: 0.08 },
};

export const SUPPORTED_MODELS = Object.keys(RATES);

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
