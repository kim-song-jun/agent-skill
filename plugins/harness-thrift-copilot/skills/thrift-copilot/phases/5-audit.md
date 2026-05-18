# Phase 5 — Audit (Copilot)

## Inputs (from state + config)

- `.thrift-state.json` — accumulated metrics this session
- `store_memory(key: "thrift/state")` — durable mirror (read as
  fallback if the file is missing)
- `.thrift.json` — config; especially `audit.outputPath` and
  `audit.mirrorToStoreMemory`

## Steps

1. Read state via `readState({statePath, invoker})` from
   `lib/metrics-collector.mjs` (file first, memory fallback). If both
   sources are missing, write a minimal "no-data" report (still useful
   as a signal that thrift ran).

2. Load config via `loadConfig()` from `lib/config-loader.mjs`.

3. Build audit context: aggregate `state.modelCalls` through
   `cost-estimator.estimateSession()` (OpenAI rate table). Produce a
   `{date, durationMinutes, turnCount, actualUSD, baselineUSD,
   savedUSD, savedPercent, tokensInUncached, tokensInCached, tokensOut,
   summarisers[], coercions[], cachePrimes[], perModelRows[],
   storeMemoryStatus, intermediationNote}` blob.

4. Render `templates/audit-report.md.hbs` with the context using the
   vendored `render()` helper.

5. Resolve `audit.outputPath` placeholder `<date>` → `YYYY-MM-DD`. If
   file exists: append timestamp suffix (`-HHMM`).

6. Write report to disk.

7. If `audit.mirrorToStoreMemory` is true: mirror the rendered report
   AND the state JSON into `store_memory(key:
   "thrift/audit/<date>")`. Best-effort — failure does not abort.

8. Push `{phase: 5, completedAt}` to state.

## Output to user

```
Thrift audit: <duration> min session, <turns> turns,
  $<actual> actual vs $<baseline> baseline (saved <%>).
  Report: <output-path>
  Memory mirror: <ok|degraded|disabled>
  Intermediation note: <emitted|none>
```

## Intermediation note

Because Copilot proxies the underlying model, the audit's `actualUSD`
column is a **best-effort estimate** based on the configured
`summariser.model` (and `read_agent` cost fields if available).
Whenever Copilot's billing surface differs from the rate-table
estimate, the audit emits an `intermediationNote` block listing the
known caveats:

- Token counts may be inflated by Copilot's internal scaffolding
  (system prompts, tool-use envelopes) that the user-side never sees.
- Cache-read column is **not measured** — it shows `0` unless Copilot
  starts exposing cache-hit telemetry per call.
- Summariser cost column assumes the configured `summariser.model`
  was actually used; if Copilot picks a different model, real cost
  may differ.

> **TODO: verify whether Copilot's `read_agent` (or equivalent)
> exposes a `costUSD` or `tokensIn/tokensOut` field.** If yes,
> substitute measured values for the rate-table estimates.

## On error

- State file AND memory mirror both missing → minimal "no-data"
  report.
- Output path not writable → fall back to `.thrift/audit-<date>.md`
  and warn.
- Render failure → log the partial state; user can re-run
  `/thrift-copilot audit`.
- `store_memory` mirror failure → log degradation; report still
  written to disk.
