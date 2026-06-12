# Phase 5 — Summary

1. Print to chat:
   ```
   visual-qa run: <slug>
   Captures: <captured>/<expected>
   Analyses: <analyzed>/<expected>
   Issues: <total> (<critical>c <major>m <minor>n)
   New: <newCount> | Resolved: <resolvedCount>
   Report: <slug-dir>/report.md
   ```
2. Push `{phase: 5, completedAt}` to state.
3. Exit code branches by mode:
   - **Comprehensive mode:** read `<slug-dir>/verdict.json`. Exit 0 when
     `verdict.pass` is true, otherwise exit 1. Print
     `Verdict: <pass|fail> — <verdict.reason>`. The default fail policy is
     `["critical", "major"]`.
   - **Declared mode:** exit 0 if no critical issues, 1 if any critical.

## Shell helpers

```bash
# Render the markdown report from the aggregated JSON.
node .cursor/visual-qa/lib/report-renderer.mjs <slug-dir>/report.json > <slug-dir>/report.md
```
