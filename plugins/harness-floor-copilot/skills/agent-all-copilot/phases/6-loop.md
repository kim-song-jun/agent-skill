# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical, 1 otherwise).

## Steps

1. Run breakCondition via `read_bash`:
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

## Copilot-specific

Copilot's chat session is single-turn for the coordinator — re-entry
happens in the same chat by re-reading `phases/1-intent.md` and walking
through the pipeline again. `store_memory` retains state across iterations
within the same session. Cross-session resume relies on
`.agent-all-state.json` because `store_memory` may be GC'd between
Copilot sessions (scope=repository persists per repo but TTL varies).

## Output

Per iter: `Iter <N>/<max>: break check exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`
