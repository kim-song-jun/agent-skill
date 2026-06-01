// Estimate actual vs naive-baseline cost for a Gemini / Vertex session.
//
// Differences vs the CC `harness-thrift` estimator:
//   1. Rate table targets the Gemini family (gemini-pro, gemini-flash,
//      gemini-flash-lite).
//   2. Separate `cacheRead` AND `cacheWrite` rates — Vertex bills cache
//      writes explicitly (Anthropic auto-writes; CC version conflates).
//   3. New `storage` term — Vertex bills cached prefixes per cache-hour.
//      `estimate(...)` accepts `storageHours` and `tokensCached` to add
//      this line.
//   4. Documents `minTokenThreshold` per model — sub-threshold "cached"
//      tokens fall back to uncached rates (no cache entry was created).
//
// Contract:
//   estimate({tokensInUncached, tokensInCached, tokensOut, model,
//             storageHours, applyMinTokenGate})
//     → { actualUSD, baselineUSD, savedRatio, breakdown }
//
//   storageHours: optional (default 0). Multiplies storage cost into
//                 actualUSD. Baseline does NOT include storage (baseline
//                 = no caching at all).
//   applyMinTokenGate: optional bool (default true). When true and
//                      tokensInCached < model.minTokenThreshold, the
//                      "cached" tokens are reclassified as uncached
//                      (Vertex would not have created a cache entry).
//
// Baseline assumption: "naive-gemini" means no cache hits, no
// summarisation, no tool-call coercion — every input token would have
// been re-read at the full uncached rate.

// Rates per 1M tokens (USD). Release provenance: these are advisory
// Gemini-family values captured during the 2026-05 implementation window.
// Refresh them against Google Vertex pricing during release audits before
// changing RATES.
// Cache-read rate is typically ~0.25x input on Vertex (vs Anthropic's
// 0.1x); cache-write is typically ~1.0x input (the first read pays full
// rate to establish the cache). Storage rate is per 1M tokens per hour.
//
// Per-model minTokenThreshold — Vertex context caching requires a
// minimum prefix size for cache entries to be created. Sub-threshold
// "cached" tokens reduce to uncached at audit time. Values per Google
// Vertex docs as of 2026-05; verify quarterly.
const RATES = {
  "gemini-pro": {
    in: 1.25,        // advisory input rate
    out: 5.0,        // advisory output rate
    cacheRead: 0.3125,   // ~0.25x input
    cacheWrite: 1.25,    // ~1.0x input on first read
    storagePerHour: 4.50, // per 1M tokens-hour
    minTokenThreshold: 32000, // gemini-1.5-pro context cache minimum
  },
  "gemini-flash": {
    in: 0.075,       // advisory input rate for summariser model
    out: 0.30,       // advisory output rate
    cacheRead: 0.01875,  // ~0.25x input
    cacheWrite: 0.075,   // ~1.0x input
    storagePerHour: 1.00, // per 1M tokens-hour
    minTokenThreshold: 4096, // smaller models typically lower thresholds
  },
  "gemini-flash-lite": {
    in: 0.04,        // advisory input rate; cache surface may vary
    out: 0.16,       // advisory output rate
    cacheRead: 0.01,
    cacheWrite: 0.04,
    storagePerHour: 0.50,
    minTokenThreshold: 4096,
  },
};

export const SUPPORTED_MODELS = Object.keys(RATES);

function rateOrThrow(model) {
  if (!RATES[model]) {
    throw new Error(`unknown model rate: ${model}. Supported: ${SUPPORTED_MODELS.join(", ")}`);
  }
  return RATES[model];
}

