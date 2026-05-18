// Builds the audit-report.md.hbs render context from state + config.
// Copilot variant: uses OpenAI-rate cost-estimator, surfaces the
// intermediation note flag, and reports store_memory mirror status.

import { estimateSession, RATE_TABLE_PROVENANCE } from "./cost-estimator.mjs";

const PLUGIN_VERSION = "0.1.0";

function pct(n) {
  return Number((n * 100).toFixed(2));
}

function safeDate(iso) {
  if (!iso) return "unknown";
  return String(iso).slice(0, 19).replace("T", " ");
}

export function buildAuditContext({ state, config, now = new Date() }) {
  const sessionStartedAt = state.sessionStartedAt || now.toISOString();
  const start = new Date(sessionStartedAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - start);
  const durationMinutes = Math.round(elapsedMs / 60_000);

  // Cost rollup.
  const records = (state.modelCalls || []).map((c) => ({
    tokensInUncached: c.tokensInUncached || 0,
    tokensInCached: c.tokensInCached || 0,
    tokensOut: c.tokensOut || 0,
    model: c.model,
  }));

  let actualUSD = 0;
  let baselineUSD = 0;
  let perModel = {};
  let provenance = RATE_TABLE_PROVENANCE;

  if (records.length > 0) {
    try {
      const sess = estimateSession(records);
      actualUSD = sess.actualUSD;
      baselineUSD = sess.baselineUSD;
      perModel = sess.perModel;
      provenance = sess.provenance;
    } catch {
      // Unknown model in records — leave totals at zero. The
      // intermediation note flag captures this gracefully.
    }
  }

  const savedUSD = Number((baselineUSD - actualUSD).toFixed(6));
  const savedPercent = baselineUSD > 0 ? pct(1 - actualUSD / baselineUSD) : 0;

  const tokensInUncached = state.tokensInUncached || 0;
  const tokensInCached = state.tokensInCached || 0;
  const tokensInTotal = tokensInUncached + tokensInCached;
  const cacheHitRate = tokensInTotal > 0 ? pct(tokensInCached / tokensInTotal) : 0;

  const perModelRows = Object.entries(perModel).map(([model, v]) => ({
    model,
    calls: v.calls,
    actualUSD: v.actualUSD.toFixed(6),
    baselineUSD: v.baselineUSD.toFixed(6),
  }));

  // Summariser activity
  const summarisers = (state.summarisers || []).map((s) => ({
    at: safeDate(s.at),
    reason: s.reason,
    tokensBefore: s.tokensBefore,
    tokensAfter: s.tokensAfter,
    savedPercent: pct(s.savedRatio || 0),
    mirrorStatus: s.mirrorStatus || "unknown",
  }));

  // Coercions
  const coercions = (state.coercions || []).map((c) => ({
    at: safeDate(c.at),
    tool: c.tool,
    suggestion: c.suggestion,
    accepted: c.accepted ? "yes" : "no",
  }));
  const acceptedCount = (state.coercions || []).filter((c) => c.accepted).length;
  const coercionAcceptRate = coercions.length > 0 ? pct(acceptedCount / coercions.length) : 0;

  // Cache primes
  const cachePrimes = (state.cachePrimes || []).map((p) => ({
    at: safeDate(p.at),
    cohort: p.cohort,
    costUSD: Number(p.costUSD || 0).toFixed(6),
  }));
  const primeTotalUSD = (state.cachePrimes || []).reduce((acc, p) => acc + Number(p.costUSD || 0), 0).toFixed(6);

  // Phases
  const phases = (state.phases || []).map((p) => ({
    phase: p.phase,
    completedAt: safeDate(p.completedAt),
  }));

  const storeMemoryStatus = state.storeMemoryDegraded
    ? "degraded (file fallback)"
    : (config?.storeMemory?.enabled ? "enabled" : "disabled");

  return {
    date: now.toISOString().slice(0, 10),
    durationMinutes,
    turnCount: state.turnCount || 0,
    sessionStartedAt: safeDate(sessionStartedAt),
    storeMemoryStatus,
    actualUSD: actualUSD.toFixed(6),
    baselineUSD: baselineUSD.toFixed(6),
    savedUSD: savedUSD.toFixed(6),
    savedPercent,
    perModelRows,
    tokensInUncached,
    tokensInCached,
    tokensOut: state.tokensOut || 0,
    tokensInTotal,
    cacheHitRate,
    summarisers,
    summariserFires: summarisers.length > 0,
    noSummariserFires: summarisers.length === 0,
    coercions,
    coercionFires: coercions.length > 0,
    noCoercionFires: coercions.length === 0,
    coercionAcceptRate,
    cachePrimes,
    cachePrimeFires: cachePrimes.length > 0,
    noCachePrimeFires: cachePrimes.length === 0,
    primeTotalUSD,
    phases,
    thriftVersion: PLUGIN_VERSION,
    intermediationNote: provenance.notes,
  };
}
