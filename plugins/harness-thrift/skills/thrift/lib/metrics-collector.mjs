// Read+write .thrift-state.json. Aggregates session metrics for audit.
//
// State schema (additive only — old fields stay if unknown):
//   {
//     "version": "0.1.0",
//     "sessionStartedAt": "<iso>",
//     "turnCount": <int>,
//     "tokensInUncached": <int>,
//     "tokensInCached": <int>,
//     "tokensOut": <int>,
//     "modelCalls": [{model, tokensInUncached, tokensInCached, tokensOut, at}],
//     "summarisers": [{at, reason, tokensBefore, tokensAfter, savedRatio}],
//     "coercions": [{at, tool, suggestion, accepted}],
//     "cachePrimes": [{at, cohort, costUSD}],
//     "phases": [{phase, completedAt}],
//     "thresholds": {summariserTokenThreshold, summariserTurnThreshold}
//   }

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const VERSION = "0.1.0";

export function freshState() {
  return {
    version: VERSION,
    sessionStartedAt: new Date().toISOString(),
    turnCount: 0,
    tokensInUncached: 0,
    tokensInCached: 0,
    tokensOut: 0,
    modelCalls: [],
    summarisers: [],
    coercions: [],
    cachePrimes: [],
    phases: [],
    thresholds: {},
  };
}

export function readState(path) {
  if (!existsSync(path)) return freshState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    // Merge missing keys from freshState (additive resilience).
    return { ...freshState(), ...parsed };
  } catch {
    // Corrupt file → start fresh; preserve old as .bak.
    try { renameSync(path, `${path}.bak.${Date.now()}`); } catch {}
    return freshState();
  }
}

export function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export function recordTurn(state, { tokensInUncached = 0, tokensInCached = 0, tokensOut = 0, model = null }) {
  state.turnCount += 1;
  state.tokensInUncached += tokensInUncached;
  state.tokensInCached += tokensInCached;
  state.tokensOut += tokensOut;
  if (model) {
    state.modelCalls.push({
      model,
      tokensInUncached,
      tokensInCached,
      tokensOut,
      at: new Date().toISOString(),
    });
  }
  return state;
}

export function recordSummariser(state, { reason, tokensBefore, tokensAfter }) {
  const savedRatio = tokensBefore > 0 ? 1 - tokensAfter / tokensBefore : 0;
  state.summarisers.push({
    at: new Date().toISOString(),
    reason,
    tokensBefore,
    tokensAfter,
    savedRatio: Number(savedRatio.toFixed(4)),
  });
  return state;
}

export function recordCoercion(state, { tool, suggestion, accepted }) {
  state.coercions.push({
    at: new Date().toISOString(),
    tool,
    suggestion,
    accepted,
  });
  return state;
}

export function recordCachePrime(state, { cohort, costUSD }) {
  state.cachePrimes.push({
    at: new Date().toISOString(),
    cohort,
    costUSD,
  });
  return state;
}

export function recordPhase(state, phase) {
  state.phases.push({ phase, completedAt: new Date().toISOString() });
  return state;
}

// Since the last summariser fire, how many turns + tokens have accumulated?
export function metricsSinceLastSummary(state) {
  const lastSum = state.summarisers[state.summarisers.length - 1];
  const lastAt = lastSum ? lastSum.at : state.sessionStartedAt;
  // Sum modelCalls after lastAt.
  let tokens = 0;
  let turns = 0;
  for (const c of state.modelCalls) {
    if (c.at > lastAt) {
      tokens += c.tokensOut;
      turns += 1;
    }
  }
  return { turnsSinceLastSummary: turns, tokensSinceLastSummary: tokens };
}
