# Phase 4 — Cache prime

## Skip condition

If `config.cache.enabled === false` (default): phase is a no-op.
Push `{phase: 4, status: "disabled"}` to state and exit.

## Codex-specific caveat

Codex intermediates OpenAI's prompt cache. Cache hit rate is **not**
exposed in `exec_command` response metadata in v1, so any "savedRatio"
this phase reports is a **heuristic estimate**, not a measured value.
Document this prominently in the Phase 5 audit report.

The cache-prime mechanic on Codex differs from the CC version:

| Aspect | Claude Code | Codex |
|---|---|---|
| API | Anthropic SDK direct call | `exec_command` no-op session reuse |
| Cohort key | `system + tools` slice | `system + tools + session_id` (if `exec_command` exposes session reuse) |
| Cache TTL | 5 minutes (Anthropic) | OpenAI cache TTL varies; assume conservative 4 minutes |
| Observability | `cache_creation_input_tokens` / `cache_read_input_tokens` in response | None observable through Codex |

## Steps (when enabled)

1. Evaluate ROI heuristically: short sessions can lose money to priming.
   If `state.session.estimatedMinutes < 30`: warn user and skip
   (`reason: "short-session"`).
2. Compute cohort key — `{primingStrategy, codexSessionId?,
   branch?}`. On Codex, the session_id is the durable identifier
   (where exposed); branch from `git rev-parse --abbrev-ref HEAD`.
3. Call `schedulePrime({config, primeFn, immediateFirstPrime: true})`
   — fires the first prime synchronously then schedules at
   `warmInterval` (default 240s).
4. `primeFn` issues a minimal `exec_command` no-op (e.g. `:` or
   `echo thrift-prime`) targeting the same session, hoping to keep
   the OpenAI session cache warm. This is a **best-effort** strategy
   — see caveat above.
5. Each prime increments `state.cachePrimes[]` via
   `recordCachePrime(state, {cohort, costUSD: estimatedPrimeCost})`.
   `estimatedPrimeCost` uses the input-rate from `cost-estimator.mjs`
   for the configured primary model.
6. Cancel the schedule on `session_end` (handled by the
   `thrift-sessionend-audit` hook).
7. Push `{phase: 4, completedAt, fires: <n>}` to state.

## Cohort options

- **session** (default): one cohort per Codex session. Cache hits
  within the current chat.
- **branch**: includes `git branch` in the cohort key. Useful when
  switching branches mid-session — prevents wrong-branch cache
  contamination.
- **session + branch**: both signals. Most conservative.

## On error

- `exec_command` call fails (network, rate-limit): log + continue.
  Schedule remains active for next interval.
- ROI gate skipped phase: state records `{phase: 4, status: "skipped-roi"}`.
- Cache disabled: state records `{phase: 4, status: "disabled"}`.

## Why default-disabled on Codex

Per the porting decomposition spec: priming a cache you can't measure
is a gamble. Until Codex surfaces cache-hit telemetry, leaving Phase 4
opt-in protects users on short sessions from paying for prime calls
that may or may not pay back.
