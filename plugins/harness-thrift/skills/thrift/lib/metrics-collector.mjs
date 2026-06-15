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
//     "coercions": [{at, tool, suggestion, target, accepted}],
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

export function recordCoercion(state, { tool, suggestion, target, accepted }) {
  const entry = {
    at: new Date().toISOString(),
    tool,
    suggestion,
    accepted,
  };
  // `target` is optional (older callers / hooks may omit it). Only persist
  // it when supplied so the entry shape stays backward-compatible.
  if (target !== undefined) entry.target = target;
  state.coercions.push(entry);
  return state;
}

// Correlate a later acceptance signal with an earlier suggestion. Finds the
// most-recent unaccepted coercion whose `target` matches and flips it to
// accepted:true. Idempotent and a safe no-op when nothing matches (e.g. the
// model used a ctx tool on a file we never suggested coercing).
export function markCoercionAccepted(state, { target }) {
  if (target === undefined || target === null) return state;
  if (!Array.isArray(state.coercions)) return state;
  for (let i = state.coercions.length - 1; i >= 0; i--) {
    const c = state.coercions[i];
    if (c && c.target === target && !c.accepted) {
      c.accepted = true;
      return state;
    }
  }
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
