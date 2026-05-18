# Phase 5 — Summary

1. Print:
   ```
   visual-qa run: <slug> (dispatch=<agent-hook|sequential>)
   Captures: <captured>/<expected>
   Analyses: <analyzed>/<expected>
   Issues: <total> (<critical>c <major>m <minor>n)
   New: <newCount> | Resolved: <resolvedCount>
   Report: <slug-dir>/report.md
   ```
2. Push `{phase: 5, completedAt}` to state.
3. Exit code: 0 if no critical, 1 otherwise.
