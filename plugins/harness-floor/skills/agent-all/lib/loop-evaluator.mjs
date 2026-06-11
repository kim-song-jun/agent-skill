const DEFAULT_REPEATED_FAILURE_LIMIT = 3;
const MAX_SIGNATURE_LENGTH = 160;

export function isUnlimitedMaxIter(maxIter) {
  return maxIter == null || maxIter === 0;
}

export function formatMaxIter(maxIter) {
  return isUnlimitedMaxIter(maxIter) ? "unlimited" : String(maxIter);
}

function normalizeLine(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value) {
  const text = normalizeLine(value);
  if (text.length <= MAX_SIGNATURE_LENGTH) return text;
  return `${text.slice(0, MAX_SIGNATURE_LENGTH - 15).trimEnd()}... [truncated]`;
}

function firstMeaningfulLine(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function timestampMs(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function costTelemetrySummary(state = {}) {
  const telemetry = state.costTelemetry ?? state.telemetry?.cost ?? state.loop?.costTelemetry ?? null;
  if (!telemetry || typeof telemetry !== "object") return null;
  return telemetry.summary && typeof telemetry.summary === "object" ? telemetry.summary : telemetry;
}

function currentCostUSD(state = {}) {
  const summary = costTelemetrySummary(state);
  return firstFiniteNumber(
    summary?.totalUSD,
    summary?.totalCostUSD,
    summary?.costUSD,
    state.costUSD,
    state.loop?.costUSD,
  ) ?? 0;
}

export function computeFailureSignature(result = {}) {
  if (typeof result.failureSignature === "string" && result.failureSignature.trim()) {
    return truncate(result.failureSignature);
  }
  if (typeof result.verifierSummary === "string" && result.verifierSummary.trim()) {
    return truncate(result.verifierSummary);
  }
  const stderr = firstMeaningfulLine(result.stderr);
  if (stderr) return truncate(stderr);
  const stdout = firstMeaningfulLine(result.stdout);
  if (stdout) return truncate(stdout);
  return `exit:${result.exitCode ?? "unknown"}`;
}

function previousFailureSignatures(state = {}) {
  return {
    ...(state.failureSignatures ?? {}),
    ...(state.loop?.failureSignatures ?? {}),
  };
}

function incrementFailureSignature(state, signature) {
  if (!signature) return previousFailureSignatures(state);
  const failureSignatures = previousFailureSignatures(state);
  failureSignatures[signature] = (failureSignatures[signature] ?? 0) + 1;
  return failureSignatures;
}

export function buildLoopState({
  state = {},
  limits = {},
  result = {},
  consecutivePass = state.consecutivePass ?? 0,
  failureSignatures = previousFailureSignatures(state),
  lastFailureSignature = state.lastFailureSignature ?? state.loop?.lastFailureSignature ?? null,
  nextAction = "Continue loop from the next incomplete phase.",
} = {}) {
  const telemetrySummary = costTelemetrySummary(state);
  const runtime = runtimeBudget(state, limits);
  return {
    iter: state.iter ?? 0,
    consecutivePass,
    costUSD: currentCostUSD(state),
    costTelemetry: telemetrySummary,
    maxIter: isUnlimitedMaxIter(limits.maxIter) ? null : limits.maxIter,
    maxIterMode: isUnlimitedMaxIter(limits.maxIter) ? "unlimited" : "bounded",
    maxCostUSD: limits.maxCostUSD ?? null,
    startedAt: runtime?.startedAt ?? state.loopStartedAt ?? state.startedAt ?? state.loop?.startedAt ?? null,
    maxRuntimeSec: runtime?.maxRuntimeSec ?? limits.maxRuntimeSec ?? limits.timeBudgetSec ?? null,
    elapsedRuntimeSec: runtime?.elapsedRuntimeSec ?? null,
    lastBreakConditionExit: result.exitCode ?? state.lastBreakConditionExit ?? null,
    lastFailureSignature,
    failureSignatures,
    lastVerifierSummary: result.verifierSummary ?? state.lastVerifierSummary ?? null,
    lastTouchedFiles: result.touchedFiles ?? state.lastTouchedFiles ?? [],
    nextAction,
  };
}

function exhaustedVerdict(state, limits, reason, nextAction) {
  const loopState = buildLoopState({ state, limits, nextAction });
  return { action: "exhausted", exitCode: 3, reason, nextAction, loopState };
}

function costBudgetExceeded(state, limits) {
  if (limits.maxCostUSD == null) return false;
  return currentCostUSD(state) >= limits.maxCostUSD;
}

function maxIterExceeded(state, limits) {
  if (isUnlimitedMaxIter(limits.maxIter)) return false;
  return (state.iter ?? 0) >= limits.maxIter;
}

function runtimeBudget(state, limits) {
  const maxRuntimeSec = firstFiniteNumber(
    limits.maxRuntimeSec,
    limits.timeBudgetSec,
    typeof limits.maxRuntimeMs === "number" ? limits.maxRuntimeMs / 1000 : null,
    typeof limits.timeBudgetMs === "number" ? limits.timeBudgetMs / 1000 : null,
  );
  if (maxRuntimeSec === null || maxRuntimeSec <= 0) return null;
  const startedAt = state.loopStartedAt
    ?? state.startedAt
    ?? state.loop?.startedAt
    ?? state.loop?.loopStartedAt
    ?? null;
  const startedAtMs = timestampMs(startedAt);
  const nowMs = timestampMs(limits.now) ?? Date.now();
  if (startedAtMs === null || nowMs < startedAtMs) return null;
  return {
    maxRuntimeSec,
    startedAt,
    elapsedRuntimeSec: Math.floor((nowMs - startedAtMs) / 1000),
  };
}

function runtimeBudgetExceeded(state, limits) {
  const budget = runtimeBudget(state, limits);
  return Boolean(budget && budget.elapsedRuntimeSec >= budget.maxRuntimeSec);
}

export function evaluateLoop(state, limits, runner) {
  if (maxIterExceeded(state, limits)) {
    return exhaustedVerdict(
      state,
      limits,
      "max_iter_exhausted",
      "Increase --max-iter, set --max-iter=0 for unlimited mode, or inspect the current failure before continuing.",
    );
  }
  if (costBudgetExceeded(state, limits)) {
    return exhaustedVerdict(
      state,
      limits,
      "cost_budget_exhausted",
      "Stop the loop and ask the user before spending more budget.",
    );
  }
  if (runtimeBudgetExceeded(state, limits)) {
    return exhaustedVerdict(
      state,
      limits,
      "time_budget_exhausted",
      "Stop the loop and ask the user before spending more wall-clock time.",
    );
  }

  const result = runner();
  if (result?.action === "interrupted") {
    const loopState = buildLoopState({
      state,
      limits,
      result,
      nextAction: "Resume only after confirming the user intended to interrupt the loop.",
    });
    return { action: "interrupted", exitCode: 130, reason: "user_interrupted", loopState };
  }
  if (result?.action === "blocked" || result?.hardPolicyBlocked || result?.policyBlocked) {
    const loopState = buildLoopState({
      state,
      limits,
      result,
      nextAction: "Escalate to planner/user decision; a hard policy hook blocked the loop.",
    });
    return { action: "blocked", exitCode: 4, reason: "hard_policy_hook_blocked", loopState };
  }

  const exitCode = result?.exitCode ?? 1;
  if (exitCode === 0) {
    const consecutivePass = (state.consecutivePass ?? 0) + 1;
    const loopState = buildLoopState({
      state,
      limits,
      result,
      consecutivePass,
      lastFailureSignature: null,
      nextAction: consecutivePass >= limits.stableIters
        ? "Break condition satisfied; finish the loop."
        : "Run another iteration until stableIters is satisfied.",
    });
    if (consecutivePass >= limits.stableIters) {
      return { action: "break", consecutivePass, exitCode: 0, loopState };
    }
    return { action: "continue", consecutivePass, exitCode: 0, loopState };
  }

  const lastFailureSignature = computeFailureSignature({ ...result, exitCode });
  const failureSignatures = incrementFailureSignature(state, lastFailureSignature);
  const repeatedLimit = limits.maxRepeatedFailureSignature ?? DEFAULT_REPEATED_FAILURE_LIMIT;
  const repeatedCount = failureSignatures[lastFailureSignature] ?? 0;
  const repeatedFailure = repeatedLimit > 0 && repeatedCount >= repeatedLimit;
  const nextAction = repeatedFailure
    ? "Escalate to planner/user decision before another implementation iteration."
    : "Continue loop from the next incomplete phase.";
  const loopState = buildLoopState({
    state,
    limits,
    result: { ...result, exitCode },
    consecutivePass: 0,
    failureSignatures,
    lastFailureSignature,
    nextAction,
  });

  if (repeatedFailure) {
    return {
      action: "blocked",
      exitCode: 4,
      reason: "repeated_failure_signature",
      consecutivePass: 0,
      lastFailureSignature,
      failureSignatures,
      repeatedCount,
      loopState,
      nextAction,
    };
  }

  return {
    action: "continue",
    consecutivePass: 0,
    exitCode,
    lastFailureSignature,
    failureSignatures,
    loopState,
  };
}
