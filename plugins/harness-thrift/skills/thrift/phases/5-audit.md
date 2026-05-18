# Phase 5 — Audit

## Inputs (from state + config)

- `.thrift-state.json` — accumulated metrics this session
- `.thrift.json` — config; especially `audit.outputPath`

## Steps

1. Read state via `readState()` from `lib/metrics-collector.mjs`.
2. Load config via `loadConfig()` from `lib/config-loader.mjs`.
3. Build audit context via `buildAuditContext({state, config})` from
   `lib/audit-renderer.mjs`.
4. Render `templates/audit-report.md.hbs` with the context using the
   harness shared `render()` lib.
5. Resolve `audit.outputPath` placeholder `<date>` → `YYYY-MM-DD`.
   If file exists: append timestamp suffix (`-HHMM`).
6. Write report via `apply_patch` (or fs writeFileSync in standalone runs).
7. Push `{phase: 5, completedAt}` to state.

## Output to user

```
Thrift audit: <duration> min session, <turns> turns, $<actual> actual vs $<baseline> baseline (saved <%>).
Report: <output-path>
```

## On error

- State file missing → write a minimal "no-data" report (still useful
  as a signal that thrift ran).
- Output path not writable → fall back to `.thrift/audit-<date>.md` and
  warn.
- Render failure → log the partial state; user can re-run `/thrift audit`.
