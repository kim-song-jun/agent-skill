// Render .thrift-state.json + .thrift.json into the audit report context.
//
// Contract:
//   buildAuditContext({state, config}) → context object ready for
//   the report.md.hbs template.

import { estimateSession } from "./cost-estimator.mjs";

function round(n, places = 4) {
  return Number(Number(n).toFixed(places));
}

function pct(ratio) {
  return Math.round(Number(ratio) * 10000) / 100; // 2-decimal percentage
}

function minutesBetween(isoA, isoB) {
  return Math.round((new Date(isoB) - new Date(isoA)) / 60000);
}

export function buildAuditContext({ state, config, now = new Date() }) {
  const session = estimateSession(state.modelCalls);

  const tokensInTotal = state.tokensInUncached + state.tokensInCached;
  const cacheHitRate = tokensInTotal > 0
    ? pct(state.tokensInCached / tokensInTotal)
    : 0;

  const summarisers = state.summarisers.map((s) => ({
    ...s,
    savedPercent: pct(s.savedRatio),
  }));

  const coercionAccepted = state.coercions.filter((c) => c.accepted).length;
  const coercionAcceptRate = state.coercions.length > 0
    ? pct(coercionAccepted / state.coercions.length)
    : 0;

  const primeTotalUSD = round(
    state.cachePrimes.reduce((sum, p) => sum + (p.costUSD || 0), 0),
    6,
  );

  const perModelRows = Object.entries(session.perModel).map(([model, m]) => ({
    model,
    calls: m.calls,
    actualUSD: round(m.actualUSD),
    baselineUSD: round(m.baselineUSD),
  }));

  return {
    date: now.toISOString().slice(0, 10),
    sessionStartedAt: state.sessionStartedAt,
    durationMinutes: minutesBetween(state.sessionStartedAt, now.toISOString()),
    turnCount: state.turnCount,
    tokensInUncached: state.tokensInUncached,
    tokensInCached: state.tokensInCached,
    tokensOut: state.tokensOut,
    tokensInTotal,
    cacheHitRate,
    actualUSD: round(session.actualUSD),
    baselineUSD: round(session.baselineUSD),
    savedUSD: round(session.baselineUSD - session.actualUSD),
    savedPercent: pct(session.savedRatio),
    perModelRows,
    summarisers,
    summariserFires: summarisers.length > 0,
    noSummariserFires: summarisers.length === 0,
    coercions: state.coercions,
    coercionFires: state.coercions.length > 0,
    noCoercionFires: state.coercions.length === 0,
    coercionAcceptRate,
    cachePrimes: state.cachePrimes,
    cachePrimeFires: state.cachePrimes.length > 0,
    noCachePrimeFires: state.cachePrimes.length === 0,
    primeTotalUSD,
    phases: state.phases,
    thriftVersion: "0.1.0",
  };
}
