# Phase 4 — Cache Prime (Gemini / Vertex)

## Skip conditions (any one → no-op)

1. `config.cache.enabled === false` (default). Push
   `{phase: 4, status: "disabled"}` to state and exit.
2. `config.cache.vertex.tier === "free"`. Vertex free-tier rate limits
   make priming counterproductive — the prime call consumes request
   budget without producing useful cache hits. Push
   `{phase: 4, status: "skipped-free-tier"}` to state.
3. Accumulated session context < `config.cache.vertex.minTokenThreshold`.
   Vertex context caching requires a minimum prefix size, represented by
   the configured threshold. Refresh the threshold against Google Vertex
   docs during release audits. Sub-threshold primes pay full uncached cost
   and **do not produce a cache entry**. Push
   `{phase: 4, status: "skipped-min-tokens", accumulated: <N>}` to state.

## Steps (when not skipped)

1. Evaluate ROI via `evaluateVertexCachePrimeROI({sessionMinutes,
   expectedPausesOver5Min, accumulatedTokens, config})` from
   `lib/vertex-cache-eval.mjs`. If `worthIt === false`: warn user with
   the reason (`min-tokens` / `free-tier` / `short-session` /
   `no-pauses` / `storage-payback-too-long`) and skip.
2. Compute cohort key via `computeCohortKey({config})`. Cohort honors
   `cache.shareCohortAcross` (`session`, `branch`, or both). Same
   contract as CC.
3. Call `schedulePrime({config, primeFn, immediateFirstPrime: true})`
   — fires the first prime synchronously then schedules at
   `warmInterval` (default 240s).
4. `primeFn` is a caller-supplied async function that makes a no-op
   `gemini-pro` (or configured cache-target model) call with the cohort
   key in the system prompt. **Sandbox v1**: primeFn is a stub —
   no actual network call is made; the state record tracks intent.
   Production: wire to Vertex SDK direct.
5. Each successful prime increments `state.cachePrimes[]` with the
   estimated cost via `lib/cost-estimator.mjs` `estimate(...)` (which
   includes the storage-time cost component).
6. Cancel the schedule on next SessionStart or via explicit
   `/thrift-gemini uninstall`.
7. Push `{phase: 4, completedAt, fires: <n>}` to state.

## Cost model (Vertex)

Vertex caching has **three** cost components (CC has two):

1. **Cache write cost.** First call with the prefix charges full input
   rate to register the cache.
2. **Cache read cost.** Subsequent calls within the storage window
   charge a discounted per-token rate. Model-specific rates live in
   `lib/cost-estimator.mjs` and carry release-audit provenance comments.
3. **Storage cost.** Vertex bills per cache-hour per token stored.
   Multiply `storageTimeHours` × `tokensCached` × `storageRatePerHour`
   into the prime's true cost. This term *does not exist* in the CC
   estimator — see `lib/vertex-cache-eval.mjs` for the payback period
   formula.

Payback rule of thumb: prime is worth it when expected `cacheHits ×
(input - cacheRead) ≥ writeCost + storageCost × storageTimeHours`.

## On error

- Prime call fails (network, Vertex quota): log + continue. Schedule
  remains active for next interval.
- ROI gate skipped phase: state records `{phase: 4, status: "skipped-<reason>"}`.
- Cache disabled: state records `{phase: 4, status: "disabled"}`.

## Notes vs CC

- New skip conditions: free-tier, sub-threshold token count.
- New cost component: storage-time.
- Same cohort + schedule + cancel contract as `lib/cache-prime.mjs` on CC,
  but ROI gate is Gemini-specific (see `lib/vertex-cache-eval.mjs`).
- **Rate provenance** — rates and minimum thresholds are audit-time
  assumptions; refresh them against Google Vertex pricing during release
  audits before changing the estimator.
