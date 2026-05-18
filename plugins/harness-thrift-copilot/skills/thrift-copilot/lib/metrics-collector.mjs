// Read+write .thrift-state.json. Vendored from the CC port; identical
// schema. Copilot-specific note: the audit hook may augment state with a
// `storeMemoryDegraded: true` flag if the bridge can't reach the MCP
// tool. Consumers should treat unknown fields as additive.

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const VERSION = "0.1.0";

export function freshState() {
  return {
    version: VERSION,
    platform: "copilot",
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
    storeMemoryDegraded: false,
  };
}

export function readState(path) {
  if (!existsSync(path)) return freshState();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return { ...freshState(), ...parsed };
  } catch {
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

export function recordSummariser(state, { reason, tokensBefore, tokensAfter, mirrorStatus = "unknown" }) {
  const savedRatio = tokensBefore > 0 ? 1 - tokensAfter / tokensBefore : 0;
  state.summarisers.push({
    at: new Date().toISOString(),
    reason,
    tokensBefore,
    tokensAfter,
    savedRatio: Number(savedRatio.toFixed(4)),
    mirrorStatus,
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

export function metricsSinceLastSummary(state) {
  const lastSum = state.summarisers[state.summarisers.length - 1];
  const lastAt = lastSum ? lastSum.at : state.sessionStartedAt;
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
