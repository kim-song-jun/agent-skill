# Phase 6 — Loop

## Inputs (from state + CLI)

- `--loop` flag (boolean)
- `config.loop.{breakCondition, stableIters}` — `breakCondition` may be a
  plain string (legacy) OR an object with `{type, ...}` per
  `lib/break-resolver.mjs`.
- CLI `--max-iter`, `--max-cost` (override config defaults)
- `state.iter`, `state.consecutivePass`, `state.costUSD`
- `task.path`, `task.title`

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

   - **`visual-qa`**: dispatch a Task-tool subagent whose only job is to
     invoke the `harness-floor:visual-qa` skill against the working
     tree. The subagent runs the 6-phase visual-qa pipeline; its
     `STATUS:` (or final exit code) is the runner's exit code.

     Concrete invocation pattern (replace `<slug>` with `loop-iter-<N>`
     so each iteration writes to a fresh slug dir):

     ```javascript
     const runner = async () => {
       const slug = `loop-iter-${state.iter}`;
       const result = await Task({
         subagent_type: "general-purpose",
         description: `visual-qa for loop iter ${state.iter}`,
         prompt: [
           "Invoke the harness-floor:visual-qa skill with these args:",
           `  --slug=${slug}`,
           `  --force         # blow away any prior state for this slug`,
           `  --yes           # skip Phase 1 confirmation prompt`,
           spec.spec ? `  --spec=${spec.spec}` : "",
           "",
           "After the skill finishes, report:",
           "  STATUS: passed   (if exit 0)",
           "  STATUS: failed   (if exit non-zero) and copy the last 10",
           "                   lines of console output as REASON.",
           "Do not perform any other work.",
         ].filter(Boolean).join("\n"),
       });
       return { exitCode: result.status === "passed" ? 0 : 1 };
     };
     ```

     Why a fresh slug per iter: visual-qa's `<slug-dir>` is its
     per-run output home. Reusing one slug across iters would either
     abort (no `--force/--resume`) or overwrite the baseline that the
     next iter's verdict depends on. `loop-iter-<N>` gives each iter
     its own dir, and Phase 2's `priorRunPath` discovery still finds
     the previous iter's report as the baseline.

   - **composite containing visual-qa**: run each step in declared order
     and short-circuit on the first non-zero exit. Use `buildShellCommand`
     for shell/test-auto/inner-composite steps; use the Task-tool
     dispatcher pattern above for visual-qa steps.

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

5. Prepare a handoff writer for non-success exits:
   ```javascript
   import { renderHandoff } from "./lib/handoff-writer.mjs";
   ```
   On exhausted, blocked, or interrupted runs, call `renderHandoff({
   title: task.title, completed, remaining, blockers, validation, gitState,
   nextAction })`. Keep `validation` to the latest command/result summary and
   keep `gitState` to the current branch plus concise dirty/clean status. Do
   not include raw logs or fenced code blocks.

   Update the task doc's `## Handoff` section atomically. If the task doc has
   no `## Handoff` section, write a sibling `docs/tasks/<NN>-<slug>.handoff.md`
   file and mention that path in the final output.

6. Branch on `verdict.action`:
   - `break`: push `{phase: 6, completedAt, status: "broken"}` to `phases`, exit 0.
   - `continue`: increment `state.iter`. Reset `state.phases` to drop entries with phase >= 1 (so re-entry skips Phase 0 only). Re-invoke from Phase 1 — but in loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: write the handoff, push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.
   - `blocked`: write the handoff, push `{phase: 6, completedAt, status: "blocked"}`, exit 4.
   - `interrupted`: write the handoff, push `{phase: 6, completedAt, status: "interrupted"}`, exit 130.

## Output to user

Per iter, print: `Iter <N>/<max>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- A composite step's failure short-circuits the rest (exit early with
  that step's code) — saves time when an early cheap check (lint/type)
  is meant to gate a slower one (visual-qa).
- For `visual-qa` steps, treat **any** thrown error from the subagent as
  exit 1, never as exit 0 — visual-qa must explicitly report success.
