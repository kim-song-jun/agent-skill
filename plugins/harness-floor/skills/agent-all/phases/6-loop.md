# Phase 6 — Loop

## Inputs (from state + CLI)

- `--loop` flag (boolean)
- `config.loop.{breakCondition, stableIters}`
- CLI `--max-iter`, `--max-cost` (override config defaults)
- `state.iter`, `state.consecutivePass`, `state.costUSD`

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}` to `phases`, exit normally (exit code 0 if no critical issues, 1 if any).

## Steps

1. Run breakCondition via shell:
   ```javascript
   import { evaluateLoop } from "./lib/loop-evaluator.mjs";
   const runner = () => {
     const result = spawnSync("sh", ["-c", config.loop.breakCondition], { stdio: "pipe" });
     return { exitCode: result.status ?? 1 };
   };
   const verdict = evaluateLoop(
     { iter: state.iter, consecutivePass: state.consecutivePass ?? 0, costUSD: state.costUSD ?? 0 },
     { stableIters: config.loop.stableIters, maxIter: Math.min(50, cliMaxIter ?? config.defaults.maxIter), maxCostUSD: cliMaxCost ?? config.defaults.maxCostUSD },
     runner,
   );
   ```

2. Stash `state.lastBreakConditionExit = verdict.exitCode ?? 1`. Update `state.consecutivePass = verdict.consecutivePass ?? state.consecutivePass`.

3. Branch on `verdict.action`:
   - `break`: push `{phase: 6, completedAt, status: "broken"}` to `phases`, exit 0.
   - `continue`: increment `state.iter`. Reset `state.phases` to drop entries with phase >= 1 (so re-entry skips Phase 0 only). Re-invoke from Phase 1 — but in loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.

## Output to user

Per iter, print: `Iter <N>/<max>: break check exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`
