# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical, 1 otherwise).

## Steps

1. Run breakCondition via `run_shell_command`:
   ```bash
   sh -c "$config.loop.breakCondition"
   ```
   Capture exit code.

2. Compute action (same logic as Claude port):
   - Exit 0: `consecutivePass++`. If `>= stableIters`: `break`. Else `continue`.
   - Exit ≠ 0: `consecutivePass = 0`. `continue`.
   - `iter >= maxIter` OR `costUSD >= maxCostUSD`: `exhausted`.

3. Branch:
   - `break`: push `{phase: 6, completedAt, status: "broken"}`, exit 0.
   - `continue`: `state.iter++`. Drop `state.phases` entries `phase >= 1`.
     Re-enter Phase 1 (uses `state.task`, skips brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.

## Gemini-specific

Gemini's chat surface re-reads `phases/1-intent.md` for in-session loop
continuation. For non-interactive long loops, spawn the entire pipeline
itself as a subprocess and let it self-re-enter via state file:
```
run_shell_command(
  "gemini chat --skill agent-all-gemini -p 'continue from .agent-all-state.json' &",
  { background: true }
)
```

This is the same subprocess pattern Phase 3 uses; the coordinator becomes
its own grandchild. Resume relies on `.agent-all-state.json` exclusively.

## Output

Per iter: `Iter <N>/<max>: break check exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`
