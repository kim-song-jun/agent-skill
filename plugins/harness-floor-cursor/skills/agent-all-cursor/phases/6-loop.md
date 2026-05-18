# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical issues, 1 otherwise).

## Steps

1. Run the breakCondition shell command:
   ```bash
   sh -c "$config.loop.breakCondition"
   ```
   Capture exit code.

2. Compute action:
   - Exit 0: `state.consecutivePass++`. If `consecutivePass >= stableIters`:
     action = `break`. Else action = `continue`.
   - Exit ≠ 0: `state.consecutivePass = 0`. action = `continue`.
   - If `state.iter >= maxIter`: action = `exhausted`.
   - If `state.costUSD >= maxCostUSD`: action = `exhausted`.

3. Branch on action:
   - `break`: push `{phase: 6, completedAt, status: "broken"}`, exit 0.
   - `continue`: increment `state.iter`. Drop `state.phases` entries with
     `phase >= 1`. Re-invoke `@agent-all-coordinator` from Phase 1 — in
     loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`,
     exit 3.

## Cursor-specific

Cursor cannot auto-re-invoke a chat. The coordinator emits:

> `Loop continue: iter <N+1> ready. Send "@agent-all-coordinator continue" to proceed.`

and waits for the user. This is the biggest behavioral gap vs the Claude
Code orchestrator, which auto-re-enters Phase 1 in-process. Users running
long loops should use Cursor's "auto-confirm" mode (if available) or
script the re-invocation via `cursor-cli` (when GA).

## Output

Per iter: `Iter <N>/<max>: break check exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Shell helpers

```bash
# Step 1 — execute the break-condition; capture exit code in the coordinator.
sh -c "$BREAK_CONDITION"; echo "exit=$?"

# Steps 2-3 — update iter counters + consecutivePass atomically.
node .cursor/agent-all/lib/state-rw.mjs read  .agent-all-state.json
# ... mutate state.iter / state.consecutivePass / state.phases ...
node .cursor/agent-all/lib/state-rw.mjs write .agent-all-state.json '<mutated-json>'
```

Cursor cannot re-invoke the coordinator from inside the same chat. After
writing state, print the loop-continue prompt and wait for the user (see
Cursor-specific section above).
