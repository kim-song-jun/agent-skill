# Phase 4 — Aggregate + Diff + Report

1. Walk `<slug-dir>/**/<image>.analysis.json` via `run_shell_command("find ...")`.
   Read each via `read_file`. Merge into `report.json` keyed by
   `{page, breakpoint, component, state}`.
2. If `priorRunDir`: `read_file("<priorRunDir>/report.json")`. Diff per-issue.
   Bucket as `new`, `resolved`, `unchanged`.
3. Render `templates/report.md.hbs`. Write `<slug-dir>/report.md` via `write_file`.
4. Write `<slug-dir>/report.json` via `write_file`.
5. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
