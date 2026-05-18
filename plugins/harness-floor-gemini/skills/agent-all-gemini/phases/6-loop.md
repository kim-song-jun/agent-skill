# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical, 1 otherwise).

## Steps

1. **Resolve the break-condition spec** via the vendored
   `lib/break-resolver.mjs`. Phase 0 has already normalised the spec
   into `config.loop.breakCondition`; re-validate at runtime in case of
   `--resume` after manual edits.

2. **Route on `spec.type`:**

   - **`shell` / `test-auto` / pure `composite`** (no visual-qa anywhere):
     resolve to a single shell line via `buildShellCommand(spec)` then
     run via `run_shell_command`:
     ```bash
     sh -c "$(buildShellCommand)"
     ```
     Capture exit code.

   - **`visual-qa`**: dispatch a subprocess that invokes the
     `visual-qa-gemini` skill — same subprocess pattern Phase 3 uses for
     implementers:
     ```
     run_shell_command(
       "gemini chat --skill visual-qa-gemini -p 'check against spec' --output-json",
       { background: false }
     )
     ```
     Parse the subprocess's exit code (or `STATUS:` field in the JSON);
     treat passed as runner exit 0, anything else as 1. Never run via
     `run_shell_command` as a plain shell command.

   - **composite containing visual-qa**: run each step in declared order
     and **short-circuit on the first non-zero exit**. Use
     `run_shell_command` for shell/test-auto/inner-composite steps; use
     the subprocess dispatcher for visual-qa steps.

3. Compute action (same logic as Claude port):
   - Exit 0: `consecutivePass++`. If `>= stableIters`: `break`. Else `continue`.
   - Exit ≠ 0: `consecutivePass = 0`. `continue`.
   - `iter >= maxIter` OR `costUSD >= maxCostUSD`: `exhausted`.

4. Branch:
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

Per iter: `Iter <N>/<max>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- Composite **short-circuits** on first non-zero exit — saves time when
  an early cheap check (lint/type) gates a slower one (visual-qa).
- For `visual-qa` steps, treat **any** thrown error from the dispatched
  subprocess as exit 1, never as exit 0 — visual-qa must explicitly
  report success.
