# Phase 5 — Audit (Gemini)

## Inputs (from state + config)

- `.thrift-state.json` — accumulated metrics this session
- `.thrift.json` — config; especially `audit.outputPath` and `cache.vertex`

## Steps

1. Read state (initialise empty if missing).
2. Load config via `loadConfig()` from `lib/config-loader.mjs`.
3. Build audit context inline (no separate audit-renderer in v1):
   - `actualUSD`, `baselineUSD`, `savedPercent` via
     `estimateSession(records)` from `lib/cost-estimator.mjs` (which
     includes the Vertex storage-time term in the baseline-vs-actual
     comparison).
   - `vertexStorageUSD` separately surfaced — the storage cost
     component is itemised in the report (CC audit does not have this
     line).
   - `cachePrimes`, `summariser fires`, `coercion fires` from state.
4. Render `templates/audit-report.md.hbs` using the bin-vendored
   `render()` lib.
5. Resolve `audit.outputPath` placeholder `<date>` → `YYYY-MM-DD`. If
   file exists: append timestamp suffix (`-HHMM`).
6. Write report.
7. Push `{phase: 5, completedAt}` to state.

## Output to user

```
Thrift-gemini audit: <duration> min session, <turns> turns, $<actual> actual vs $<baseline> baseline (saved <%>).
Vertex storage spend: $<storage> (<hours>h)
Report: <output-path>
```

## On error

- State file missing → write a minimal "no-data" report (still useful
  as a signal that thrift ran).
- Output path not writable → fall back to `.thrift/audit-<date>.md` and
  warn.
- Render failure → log the partial state; user can re-run
  `/thrift-gemini audit`.

## Trigger

- **No native `SessionEnd` event in Gemini.** Audit fires on:
  1. Manual `/thrift-gemini audit` invocation.
  2. Next SessionStart hook (`thrift-sessionstart-cache-prime.mjs`)
     detects a stale `.thrift-state.json` from a prior session and
     writes the audit for the prior session BEFORE starting the new one.
  3. Optional: a wrapper script (out of scope for v1) that detects
     Gemini process exit and triggers audit.

## Notes vs CC

- New `vertexStorageUSD` line in the report (CC audit has no storage
  component).
- Audit-fires-on-next-SessionStart pattern is unique to Gemini (CC has
  SessionEnd). State must be designed to survive across sessions
  (it is — `.thrift-state.json` is just a file).
- Report template (`templates/audit-report.md.hbs`) shares the same
  Handlebars structure as the CC version with Gemini-specific
  additions (vertex tier line, storage cost line).
