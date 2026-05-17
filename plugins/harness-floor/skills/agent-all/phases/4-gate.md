# Phase 4 — Gate

## Inputs (from state)

- `state.waves[]`
- `config.gates.{specReview, qualityReview, blockOnCritical}`

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip Phase 4 entirely (subagent-driven-development already did per-task reviews). Push `{phase: 4, completedAt}` and exit phase.

## Steps

For each wave with `status === "completed"` (skip already-incomplete waves):

1. Compute the wave's diff:
   ```bash
   git diff <wave.startCommit>..<wave.endCommit>
   ```
   (Start/end commits are first and last from `wave.tasks[].commits`.)

2. If `gates.specReview`:
   - Dispatch a spec-reviewer subagent. Prompt includes: the plan section for this wave, the diff, and a request to flag any spec deviations.

3. If `gates.qualityReview`:
   - Dispatch a code-quality reviewer subagent over the diff.

4. Collect verdicts. Bucket issues by severity (`critical | major | minor`).

5. If any critical issue AND `blockOnCritical === true`:
   - Dispatch an implementer subagent with the critical issues. Re-run reviewers afterward.
   - Up to 3 retry cycles. If still failing: abort phase, push `{phase: 4, status: "blocked"}` to state, exit code 2.

6. Record wave gate verdict in `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.

7. Push `{phase: 4, completedAt}` to `phases` once all waves processed.

## Output to user

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.
