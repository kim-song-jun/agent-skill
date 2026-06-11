# Phase 6 — Loop

## Inputs (from state + CLI)

- `--loop` flag (boolean)
- `config.loop.{breakCondition, stableIters}` — `breakCondition` may be a
  plain string (legacy) OR an object with `{type, ...}` per
  `lib/break-resolver.mjs`.
- CLI `--max-iter`, `--max-cost`, `--max-runtime-sec` (override config defaults)
- `state.iter`, `state.consecutivePass`, `state.costUSD`
- `state.loop.{startedAt,failureSignatures,lastFailureSignature,lastVerifierSummary,lastTouchedFiles,nextAction}`
- `state.orchestration.{failureSignatures,blockedReasons,budget}`
- `state.interactions` for prior decision/resume/budget-warning prompts
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
     needsVerificationAdapterRunner,
     toVerificationAdapterSpec,
   } from "./lib/break-resolver.mjs";
   const spec = normalizeBreakCondition(config.loop.breakCondition);
   if (!spec) { /* print error, abort with exit 2 */ }
   ```

2. Build a runner closure that matches the spec type:

   - **`shell` / `test-auto` / pure `composite`** (no visual-qa or
     verification adapter anywhere):
     ```javascript
     const cmd = buildShellCommand(spec);
     const runner = () => {
       const result = spawnSync("sh", ["-c", cmd], { stdio: "pipe" });
       return { exitCode: result.status ?? 1 };
     };
     ```

   - **`verification-adapter`**: run a common adapter and write standard
     evidence. This is the non-web completion path for CLI, API contract,
     notebook/data, SQL, and batch-job work.

     ```javascript
     import { runVerificationAdapterSpec } from "./lib/verification-adapters/registry.mjs";

     const runner = async () => {
       const result = await runVerificationAdapterSpec(spec, {
         cwd,
         runId,
         taskId: task.id,
         iteration: state.iter,
         writeEvidence: true,
       });
       return {
         exitCode: result.exitCode,
         verifierSummary: result.verifierSummary,
         verificationEvidence: result.evidence,
         artifacts: result.evidence?.artifacts ?? [],
       };
     };
     ```

     Evidence is appended to
     `.agent-skill/runs/<run-id>/verification-evidence.jsonl` with schema
     `verification-evidence/v1`:
     ```json
     {
       "adapter": "verify:cli",
       "status": "passed",
       "command": "my-tool --check",
       "artifacts": ["test/golden/help.txt"],
       "summary": "CLI exit code and golden stdout passed"
     }
     ```

   - **`visual-qa`**: treat the legacy visual-qa spec as
     `verify:web-ui`, then dispatch a Task-tool subagent whose only job is to
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

     After the subagent returns, normalize its result through
     `runVerificationAdapterSpec(toVerificationAdapterSpec(step), {
     visualQaResult, writeEvidence: true, ... })` so the same
     `verification-evidence.jsonl` model records web UI verdicts.

   - **composite containing visual-qa or verification-adapter**: run each
     step in declared order and short-circuit on the first non-zero exit.
     Use `buildShellCommand` for shell/test-auto/inner-composite steps; use
     the Task-tool dispatcher pattern above for visual-qa steps and
     `runVerificationAdapterSpec` for other adapter steps.

3. Resolve loop limits. `--max-iter=0`, `config.loop.maxIter === 0`, or
   `config.loop.maxIter == null` means unlimited iterations. Keep
   `config.defaults.maxIter` as backward-compatible fallback only when
   `config.loop.maxIter` is not present. `--max-runtime-sec=<seconds>` or
   `config.loop.maxRuntimeSec` is an optional wall-clock budget; when set,
   initialize `state.loop.startedAt` once and preserve it across resumes:
   ```javascript
   const hasLoopMaxIter = Object.hasOwn(config.loop ?? {}, "maxIter");
   const maxIter = cliMaxIter !== undefined
     ? cliMaxIter
     : hasLoopMaxIter
       ? config.loop.maxIter
       : config.defaults.maxIter;
   const maxRuntimeSec = cliMaxRuntimeSec ?? config.loop.maxRuntimeSec ?? null;
   state.loop = state.loop ?? {};
   state.loop.startedAt = state.loop.startedAt ?? new Date().toISOString();
   ```

4. Call the policy engine before each break-condition run. This is the
   common hook schema used by hard hooks and soft-warning ports:
   ```javascript
   import { evaluatePolicyEvent } from "./lib/policy/policy-engine.mjs";
   const beforePolicy = evaluatePolicyEvent({
     event: "BeforeLoopIteration",
     platform,
     runId,
     taskId: task.id,
     displayId: task.title,
     iteration: state.iter,
     phase: "6-loop",
     costUSD: state.costTelemetry?.summary?.totalUSD ?? state.costUSD ?? 0,
     breakCondition: spec,
     payload: {
       maxIter,
       maxCostUSD: cliMaxCost ?? config.defaults.maxCostUSD,
       maxRuntimeSec,
       costTelemetry: state.costTelemetry,
       maxRepeatedFailureSignature: config.loop.maxRepeatedFailureSignature ?? 3,
     },
   }, { writeAudit: true });
   if (!beforePolicy.ok) {
     // Treat deny/stop_loop as a hard policy block and write the handoff.
     const reason = beforePolicy.results.find((r) => r.action !== "allow")?.reason;
     return { action: "blocked", exitCode: 4, reason: reason || "policy_blocked" };
   }
   ```

5. Wrap the runner so the policy engine also sees the break-condition result
   before `evaluateLoop` decides whether to continue:
   ```javascript
   import { evaluateLoop, formatMaxIter } from "./lib/loop-evaluator.mjs";
   import { computeFailureSignature } from "./lib/loop-evaluator.mjs";
   const policyRunner = () => {
     const result = runner();
     const exitCode = result?.exitCode ?? 1;
     const failureSignature = exitCode === 0 ? null : computeFailureSignature({ ...result, exitCode });
     const afterPolicy = evaluatePolicyEvent({
       event: "AfterBreakCondition",
       platform,
       runId,
       taskId: task.id,
       displayId: task.title,
       iteration: state.iter,
       phase: "6-loop",
       costUSD: state.costTelemetry?.summary?.totalUSD ?? state.costUSD ?? 0,
       breakCondition: spec,
       payload: {
         exitCode,
         costTelemetry: state.costTelemetry,
         failureSignature,
         failureSignatures: state.loop?.failureSignatures ?? {},
       },
     }, { writeAudit: true });
     if (!afterPolicy.ok) {
       return {
         ...result,
         exitCode: 4,
         policyBlocked: true,
         verifierSummary: afterPolicy.results.find((r) => r.action !== "allow")?.reason,
       };
     }
     return result;
   };
   const verdict = evaluateLoop(
     {
       iter: state.iter,
       consecutivePass: state.consecutivePass ?? 0,
       costUSD: state.costTelemetry?.summary?.totalUSD ?? state.costUSD ?? 0,
       costTelemetry: state.costTelemetry,
       loopStartedAt: state.loop?.startedAt,
       loop: state.loop ?? {},
     },
     {
       stableIters: config.loop.stableIters,
       maxIter,
       maxCostUSD: cliMaxCost ?? config.defaults.maxCostUSD,
       maxRuntimeSec,
       maxRepeatedFailureSignature: config.loop.maxRepeatedFailureSignature ?? 3,
     },
     policyRunner,
   );
   ```

6. Persist loop state after every evaluation:
   ```javascript
   state.loop = verdict.loopState ?? state.loop ?? {};
   state.orchestration = {
     ...(state.orchestration ?? {}),
     runId,
     failureSignatures: state.loop.failureSignatures ?? state.orchestration?.failureSignatures ?? {},
     blockedReasons: [
       ...new Set([
         ...(state.orchestration?.blockedReasons ?? []),
         verdict.reason ? String(verdict.reason) : null,
       ].filter(Boolean)),
     ],
     budget: {
       costUSD: state.costTelemetry?.summary?.totalUSD ?? state.costUSD ?? 0,
       maxCostUSD: cliMaxCost ?? config.defaults.maxCostUSD ?? null,
       telemetry: state.costTelemetry?.summary ?? null,
     },
   };
   state.lastBreakConditionExit = state.loop.lastBreakConditionExit ?? verdict.exitCode ?? 1;
   state.lastFailureSignature = state.loop.lastFailureSignature;
   state.lastVerifierSummary = state.loop.lastVerifierSummary;
   state.loop.lastVerificationEvidence = verdict.loopState?.lastVerificationEvidence
     ?? state.loop.lastVerificationEvidence
     ?? null;
   state.loop.lastVisualQaVerdict = state.loop.lastVisualQaVerdict
     ?? verdict.loopState?.lastVisualQaVerdict
     ?? (spec.type === "visual-qa" ? state.loop.lastVerifierSummary : null);
   state.lastTouchedFiles = state.loop.lastTouchedFiles;
   state.nextAction = state.loop.nextAction;
   state.consecutivePass = verdict.consecutivePass ?? state.consecutivePass;
   ```
   Write `.agent-all-state.json` atomically before branching. This preserves
  `iter`, `consecutivePass`, `costUSD`, `costTelemetry`, `lastBreakConditionExit`,
   `lastFailureSignature`, `lastVerifierSummary`, `lastTouchedFiles`, and
   `nextAction`, and visual QA verdict summary for long-running resume. The
   next Phase 3 pass reads `state.loop.failureSignatures`,
   `state.loop.lastVisualQaVerdict`, and `state.orchestration` so repeated
   failure signatures escalate to planner/user decision before another
   implementer is dispatched.

7. Prepare a handoff writer for non-success exits:
   ```javascript
   import { renderHandoff } from "./lib/handoff-writer.mjs";
   import { renderSessionPrompt } from "./lib/session-prompt-writer.mjs";
   ```
   On exhausted, blocked, or interrupted runs, call `renderHandoff({
   title: task.title, completed, remaining, blockers, validation, gitState,
   nextAction, loopState: state.loop, costTelemetry: state.costTelemetry, metadata })` and
   `renderSessionPrompt({ title: task.title,
   taskPath: task.path, completed, remaining, blockers, validation, gitState,
   nextActions, metadata })`. Keep `validation` to the latest command/result
   summary and keep `gitState` to the current branch plus concise dirty/clean
   status. Do not include raw logs or fenced code blocks in the handoff.

   Update the task doc's `## Handoff` section atomically. If the task doc has
   no `## Handoff` section, write `.agent-skill/handoff/<display-id>-<slug>.handoff.md`.
   Always write `.agent-skill/handoff/<display-id>-<slug>.session.md` so a new session
   can resume from the same metadata. Mention both paths in the final output.

