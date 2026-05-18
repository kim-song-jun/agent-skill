# Phase 4 — Aggregate + Diff + Report

1. Read every `<slug-dir>/**/<image>.analysis.json`. Merge into a single
   `report.json` keyed by `{page, breakpoint, component, state}`.
2. If `priorRunDir`: read its `report.json` and diff per-issue. Bucket each
   issue as `new`, `resolved`, or `unchanged` (compare by
   `{component, state, breakpoint, severity, descriptionHash}`).
3. Render `templates/report.md.hbs` with the merged data. Write to
   `<slug-dir>/report.md`.
4. Write `<slug-dir>/report.json` (structured form, next run's prior).
5. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
