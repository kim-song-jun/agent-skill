# Phase 4 — Cache prime

## Skip condition

If `config.cache.enabled === false` (default): phase is a no-op.
Push `{phase: 4, status: "disabled"}` to state and exit.

## Steps (when enabled)

1. Evaluate ROI via `evaluateCachePrimeROI({sessionMinutes, expectedPausesOver5Min})`
   from `lib/cache-prime.mjs`. If `worthIt === false`: warn user with
   the reason and skip.
2. Compute cohort key via `computeCohortKey({config})`. Cohort honors
   `cache.shareCohortAcross` (`session`, `branch`, or both).
3. Call `schedulePrime({config, primeFn, immediateFirstPrime: true})`
   — fires the first prime synchronously then schedules at
   `warmInterval`.
4. `primeFn` is a caller-supplied async function that makes a no-op
   model call with the cohort key in the system prompt. **Sandbox v1**:
   primeFn is heuristic — emits an empty `ctx_execute(language:
   "javascript", code: "")` call which gets cached at the tool-call
   layer. Production: wire to Anthropic SDK direct.
5. Each successful prime increments `state.cachePrimes[]` via
   `recordCachePrime(state, {cohort, costUSD: estimatedPrimeCost})`.
6. Cancel the schedule on SessionEnd (handled by the `thrift-sessionend-audit`
   hook).
7. Push `{phase: 4, completedAt, fires: <n>}` to state.

## Cohort options

- **session** (default): one cohort per session. Cache hits within the
  current chat.
- **branch**: includes `git branch` in the cohort key. Useful when
  switching branches mid-session — prevents wrong-branch cache contamination.
- **session + branch**: both signals. Most conservative.

## On error

- prime call fails (network, rate-limit): log + continue. Schedule
  remains active for next interval.
- ROI gate skipped phase: state records `{phase: 4, status: "skipped-roi"}`.
- Cache disabled: state records `{phase: 4, status: "disabled"}`.
