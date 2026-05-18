// Estimate actual vs naive-baseline cost for a Copilot CLI session.
//
// Contract:
//   estimate({tokensInUncached, tokensInCached, tokensOut, model})
//     → { actualUSD, baselineUSD, savedRatio, breakdown }
//
// Baseline assumption: "naive-copilot" means no cache hits, no
// summarisation, no tool-call coercion — every "cached" input token
// would have been re-read at the full uncached rate.
//
// IMPORTANT: Rates below are **ASSUMED; verify against current OpenAI
// pricing.** Copilot intermediates the underlying OpenAI / GitHub-Models
// layer, so these rates represent the *upstream* cost — not what
// Copilot ultimately bills the user. The audit's intermediationNote
// documents this clearly.
//
// > TODO: verify rates against
//   https://openai.com/api/pricing/  (OpenAI)
//   and GitHub Models pricing once stabilised.

// Rates per 1M tokens (USD). OpenAI cache-read multiplier is currently
// 0.5× (verify quarterly).
//
// gpt-5-nano: assumed cheapest summariser-class model.
// gpt-5: assumed flagship; rates are placeholder pending stable pricing.
// gpt-5-mini: assumed mid-tier.
// o4-mini: assumed reasoning-class.
const RATES = {
  "gpt-5": { in: 5.0, out: 20.0, cacheRead: 2.5 },
  "gpt-5-mini": { in: 0.5, out: 2.0, cacheRead: 0.25 },
  "gpt-5-nano": { in: 0.15, out: 0.6, cacheRead: 0.075 },
  "o4-mini": { in: 1.1, out: 4.4, cacheRead: 0.55 },
};

export const SUPPORTED_MODELS = Object.keys(RATES);

// Provenance metadata for the audit report's intermediation note.
export const RATE_TABLE_PROVENANCE = {
  source: "assumed",
  notes: "Rates are assumed for the harness-thrift-copilot v0.1 scaffold. Verify against current OpenAI pricing and GitHub Models pricing. Copilot intermediates the model layer, so user-side billing may differ from these upstream rates.",
  cacheReadMultiplierAssumption: "0.5× (OpenAI standard)",
  lastVerifiedAt: null,
};

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
    provenance: RATE_TABLE_PROVENANCE,
  };
}
