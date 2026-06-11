# Phase 6 — Loop

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}`, exit normally
(exit 0 if no critical issues, 1 otherwise).

## Steps

1. **Resolve the break-condition spec** via the vendored
   `lib/break-resolver.mjs`:
   ```bash
   node -e 'import("./.cursor/agent-all/lib/break-resolver.mjs").then(m => { const spec = m.normalizeBreakCondition(JSON.parse(process.argv[1])); console.log(spec ? JSON.stringify(spec) : ""); })' "$(jq .loop.breakCondition .agent-all.json)"
   ```
   If the result is empty: abort with exit 2 + a clear message.

2. **Route on `spec.type`:**

   - **`shell` / `test-auto` / pure `composite`** (no visual-qa or
     verification-adapter anywhere):
     resolve to a single shell line via `buildShellCommand(spec)` then
     run via `read_bash`:
     ```bash
     CMD="$(node -e 'import("./.cursor/agent-all/lib/break-resolver.mjs").then(m => process.stdout.write(m.buildShellCommand(JSON.parse(process.argv[1])) ?? ""))' "$SPEC")"
     sh -c "$CMD"; echo "exit=$?"
     ```

   - **`verification-adapter`**: invoke the vendored
     `lib/verification-adapters/registry.mjs` runner for `verify:cli`,
     `verify:api-contract`, `verify:notebook-data`, `verify:sql-db`, or
     `verify:batch-job`, then append
     `.agent-skill/runs/<run-id>/verification-evidence.jsonl`. Exit 0 only
     when the evidence status is `passed`.

   - **`visual-qa`**: treat as `verify:web-ui` evidence, then dispatch a background agent for the
     `visual-qa-cursor` skill, with a fresh per-iter slug so each
     iteration's output doesn't clobber the previous one's baseline:

     ```
     @visual-qa-cursor --slug=loop-iter-${state.iter} --force --yes
     ```

     Await its `STATUS:` line. `STATUS: passed` → runner exit 0;
     anything else → exit 1. Never run via `sh -c`. The `--force +
     fresh slug` combo lets visual-qa write a clean slug dir without
     touching prior iters' reports — Phase 2's `priorRunPath` still
     finds the previous iter as baseline.

   - **composite containing visual-qa or verification-adapter**: run each step in declared order
     and **short-circuit on the first non-zero exit**. Use the shell
     branch for shell/test-auto/inner-composite steps; use the adapter
     runner or visual-qa subagent dispatcher for verification steps.

3. Compute action:
   - Exit 0: `state.consecutivePass++`. If `consecutivePass >= stableIters`:
     action = `break`. Else action = `continue`.
   - Exit ≠ 0: `state.consecutivePass = 0`. action = `continue`.
   - If `maxIter === 0` or `maxIter == null`: unlimited mode; do not stop on
     iteration count.
   - If bounded `state.iter >= maxIter`: action = `exhausted`.
   - If `state.costUSD >= maxCostUSD`: action = `exhausted`.
   - If elapsed runtime reaches `loop.maxRuntimeSec` / `--max-runtime-sec`:
     action = `exhausted`.
   - If a hard policy hook blocks the iteration: action = `blocked`.
   - If the same failure signature reaches `loop.maxRepeatedFailureSignature`:
     action = `blocked` and escalate to planner/user decision.
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

4. Branch on action:
   - `break`: push `{phase: 6, completedAt, status: "broken"}`, exit 0.
   - `continue`: increment `state.iter`. Drop `state.phases` entries with
     `phase >= 1`. Re-invoke `@agent-all-coordinator` from Phase 1 — in
     loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`,
     exit 3.
   - `blocked`: write handoff with loop state, push `{phase: 6, completedAt,
     status: "blocked"}`, exit 4.

## Cursor-specific

Cursor cannot auto-re-invoke a chat. The coordinator emits:

> `Loop continue: iter <N+1> ready. Send "@agent-all-coordinator continue" to proceed.`

and waits for the user. This is the biggest behavioral gap vs the Claude
Code orchestrator, which auto-re-enters Phase 1 in-process. Users running
long loops should use Cursor's "auto-confirm" mode (if available) or
script the re-invocation via `cursor-cli` (when GA).

## Output

Per iter: `Iter <N>/<max|unlimited>: break check (<type>) exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`

## Notes

- For `visual-qa` steps, treat **any** thrown error from the subagent as
  exit 1, never as exit 0 — visual-qa must explicitly report success.
- Composite short-circuits as soon as a step fails, saving subprocess
  cost when an early cheap check (lint/type) gates a slower one
  (visual-qa).
- Policy events use the common `agent-policy-event/v1` schema. Record
  `BeforeLoopIteration` before the break check and `AfterBreakCondition`
  after it. Cursor cannot hard-deny from this chat surface, so surface the
  same policy results as soft warnings and append them to
  `.agent-skill/runs/<run-id>/policy-log.jsonl` when possible. Include
  `state.costTelemetry` in loop policy payloads so 80% budget warnings and 100%
  budget stops share the same summary.

## Shell helpers

```bash
# Step 1 — normalise the spec.
node -e 'import("./.cursor/agent-all/lib/break-resolver.mjs").then(m => process.stdout.write(JSON.stringify(m.normalizeBreakCondition(JSON.parse(process.argv[1])) ?? null)))' "$RAW_SPEC"

# Steps 3-4 — update iter counters + consecutivePass atomically.
node .cursor/agent-all/lib/state-rw.mjs read  .agent-all-state.json
# ... mutate state.iter / state.consecutivePass / state.phases ...
node .cursor/agent-all/lib/state-rw.mjs write .agent-all-state.json '<mutated-json>'
```

Cursor cannot re-invoke the coordinator from inside the same chat. After
writing state, print the loop-continue prompt and wait for the user (see
Cursor-specific section above).