/**
 * Estimate cost for a single model invocation on Vertex/Gemini.
 *
 * @param {object} args
 * @param {number} args.tokensInUncached  Input tokens read fresh (no cache).
 * @param {number} args.tokensInCached    Input tokens read from cache.
 * @param {number} args.tokensOut         Output tokens.
 * @param {string} args.model             SUPPORTED_MODELS entry.
 * @param {number} [args.tokensWritten]   Tokens written to cache this call
 *                                        (first-read prefix). Default: 0
 *                                        (assumes cache already populated).
 * @param {number} [args.storageHours]    Hours the cache prefix has been
 *                                        stored. Default: 0. Multiplied into
 *                                        actualUSD via storagePerHour.
 * @param {boolean} [args.applyMinTokenGate]  When true (default), reclassify
 *                                            cached tokens as uncached if
 *                                            tokensInCached < model.minTokenThreshold.
 */
export function estimate({
  tokensInUncached,
  tokensInCached,
  tokensOut,
  model,
  tokensWritten = 0,
  storageHours = 0,
  applyMinTokenGate = true,
}) {
  const r = rateOrThrow(model);

  // Apply minimum-token gate: Vertex would not create a cache entry below
  // the prefix threshold, so "cached" tokens degrade to uncached cost.
  let effUncached = tokensInUncached;
  let effCached = tokensInCached;
  let degraded = false;
  if (applyMinTokenGate && tokensInCached > 0 && tokensInCached < r.minTokenThreshold) {
    effUncached = tokensInUncached + tokensInCached;
    effCached = 0;
    degraded = true;
  }

  const actualInUncached = (effUncached * r.in) / 1_000_000;
  const actualInCached = (effCached * r.cacheRead) / 1_000_000;
  const actualWrite = (tokensWritten * r.cacheWrite) / 1_000_000;
  const actualStorage = (effCached * r.storagePerHour * storageHours) / 1_000_000;
  const actualOut = (tokensOut * r.out) / 1_000_000;
  const actualUSD = actualInUncached + actualInCached + actualWrite + actualStorage + actualOut;

  // Baseline: all input tokens would have been uncached; no cache write;
  // no storage cost. (Baseline represents the no-thrift, no-Vertex-caching
  // world.)
  const baselineIn = ((effUncached + effCached) * r.in) / 1_000_000;
  const baselineOut = actualOut; // output cost is the same regardless of cache
  const baselineUSD = baselineIn + baselineOut;

  const savedRatio = baselineUSD > 0 ? 1 - actualUSD / baselineUSD : 0;

  return {
    actualUSD: Number(actualUSD.toFixed(6)),
    baselineUSD: Number(baselineUSD.toFixed(6)),
    savedRatio: Number(savedRatio.toFixed(4)),
    breakdown: {
      uncachedIn: Number(actualInUncached.toFixed(6)),
      cachedIn: Number(actualInCached.toFixed(6)),
      cacheWrite: Number(actualWrite.toFixed(6)),
      storage: Number(actualStorage.toFixed(6)),
      out: Number(actualOut.toFixed(6)),
    },
    degradedBelowMinTokens: degraded,
  };
}

// Aggregate across multiple model invocations within a session.
export function estimateSession(records) {
  let actualUSD = 0;
  let baselineUSD = 0;
  let storageUSD = 0;
  const perModel = {};
  for (const rec of records) {
    const r = estimate(rec);
    actualUSD += r.actualUSD;
    baselineUSD += r.baselineUSD;
    storageUSD += r.breakdown.storage;
    perModel[rec.model] ??= { actualUSD: 0, baselineUSD: 0, calls: 0, storageUSD: 0 };
    perModel[rec.model].actualUSD += r.actualUSD;
    perModel[rec.model].baselineUSD += r.baselineUSD;
    perModel[rec.model].storageUSD += r.breakdown.storage;
    perModel[rec.model].calls += 1;
  }
  return {
    actualUSD: Number(actualUSD.toFixed(6)),
    baselineUSD: Number(baselineUSD.toFixed(6)),
    storageUSD: Number(storageUSD.toFixed(6)),
    savedRatio: baselineUSD > 0 ? Number((1 - actualUSD / baselineUSD).toFixed(4)) : 0,
    perModel,
  };
}

// Expose the rate table for callers that need to introspect (e.g.
// vertex-cache-eval.mjs's payback period formula).
export function getRate(model) {
  return rateOrThrow(model);
}
