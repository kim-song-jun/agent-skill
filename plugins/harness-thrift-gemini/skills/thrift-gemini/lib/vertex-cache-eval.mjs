// Vertex-specific ROI gate for prompt-cache priming.
//
// Why a Gemini-specific gate (vs the CC `evaluateCachePrimeROI`)?
//   1. **Minimum-token threshold.** Vertex context caching requires a
//      minimum prefix size (e.g. 32k tokens for gemini-1.5-pro) before
//      a cache entry is created. Sub-threshold "prime" calls pay full
//      uncached cost AND produce no cache. The gate must short-circuit
//      below the threshold.
//   2. **Free tier guardrails.** On Gemini free tier the prime call
//      consumes request budget without producing observable cache hits
//      (rate limits + intermediation). The gate refuses to prime when
//      `cache.vertex.tier === "free"`.
//   3. **Storage-time payback.** Vertex bills cached prefixes per
//      storage hour. The gate computes a payback period: prime is worth
//      it only when `cacheHits × (input - cacheRead) ≥
//      writeCost + storageCost × storageTimeHours`.
//
// Contract:
//   evaluateVertexCachePrimeROI({
//     sessionMinutes,            // expected total session minutes
//     expectedPausesOver5Min,    // estimated count of long pauses
//     accumulatedTokens,         // tokens already in the session prefix
//     expectedCacheHits,         // expected number of cache reads
//     config,                    // the loaded .thrift.json
//     model,                     // model whose rate table to consult (default "gemini-pro")
//   }) → { worthIt: bool, reason: string, paybackHits?: number }

import { getRate } from "./cost-estimator.mjs";

const MIN_SESSION_MINUTES = 15;

export function evaluateVertexCachePrimeROI({
  sessionMinutes,
  expectedPausesOver5Min,
  accumulatedTokens,
  expectedCacheHits,
  config,
  model = "gemini-pro",
}) {
  // Guard: config shape sanity.
  const vertex = config?.cache?.vertex;
  if (!vertex) {
    return { worthIt: false, reason: "config.cache.vertex missing — refusing to prime without Vertex tier info" };
  }

  // 1. Free-tier short-circuit.
  if (vertex.tier === "free") {
    return { worthIt: false, reason: "free-tier — prime consumes request budget without producing observable cache hits" };
  }

  // 2. Minimum-token gate.
  const minTokens = vertex.minTokenThreshold;
  if (typeof accumulatedTokens === "number" && accumulatedTokens < minTokens) {
    return {
      worthIt: false,
      reason: `min-tokens — accumulated ${accumulatedTokens} < Vertex cache minimum ${minTokens}`,
    };
  }

  // 3. Session-length gate (same as CC).
  if (sessionMinutes < MIN_SESSION_MINUTES) {
    return { worthIt: false, reason: `short-session — ${sessionMinutes}min < ${MIN_SESSION_MINUTES}min minimum` };
  }

  // 4. Pause gate (same as CC).
  if (expectedPausesOver5Min === 0) {
    return { worthIt: false, reason: "no-pauses — cache stays warm naturally" };
  }

  // 5. Storage-time payback. Compute the break-even cache hit count.
  //    Per-hit saving = (input - cacheRead) × accumulatedTokens
  //    Up-front cost = (cacheWrite × accumulatedTokens) + (storagePerHour × accumulatedTokens × storageTimeHours)
  //    paybackHits = ceil(upFront / perHit)
  let paybackHits;
  if (typeof accumulatedTokens === "number" && accumulatedTokens > 0) {
    let r;
    try {
      r = getRate(model);
    } catch {
      return { worthIt: false, reason: `unknown model ${model} — cannot evaluate payback` };
    }
    const perHitSavings = ((r.in - r.cacheRead) * accumulatedTokens) / 1_000_000;
    const writeCost = (r.cacheWrite * accumulatedTokens) / 1_000_000;
    const storageCost = (r.storagePerHour * accumulatedTokens * vertex.storageTimeHours) / 1_000_000;
    const upFront = writeCost + storageCost;
    if (perHitSavings <= 0) {
      return { worthIt: false, reason: "cacheRead rate ≥ input rate — caching produces no per-hit saving" };
    }
    paybackHits = Math.ceil(upFront / perHitSavings);

    if (typeof expectedCacheHits === "number" && expectedCacheHits < paybackHits) {
      return {
        worthIt: false,
        reason: `storage-payback-too-long — need ${paybackHits} cache hits to amortise storage; only ${expectedCacheHits} expected`,
        paybackHits,
      };
    }
  }

  return {
    worthIt: true,
    reason: "long session with expected pauses, above min-token threshold, payback achievable",
    paybackHits,
  };
}

// Standalone helper: did this prime call actually produce a cache entry?
// Vertex semantics: only when tokensInPrefix >= minTokenThreshold.
export function wouldCreateCacheEntry({ tokensInPrefix, config }) {
  const min = config?.cache?.vertex?.minTokenThreshold ?? Infinity;
  return tokensInPrefix >= min;
}
