# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical, 1 otherwise).

## Steps

1. **Resolve the break-condition spec** via the vendored
   `lib/break-resolver.mjs`. Phase 0 has already normalised the spec into
   `config.loop.breakCondition`; re-validate at runtime in case of
   `--resume` after manual edits.

2. **Route on `spec.type`:**

   - **`shell` / `test-auto` / pure `composite`** (no visual-qa anywhere):
     resolve to a single shell line via `buildShellCommand(spec)` then
     run via `read_bash`:
     ```bash
     sh -c "$(buildShellCommand)"
     ```
     Capture exit code.

   - **`visual-qa`**: dispatch a `task` with role `visual-qa`. The
     subagent runs the `visual-qa-copilot` 6-phase pipeline. Treat its
     reported exit code (or `STATUS: passed`) as runner exit 0; anything
     else as 1. Never run via `read_bash`.

   - **composite containing visual-qa**: run each step in declared order
     and **short-circuit on the first non-zero exit**. Use `read_bash`
     for shell/test-auto/inner-composite steps; use the `task` dispatcher
     for visual-qa steps.

3. Compute action (same logic as Claude port):
   - Exit 0: `consecutivePass++`. If `>= stableIters`: `break`. Else `continue`.
   - Exit ≠ 0: `consecutivePass = 0`. `continue`.
   - `iter >= maxIter` OR `costUSD >= maxCostUSD`: `exhausted`.

4. Branch:
   - `break`: push `{phase: 6, completedAt, status: "broken"}`, exit 0.
   - `continue`: `state.iter++`. Drop `state.phases` entries `phase >= 1`.
     Re-enter Phase 1 (uses `state.task`, skips brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.

## Copilot-specific

Copilot's chat session is single-turn for the coordinator — re-entry
happens in the same chat by re-reading `phases/1-intent.md` and walking
through the pipeline again. `store_memory` retains state across iterations
within the same session. Cross-session resume relies on
`.agent-all-state.json` because `store_memory` may be GC'd between
Copilot sessions (scope=repository persists per repo but TTL varies).

## Output

Per iter: `Iter <N>/<max>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- Composite **short-circuits** on first non-zero exit — saves time when
  an early cheap check (lint/type) is meant to gate a slower one
  (visual-qa).
- For `visual-qa` steps, treat **any** thrown error from the dispatched
  task as exit 1, never as exit 0 — visual-qa must explicitly report
  success.