8. Branch on `verdict.action`:
   - `break`: push `{phase: 6, completedAt, status: "broken"}` to `phases`, exit 0.
   - `continue`: increment `state.iter`. Reset `state.phases` to drop entries with phase >= 1 (so re-entry skips Phase 0 only). Re-invoke from Phase 1 — but in loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: write the handoff, push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.
   - `blocked`: write the handoff, push `{phase: 6, completedAt, status: "blocked"}`, exit 4.
   - `interrupted`: write the handoff, push `{phase: 6, completedAt, status: "interrupted"}`, exit 130.

9. When a continue/stop/budget/blocked branch requires user input, surface it
   as `agent-interaction/v1` (`kind: confirmation|budget_warning|blocked|handoff`)
   and render it with the active platform helper (`renderer-claude.mjs`,
   `renderer-codex.mjs`, `renderer-copilot.mjs`, `renderer-cursor.mjs`, or
   `renderer-gemini.mjs`). Append `.agent-skill/runs/<run-id>/interactions.jsonl`.
   Non-TTY mode may auto-select recommended low/medium-risk options only;
   high-risk options must pause or block rather than auto-approve.

## Output to user

Per iter, print: `Iter <N>/<formatMaxIter(maxIter)>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- A composite step's failure short-circuits the rest (exit early with
  that step's code) — saves time when an early cheap check (lint/type)
  is meant to gate a slower one (visual-qa).
- For `visual-qa` and `verification-adapter` steps, treat **any** thrown
  error as exit 1, never as exit 0 — adapters must explicitly report
  `status: "passed"`.
- Adapter evidence is a run artifact first. Handoff/task-doc summaries should
  link the latest `.agent-skill/runs/<run-id>/verification-evidence.jsonl`
  entry rather than pasting raw command output.
- `maxIter` is now a safety guard, not the primary completion condition.
  In unlimited mode the loop still stops on break-condition pass, cost budget,
  hard policy hook block, user interruption, or repeated failure signature
  escalation.
