# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff via `shell_command`:
   `git diff <wave.startCommit>..<wave.endCommit>`.
2. If `gates.specReview`: dispatch the `reviewer` skill (via the same
   strategy as Phase 3) with `mode=spec`, passing the diff + plan section.
3. If `gates.qualityReview`: dispatch reviewer with `mode=quality`.
4. Collect verdicts. Bucket issues by severity.
5. If any critical AND `blockOnCritical === true`:
   - Dispatch `dev` skill with the critical issues.
   - Re-dispatch reviewer afterward.
   - Up to 3 retry cycles. If still failing: abort, push
     `{phase: 4, status: "blocked"}`, exit code 2.
6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
7. Push `{phase: 4, completedAt}` once all waves processed.

## Codex-specific

The `reviewer` role-skill at `.codex/skills/reviewer/SKILL.md` must accept
a `mode=spec|quality` parameter in its dispatched body. The default
roster from `/codex-init` ships such a reviewer; if missing the mode
parameter, abort with `reviewer SKILL.md missing mode parameter — upgrade /codex-init`.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.
