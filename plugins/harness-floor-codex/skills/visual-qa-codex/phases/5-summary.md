# Phase 5 — Summary

1. Print:
   ```
   visual-qa run: <slug> (dispatch=sequential)
   Captures: <captured>/<expected>
   Analyses: <analyzed>/<expected>
   Issues: <total> (<critical>c <major>m <minor>n)
   New: <newCount> | Resolved: <resolvedCount>
   Report: <slug-dir>/report.md
   ```
2. Push `{phase: 5, completedAt}` to state.
3. Exit code branches by mode:
   - **Comprehensive mode:** exit 0 when `state.verdict.pass` is true,
     otherwise exit 1. Print `Verdict: <pass|fail> — <state.verdict.reason>`.
     The default fail policy is `["critical", "major"]`.
   - **Declared mode:** exit 0 if no critical issues, otherwise exit 1.
