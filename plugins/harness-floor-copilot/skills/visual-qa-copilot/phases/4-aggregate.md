# Phase 4 — Aggregate + Diff + Report

1. Walk `<slug-dir>/**/<image>.analysis.json` via `read_bash("find ...")`
   plus `read_file` per file. Merge into `report.json` keyed by
   `{page, breakpoint, component, state}`.
2. If `priorRunDir`: `read_file("<priorRunDir>/report.json")`. Diff per-issue.
   Bucket each as `new`, `resolved`, `unchanged` (compare by
   `{component, state, breakpoint, severity, descriptionHash}`).
3. Render `templates/report.md.hbs`. Write to `<slug-dir>/report.md` via `apply_patch`.
4. Write `<slug-dir>/report.json` via `apply_patch`.
5. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
