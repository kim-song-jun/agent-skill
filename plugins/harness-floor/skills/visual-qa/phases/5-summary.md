# Phase 5 — Summary + Exit Code

## Steps

1. Read `<slug-dir>/report.json` (just written by Phase 4).
2. Compute totals from `report.diff`.
3. Print to console:
   ```
   Visual QA complete: <totalCaptures> captures, <totalIssues> issues (<critical> critical, <major> major, <minor> minor)
   vs prior run: +<newCount> new, -<resolvedCount> resolved, <unchangedCount> unchanged
   Report: <slug-dir>/report.md
   ```
4. Determine exit code:
   - **Comprehensive mode** (when `state.mode === "comprehensive"`):
     read `<slug-dir>/verdict.json`. Exit 0 if `verdict.pass`, exit 1
     otherwise. Incomplete pages contribute to fail via Phase 4
     surfacing them as `major` issues; no separate exit code 2 in this
     mode. Print `Verdict: <pass|fail>: <verdict.reason>.`
   - **Declared mode** (back-compat):
     - 0 if no critical issues AND no incomplete pages
     - 1 if any critical issue
     - 2 if any incomplete page (even when no critical issues)
5. Push `{phase: 5, completedAt}` to `phases` in state.
6. `process.exit(code)`.

## Output to user

Single block per step 3, then exit.
