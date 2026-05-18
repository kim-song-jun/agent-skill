# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical, 1 otherwise).

## Steps

1. Run breakCondition via `shell_command`:
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

## Codex-specific

Codex chat sessions can self-re-enter by the coordinator literally re-reading
`phases/1-intent.md` and continuing. Cross-session resume relies on
`.agent-all-state.json` since Codex has no equivalent of Copilot's
`store_memory` for in-process state passing.

## Output

Per iter: `Iter <N>/<max>: break check exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`
