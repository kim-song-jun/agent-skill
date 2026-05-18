# Phase 5 — Audit (textual recap)

The Claude Code version of this phase produces a quantified token-cost
report (actual vs naive baseline, cache hit rate, per-model breakdown,
phase log). Cursor does not surface token counts or per-call cost in
its planner output, so this phase **degrades to a textual recap**.

## Inputs

- `.thrift.json` — for `audit.outputPath`.
- The planner's own memory of what happened in the chat.

There is no `.thrift-state.json` to read.

## Steps

1. Resolve `audit.outputPath` placeholder `<date>` → `YYYY-MM-DD`.
   Default path: `docs/thrift/cursor-recap-<date>.md`.
2. If file exists: append a `-HHMM` suffix.
3. Render `templates/audit-report.md.hbs` with a **subset** of the
   Claude Code context — the cost / token / cache sections are present
   in the template but filled with `n/a (Cursor does not expose token
   counts)` markers if the user has not pasted numbers in.
4. The planner fills the recap narratively:
   - What was attempted this session.
   - What files were touched.
   - What worked, what didn't.
   - Outstanding TODOs.
5. Write the recap.
6. Print:
   ```
   Thrift recap (Cursor): <output-path>
   (no token metrics — paste Cursor usage panel numbers manually if desired)
   ```

## Optional: hand-entered token counts

If the user pastes their Cursor usage-panel numbers, the recap template
can fill the cost-summary table via `lib/cost-estimator.mjs`. The rates
table is documented as "advisory only — Cursor mediates the underlying
model so per-call cost may differ from raw model rates."

## On error

- Output path not writable → fall back to `.thrift/cursor-recap-<date>.md`
  and warn.
- Template render failure → emit a minimal "no-data" recap inline.

## Contract differences from Claude Code Phase 5

| Aspect | Claude Code | Cursor |
|---|---|---|
| Data source | `.thrift-state.json` (programmatic) | planner narrative + optional user-pasted numbers |
| Cost numbers | always present | usually `n/a` |
| Phase log | yes (from state) | no — recap is free-form |
| Coercion telemetry | yes (from PreToolUse hook records) | no — rule was advisory only |
| Cache prime log | yes | n/a — phase removed |
