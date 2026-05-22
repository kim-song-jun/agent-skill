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
   - Dispatch a code-quality reviewer subagent over the diff. Description prefix: `Review Task <N>: <title>`.

3b. **QA user-side audit (v0.5+).** If `config.policy.qaAudit !== false` (default `true`):
   - Dispatch a QA reviewer subagent. Description prefix MUST be `QA Review Task <N>: <title>` (the `QA ` prefix routes the `floor-policy` hook to the user-side directive + `QA_AUDIT` token validation).
   - Prompt includes: the wave's plan section, the diff, persona context loaded from `.claude/agents/qa.md` (or `qa.md` template rendered with `{{persona}}`).
   - QA reviewer audits **user-side flow only** — completeness of scenarios, persona-perspective edge cases, would-this-confuse-the-user concerns. NOT tech-stack verification (that's the existing reviewer / tester pair).
   - Audit token: reviewer must emit `QA_AUDIT: passed|failed|skipped`. The PostToolUse hook rejects the dispatch if the token is missing or invalid.

4. Collect verdicts. Bucket issues by severity (`critical | major | minor`).

4b. **Two-team gate (v0.5+).** Wave passes Phase 4 iff:
   - `VERIFICATION_AUDIT ∈ {passed, skipped}` for every technical-reviewer dispatch, AND
   - `QA_AUDIT ∈ {passed, skipped}` for the QA-reviewer dispatch (when `policy.qaAudit !== false`).

   Tech success ≠ user-flow success. A `passed` Verification audit alongside a `failed` QA audit fails the wave; the QA defect report becomes input to the next iteration's plan.

5. If any critical issue AND `blockOnCritical === true`:
   - Dispatch an implementer subagent with the critical issues. Re-run reviewers afterward.
   - Up to 3 retry cycles. If still failing: abort phase, push `{phase: 4, status: "blocked"}` to state, exit code 2.

6. Record wave gate verdict in `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.

7. Push `{phase: 4, completedAt}` to `phases` once all waves processed.

## Per-reviewer verification check (mandatory)

Every reviewer subagent's prompt MUST include the following directive:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Phase 3 instructs implementers to verify before claiming done; Phase 4 instructs reviewers to confirm that verification actually happened. Two-layer safety net.

## Output to user

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.
