# Phase 4 — Aggregate + Diff + Report

1. Walk `<slug-dir>/**/<image>.analysis.json` via `shell_command("find ...")`.
   Read each file. Merge into `report.json` keyed by
   `{page, breakpoint, component, state}`.
2. If `priorRunDir`: read its `report.json`. Diff per-issue. Bucket as
   `new`, `resolved`, `unchanged` (compare by composite key).
3. Render `templates/report.md.hbs`. Write `<slug-dir>/report.md` via `apply_patch`.
4. Write `<slug-dir>/report.json` via `apply_patch`.
5. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
