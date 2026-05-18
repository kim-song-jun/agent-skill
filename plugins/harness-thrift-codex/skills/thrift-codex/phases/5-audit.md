# Phase 5 — Audit

## Inputs (from state + config)

- `.thrift-state.json` — accumulated metrics this session
- `.thrift.json` — config; especially `audit.outputPath`

## Steps

1. Read state from `.thrift-state.json` (build `{}` if missing —
   minimal no-data report still useful as a thrift-ran signal).
2. Load config via `loadConfig()` from `lib/config-loader.mjs`.
3. Build audit context — aggregate cost via
   `estimateSession(records)` from `lib/cost-estimator.mjs` (OpenAI
   rates). Roll up coercions, summarisers, primes per template
   variables.
4. Render `templates/audit-report.md.hbs` with the context using the
   plugin-local `bin/lib/render.mjs`.
5. Resolve `audit.outputPath` placeholder `<date>` → `YYYY-MM-DD`.
   If file exists: append timestamp suffix (`-HHMM`).
6. Write report via `apply_patch` (or `fs.writeFileSync` in standalone runs).
7. Push `{phase: 5, completedAt}` to state.

## Output to user (on stderr from session_end hook)

```
Thrift-codex audit: <duration> min session, <turns> turns,
$<actual> actual vs $<baseline> baseline (saved <%>).
Report: <output-path>
Note: Codex does not expose OpenAI cache hit telemetry — savedRatio is heuristic.
```

## On error

- State file missing → write a minimal "no-data" report (still useful
  as a signal that thrift-codex ran).
- Output path not writable → fall back to `.thrift/audit-<date>.md` and
  warn.
- Render failure → log the partial state; user can re-run
  `/thrift-codex audit`.

## Heuristic-vs-measured savings

The audit report MUST flag clearly when the savings number is heuristic:

- `cache.enabled === false` → savings reflect only summariser +
  coerce activity. Cache term is zero.
- `cache.enabled === true` → savings include a **heuristic estimate**
  of cache benefit (e.g. assume 30% cache hit rate after warmInterval
  elapses on a session ≥ 30 minutes). Report explicitly states this
  assumption.

This contrasts with the CC audit, where Anthropic's response metadata
gives actual cache-read token counts.
