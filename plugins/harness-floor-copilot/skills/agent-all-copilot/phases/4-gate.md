# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff via `read_bash`:
   `git diff <wave.startCommit>..<wave.endCommit>`.
2. If `gates.specReview`: dispatch a `task` invocation with prompt
   "MODE=spec — verify diff matches plan section..." passing the diff +
   plan section. Capture `agentId`. Await.
3. If `gates.qualityReview`: dispatch a `task` with `MODE=quality`. Await.
4. Collect verdicts via `read_agent`. Bucket issues by severity.
5. If any critical AND `blockOnCritical === true`:
   - Dispatch an implementer `task` with the critical issues.
   - Re-dispatch reviewers afterward.
   - Up to 3 retry cycles. If still failing: abort, push
     `{phase: 4, status: "blocked"}`, exit code 2.
6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
7. Push `{phase: 4, completedAt}` once all waves processed.

## Copilot-specific

Both `spec` and `quality` reviewers are dispatched as separate `task`
invocations — they run concurrently if multiple waves' gates are processed
back-to-back. Tag each with `context.agentAllGate = "<wave>:<mode>"` so
`list_agents()` filtering can disambiguate.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Per-reviewer verification check (mandatory)

Every reviewer `task(...)` invocation's prompt body MUST include the following directive:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Two-layer safety net.
