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
     run via `shell_command`:
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

   - **`visual-qa`**: treat as `verify:web-ui` evidence, then dispatch via
     the same strategy Phase 3 uses for
     implementers — `agent` hook (preferred) with role `visual-qa`, or
     sequential `.codex/skills/visual-qa-codex/SKILL.md` fallback —
     invoking the skill with a fresh per-iter slug:

     ```
     # agent-hook path
     agent({
       role: "visual-qa-runner",
       prompt: `Invoke visual-qa-codex skill:
                  --slug=loop-iter-${state.iter} --force --yes${spec.spec ? " --spec=" + spec.spec : ""}
                Report STATUS: passed | STATUS: failed.`
     })

     # sequential path
     invokeSkill(".codex/skills/visual-qa-codex/SKILL.md",
       ["--slug=loop-iter-${state.iter}", "--force", "--yes"])
     ```

     Treat `STATUS: passed` (or exit 0) as runner exit 0; anything
     else as 1. Never run via `shell_command`. The `--force + fresh
     slug` combo keeps prior iters' reports intact so Phase 2's
     `priorRunPath` finds the previous iter as baseline.

   - **composite containing visual-qa or verification-adapter**: run each step in declared order
     and **short-circuit on the first non-zero exit**. Use `shell_command`
     for shell/test-auto/inner-composite steps; use the adapter runner or
     agent-hook / skill-invocation dispatcher for verification steps.

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
   `lastVerifierSummary`, `lastVisualQaVerdict`, `lastTouchedFiles`, and
   `nextAction`. Also keep `state.orchestration` in sync:
   `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,
   failureSignatures,blockedReasons,budget}`. The next Phase 3 pass consumes
   `state.loop.failureSignatures` and `state.orchestration`; if a signature
   reaches `loop.maxRepeatedFailureSignature`, it escalates to planner/user
   decision before another implementer is dispatched.

4. Branch:
   - `break`: push `{phase: 6, completedAt, status: "broken"}`, exit 0.
   - `continue`: `state.iter++`. Drop `state.phases` entries `phase >= 1`.
     Re-enter Phase 1 (uses `state.task`, skips brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.
   - `blocked`: write handoff with loop state, push `{phase: 6, completedAt, status: "blocked"}`, exit 4.

## Codex-specific

Codex chat sessions can self-re-enter by the coordinator literally re-reading
`phases/1-intent.md` and continuing. Cross-session resume relies on
`.agent-all-state.json` since Codex has no equivalent of Copilot's
`store_memory` for in-process state passing.

## Output

Per iter: `Iter <N>/<max|unlimited>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- Composite **short-circuits** on first non-zero exit — saves time when
  an early cheap check (lint/type) gates a slower one (visual-qa).
- For `visual-qa` steps, treat **any** thrown error from the dispatched
  agent/skill as exit 1, never as exit 0 — visual-qa must explicitly
  report success.
- Policy events use the common `agent-policy-event/v1` schema. Record
  `BeforeLoopIteration` before the break check and `AfterBreakCondition`
  after it; Codex command hooks can hard-deny shell policy violations and
  loop policy warnings should be appended to
  `.agent-skill/runs/<run-id>/policy-log.jsonl` when the local hook/state
  writer is available. Include `state.costTelemetry` in loop policy payloads so
  80% budget warnings and 100% budget stops share the same summary.
