# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip
Phase 4. Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff: `git diff <wave.startCommit>..<wave.endCommit>`.
2. If `gates.specReview`: invoke `@agent-all-reviewer` with `mode=spec`,
   passing the plan section for this wave plus the diff.
3. If `gates.qualityReview`: invoke `@agent-all-reviewer` with `mode=quality`,
   passing the diff.
4. Collect verdicts. Bucket issues by severity (`critical | major | minor`).
5. If any critical AND `blockOnCritical === true`:
   - Re-dispatch `@agent-all-implementer` with the critical issues.
   - Re-invoke reviewers afterward.
   - Up to 3 retry cycles. If still failing: abort phase, push
     `{phase: 4, status: "blocked"}`, exit code 2.
6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
7. Push `{phase: 4, completedAt}` once all waves processed.

## Cursor-specific

Cursor's reviewer is the same `agent-all-reviewer.md` file — `mode` is
passed in the chat prompt body (the reviewer reads `mode=spec` vs
`mode=quality` from the first line). Both modes use the same subagent
because Cursor's description-match routing is coarse-grained.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.
