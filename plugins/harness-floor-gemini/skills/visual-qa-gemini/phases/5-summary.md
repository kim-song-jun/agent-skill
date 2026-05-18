# Phase 5 — Summary

1. Print:
   ```
   visual-qa run: <slug>
   Captures: <captured>/<expected>
   Analyses: <analyzed>/<expected>
   Issues: <total> (<critical>c <major>m <minor>n)
   New: <newCount> | Resolved: <resolvedCount>
   Subprocesses used: <maxParallelUsed>
   Report: <slug-dir>/report.md
   ```
2. Push `{phase: 5, completedAt}` to state.
3. GC tmp dir: `run_shell_command("rm -rf /tmp/visual-qa")`.
4. Exit code: 0 if no critical, 1 otherwise.
