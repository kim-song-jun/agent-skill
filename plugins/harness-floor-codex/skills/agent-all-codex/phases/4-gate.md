# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff and changed-file list via `shell_command`:
   ```bash
   git diff <wave.startCommit>..<wave.endCommit>
   git diff --name-only <wave.startCommit>..<wave.endCommit>
   ```
2. If `gates.specReview`: dispatch the `reviewer` skill (via the same
   strategy as Phase 3) with `mode=spec`, passing the diff + plan section.
3. If `gates.qualityReview`:
   - Load `const { reviewers } = classifyChangedFiles(files)` from
     `lib/changed-file-classifier.mjs`, where `files` is the
     `git diff --name-only <wave.startCommit>..<wave.endCommit>` output.
   - Dispatch one sequential review invocation per returned persona by reading
     `.codex/skills/<persona>/SKILL.md`.
   - The classifier always returns `reviewer` and `verification-reviewer`.
   - It adds `qa-reviewer`, `design-reviewer`, `security-reviewer`,
     `data-reviewer`, and `integration-dev` when the changed-file set requires
     user-flow, UI, security, data, or cross-stack review.
   - Prompt each persona with the wave plan section, diff, changed-file list,
     and persona context. Preserve Codex's sequential strategy; do not use the
     unsupported legacy agent hook.
   - `qa-reviewer` audits user-side flow only: missing scenarios, persona
     confusion, accessibility-visible behavior, and acceptance gaps. NOT
     tech-stack verification.
   - QA audit token: `qa-reviewer` must emit
     `QA_AUDIT: passed|failed|skipped`.
   - Verification audit token: `verification-reviewer` must emit
     `VERIFICATION_AUDIT: passed|failed|skipped`.
4. Collect verdicts. Bucket issues by severity.
4b. **Classifier-based gate.** Wave passes Phase 4 iff:
   - `VERIFICATION_AUDIT` is `passed` or `skipped` for
     `verification-reviewer`, AND
   - `QA_AUDIT` is `passed` or `skipped` for `qa-reviewer` when the classifier
     returned `qa-reviewer`, AND
   - no returned reviewer persona reports blocking issues.

   Tech success != user-flow success. A passed Verification audit alongside a
   failed QA audit fails the wave; the QA defect report becomes input to the
   next iteration's plan.
5. If any critical AND `blockOnCritical === true`:
   - Dispatch `dev` skill with the critical issues.
   - Re-dispatch the classifier-selected reviewer personas afterward.
   - Up to 3 retry cycles. If the same issue repeats through 3 retry cycles,
     stop the retry loop and escalate to planner/user decision. If still
     failing: abort, push
     `{phase: 4, status: "blocked"}`, exit code 2.
6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
7. Push `{phase: 4, completedAt}` once all waves processed.

## Codex-specific

The role skills selected by `classifyChangedFiles(files)` must exist under
`.codex/skills/<persona>/SKILL.md`. The default operational roster from
`/codex-init` ships `reviewer`, `verification-reviewer`, `qa-reviewer`,
`design-reviewer`, `security-reviewer`, `data-reviewer`, and
`integration-dev`. If any selected persona is missing, abort with
`missing reviewer persona: <persona> — upgrade /codex-init`.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Per-reviewer verification check (mandatory)

Every dispatched reviewer subagent (via sequential `.codex/skills/<persona>/SKILL.md` invocation) MUST receive the following directive in its prompt body:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Two-layer safety net.
