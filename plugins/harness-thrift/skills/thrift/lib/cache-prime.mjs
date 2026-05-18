// Cache prime — schedules a no-op model call at warmInterval to keep
// the Anthropic prompt cache (system+tools cohort) warm during human
// thinking pauses.
//
// Cache TTL is 300s; warmInterval default 240s leaves a 60s safety
// margin.
//
// Cohort strategy:
//   - "tools-only": prime call includes only the tools definition.
//     Smaller cache cohort, lower prime cost, narrower hit benefit.
//   - "system-and-tools": prime call includes system prompt + tools.
//     Larger cache cohort, larger prime cost, broader hit benefit.
//
// shareCohortAcross: ["session"] — single cohort per session
//                    ["branch"] — include `git branch` in system prompt
//                                 so cache is per-branch (not contaminated)
//                    ["session", "branch"] — combined
//
// Contract:
//   schedulePrime({config, primeFn, intervalMs?, immediateFirstPrime?})
//     primeFn: async (cohortKey) => {costUSD, ok}
//     Returns a handle: {cancel(), nextFireAt}
//
// Tests pass a mock primeFn; production wires it to a real Anthropic
// SDK call.

import { spawnSync } from "node:child_process";

function getBranchCohort() {
  try {
    const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8" });
    return r.status === 0 ? r.stdout.trim() : "no-git";
  } catch {
    return "no-git";
  }
}

export function computeCohortKey({ config, branchProvider = getBranchCohort }) {
  const parts = [];
  if (config.cache.shareCohortAcross.includes("session")) parts.push("session");
  if (config.cache.shareCohortAcross.includes("branch")) {
    parts.push(`branch:${branchProvider()}`);
  }
  return parts.join("|") || "default";
}

export function schedulePrime({
  config,
  primeFn,
  intervalMs,
  immediateFirstPrime = false,
  branchProvider,
}) {
  if (!config.cache.enabled) {
    return { cancel: () => {}, nextFireAt: null, disabled: true };
  }
  if (typeof primeFn !== "function") {
    throw new Error("primeFn required");
  }
  const cohortKey = computeCohortKey({ config, branchProvider });
  const interval = intervalMs ?? config.cache.warmInterval * 1000;

  const state = { cancelled: false, lastFireAt: null, fires: 0 };

  let timer = null;
  function fire() {
    if (state.cancelled) return;
    state.lastFireAt = Date.now();
    state.fires += 1;
    Promise.resolve(primeFn(cohortKey)).catch(() => {});
    timer = setTimeout(fire, interval);
  }

  if (immediateFirstPrime) {
    fire();
  } else {
    timer = setTimeout(fire, interval);
  }

  return {
    cancel: () => {
      state.cancelled = true;
      if (timer) clearTimeout(timer);
    },
    nextFireAt: () => Date.now() + interval,
    fires: () => state.fires,
    cohortKey,
  };
}

// ROI gate: cache prime only pays for itself if the session lasts
// long enough that saved cache hits exceed prime cost.
//
//   estimatedPrimeCostPerCall × callsPerSession <= estimatedSavedPerCacheHit × cacheHits
//
// Rough rule of thumb: prime is worth it if the session > 15 min AND
// the user pauses long enough between turns to lose the cache.
//
// Returns {worthIt: bool, reason}
export function evaluateCachePrimeROI({ sessionMinutes, expectedPausesOver5Min }) {
  if (sessionMinutes < 15) {
    return { worthIt: false, reason: "session too short — prime cost exceeds expected savings" };
  }
  if (expectedPausesOver5Min === 0) {
    return { worthIt: false, reason: "no expected long pauses — cache stays warm naturally" };
  }
  return { worthIt: true, reason: "long session with expected pauses — prime amortizes" };
}
