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

   - **`shell` / `test-auto` / pure `composite`** (no visual-qa or
     verification-adapter anywhere):
     resolve to a single shell line via `buildShellCommand(spec)` then
     run via `run_shell_command`:
     ```bash
     sh -c "$(buildShellCommand)"
     ```
     Capture exit code.

   - **`verification-adapter`**: invoke the vendored
     `lib/verification-adapters/registry.mjs` runner for `verify:cli`,
     `verify:api-contract`, `verify:notebook-data`, `verify:sql-db`, or
     `verify:batch-job`, then append
     `.agent-skill/runs/<run-id>/verification-evidence.jsonl`. Exit 0 only
     when the evidence status is `passed`.

   - **`visual-qa`**: treat as `verify:web-ui` evidence, then dispatch a subprocess that invokes the
     `visual-qa-gemini` skill with a fresh per-iter slug, so each
     iteration writes to its own slug dir without clobbering the
     previous one's baseline:

     ```
     run_shell_command(
      `gemini -p 'Invoke visual-qa-gemini with --slug=loop-iter-${state.iter} --force --yes${spec.spec ? " --spec=" + spec.spec : ""}; report STATUS: passed|failed' \
        --output-format json --skip-trust`,
       { background: false }
     )
     ```

     Parse the subprocess's exit code (or `STATUS:` field in the JSON);
     treat passed as runner exit 0, anything else as 1. Never run via
     `run_shell_command` as a plain shell command. The `--force +
     fresh slug` combo keeps prior iters' reports intact so Phase 2's
     `priorRunPath` finds the previous iter as baseline.

   - **composite containing visual-qa or verification-adapter**: run each step in declared order
     and **short-circuit on the first non-zero exit**. Use
     `run_shell_command` for shell/test-auto/inner-composite steps; use
     the adapter runner or subprocess dispatcher for verification steps.

3. Compute action with the same `evaluateLoop` contract as the Claude port:
   - Exit 0: `consecutivePass++`. If `>= stableIters`: `break`. Else `continue`.
   - Exit ≠ 0: `consecutivePass = 0`. `continue`.
   - `maxIter === 0` or `maxIter == null`: unlimited mode; do not stop on
     iteration count.
   - Bounded `iter >= maxIter`, `costUSD >= maxCostUSD`, or elapsed
     runtime reaching `loop.maxRuntimeSec` / `--max-runtime-sec`: `exhausted`.
   - Hard policy hook block: `blocked`.
   - Same failure signature reaching `loop.maxRepeatedFailureSignature`:
     `blocked` and escalate to planner/user decision.
   Persist `state.loop` with `iter`, `consecutivePass`, `costUSD`,
   `costTelemetry`,
   `startedAt`, `maxRuntimeSec`, `elapsedRuntimeSec`,
   `lastBreakConditionExit`, `lastFailureSignature`, `failureSignatures`,
   `lastVerifierSummary`, `lastTouchedFiles`, and `nextAction`.
   Also keep `state.orchestration` in sync:
   `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,
   failureSignatures,blockedReasons,budget}`. The next Phase 3 pass consumes
   `state.loop.failureSignatures` and `state.orchestration`; if a signature
   reaches `loop.maxRepeatedFailureSignature`, it escalates to planner/user
   decision before another same-role implementer is dispatched.

4. Branch:
   - `break`: push `{phase: 6, completedAt, status: "broken"}`, exit 0.
   - `continue`: `state.iter++`. Drop `state.phases` entries `phase >= 1`.
     Re-enter Phase 1 (uses `state.task`, skips brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.
   - `blocked`: write handoff with loop state, push `{phase: 6, completedAt, status: "blocked"}`, exit 4.

## Gemini-specific

Gemini's headless CLI surface re-reads `phases/1-intent.md` for in-session loop
continuation. For non-interactive long loops, spawn the entire pipeline
itself as a subprocess and let it self-re-enter via state file:
```
run_shell_command(
  "gemini -p 'Invoke agent-all-gemini and continue from .agent-all-state.json' --output-format json --skip-trust &",
  { background: true }
)
```

This is the same subprocess pattern Phase 3 uses; the coordinator becomes
its own grandchild. Resume relies on `.agent-all-state.json` exclusively.

## Output

Per iter: `Iter <N>/<max|unlimited>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- Composite **short-circuits** on first non-zero exit — saves time when
  an early cheap check (lint/type) gates a slower one (visual-qa).
- For `visual-qa` steps, treat **any** thrown error from the dispatched
  subprocess as exit 1, never as exit 0 — visual-qa must explicitly
  report success.
- Policy events use the common `agent-policy-event/v1` schema. Record
  `BeforeLoopIteration` before the break check and `AfterBreakCondition`
  after it. Gemini has no hard hook for this workflow, so surface the same
  policy results as soft warnings and append them to
  `.agent-skill/runs/<run-id>/policy-log.jsonl` when possible. Include
  `state.costTelemetry` in loop policy payloads so 80% budget warnings and 100%
  budget stops share the same summary.
