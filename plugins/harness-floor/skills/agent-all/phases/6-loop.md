# Phase 6 — Loop

## Inputs (from state + CLI)

- `--loop` flag (boolean)
- `config.loop.{breakCondition, stableIters}` — `breakCondition` may be a
  plain string (legacy) OR an object with `{type, ...}` per
  `lib/break-resolver.mjs`.
- CLI `--max-iter`, `--max-cost` (override config defaults)
- `state.iter`, `state.consecutivePass`, `state.costUSD`

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}` to `phases`, exit normally (exit code 0 if no critical issues, 1 if any).

## Steps

1. Resolve the break-condition spec via `lib/break-resolver.mjs`:
   ```javascript
   import {
     normalizeBreakCondition,
     buildShellCommand,
     needsVisualQARunner,
   } from "./lib/break-resolver.mjs";
   const spec = normalizeBreakCondition(config.loop.breakCondition);
   if (!spec) { /* print error, abort with exit 2 */ }
   ```

2. Build a runner closure that matches the spec type:

   - **`shell` / `test-auto` / pure `composite`** (no visual-qa anywhere):
     ```javascript
     const cmd = buildShellCommand(spec);
     const runner = () => {
       const result = spawnSync("sh", ["-c", cmd], { stdio: "pipe" });
       return { exitCode: result.status ?? 1 };
     };
     ```

   - **`visual-qa`**: dispatch the `visual-qa` skill via the Task tool
     (one subagent). The subagent runs the 6-phase visual-qa pipeline
     against the working tree. Treat its exit code as the runner exit
     code — visual-qa exits 0 when no regressions found, non-zero when
     diffs exceed the configured threshold.
     ```javascript
     const runner = () => {
       const result = dispatchVisualQASubagent({ spec: spec.spec });
       return { exitCode: result.exitCode };
     };
     ```

   - **composite containing visual-qa**: run each step in declared order
     and short-circuit on the first non-zero exit. Use `buildShellCommand`
     for shell/test-auto/inner-composite steps; use the visual-qa
     subagent dispatcher for visual-qa steps.

3. Call `evaluateLoop`:
   ```javascript
   import { evaluateLoop } from "./lib/loop-evaluator.mjs";
   const verdict = evaluateLoop(
     { iter: state.iter, consecutivePass: state.consecutivePass ?? 0, costUSD: state.costUSD ?? 0 },
     { stableIters: config.loop.stableIters, maxIter: Math.min(50, cliMaxIter ?? config.defaults.maxIter), maxCostUSD: cliMaxCost ?? config.defaults.maxCostUSD },
     runner,
   );
   ```

4. Stash `state.lastBreakConditionExit = verdict.exitCode ?? 1`. Update `state.consecutivePass = verdict.consecutivePass ?? state.consecutivePass`.

5. Branch on `verdict.action`:
   - `break`: push `{phase: 6, completedAt, status: "broken"}` to `phases`, exit 0.
   - `continue`: increment `state.iter`. Reset `state.phases` to drop entries with phase >= 1 (so re-entry skips Phase 0 only). Re-invoke from Phase 1 — but in loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.

## Output to user

Per iter, print: `Iter <N>/<max>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- A composite step's failure short-circuits the rest (exit early with
  that step's code) — saves time when an early cheap check (lint/type)
  is meant to gate a slower one (visual-qa).
- For `visual-qa` steps, treat **any** thrown error from the subagent as
  exit 1, never as exit 0 — visual-qa must explicitly report success.
