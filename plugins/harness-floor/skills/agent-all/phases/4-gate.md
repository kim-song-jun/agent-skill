# Phase 4 — Gate

## Inputs (from state)

- `state.waves[]`
- `config.gates.{specReview, qualityReview, blockOnCritical}`

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip Phase 4 entirely (subagent-driven-development already did per-task reviews). Push `{phase: 4, completedAt}` and exit phase.

## Steps

For each wave with `status === "completed"` (skip already-incomplete waves):

1. Compute the wave's diff and changed-file list:
   ```bash
   git diff <wave.baseCommit>..<wave.endCommit>
   git diff --name-only <wave.baseCommit>..<wave.endCommit>
   ```
   `wave.baseCommit` is the pre-wave commit captured by Phase 3 before implementation. For older state without `baseCommit`, fall back to `git diff <wave.startCommit>^..<wave.endCommit>` and `git diff --name-only <wave.startCommit>^..<wave.endCommit>` when `wave.startCommit` has a parent. If `wave.startCommit` is a root commit with no parent, use the empty-tree hash (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as the diff base.

2. If `gates.specReview`:
   - Dispatch a spec-reviewer subagent. Prompt includes: the plan section for this wave, the diff, and a request to flag any spec deviations.

3. If `gates.qualityReview`:
   - Load `const { reviewers } = classifyChangedFiles(files)` from `lib/changed-file-classifier.mjs`, where `files` is the `git diff --name-only <wave.baseCommit>..<wave.endCommit>` output, or the compatibility fallback output described above.
   - Dispatch one reviewer subagent per returned `reviewers` persona.
   - The classifier always returns the base `reviewer` and `verification-reviewer` personas.
   - The classifier adds `design-reviewer`, `qa-reviewer`, `security-reviewer`, `data-reviewer`, and `integration-dev` only when the changed-file set requires them.
   - Description prefixes:
     - `reviewer`: `Review Task <N>: <title>`
     - `verification-reviewer`: `Verification Review Task <N>: <title>`
     - `qa-reviewer`: `QA Review Task <N>: <title>`
     - Other personas: `<Persona> Review Task <N>: <title>`
   - Prompt includes: the wave's plan section, the diff, the changed-file list, and persona context when available.
   - `qa-reviewer` audits **user-side flow only** — completeness of scenarios, persona-perspective edge cases, would-this-confuse-the-user concerns. NOT tech-stack verification.
   - QA audit token: `qa-reviewer` must emit `QA_AUDIT: passed|failed|skipped`. The `QA ` description prefix routes the `floor-policy` hook to the user-side directive + `QA_AUDIT` token validation.
   - Verification audit token: `verification-reviewer` must emit `VERIFICATION_AUDIT: passed|failed|skipped`.
   - Persona-specific reviewers should emit their existing reviewer verdict format and issue severities.

4. Collect verdicts. Bucket issues by severity (`critical | major | minor`).

4b. **Classifier-based gate.** Wave passes Phase 4 iff:
   - `VERIFICATION_AUDIT ∈ {passed, skipped}` for the `verification-reviewer` dispatch, AND
   - `QA_AUDIT ∈ {passed, skipped}` for the `qa-reviewer` dispatch when the classifier returned `qa-reviewer`, AND
   - no returned reviewer persona reports blocking issues.

   Tech success ≠ user-flow success. A `passed` Verification audit alongside a `failed` QA audit fails the wave; the QA defect report becomes input to the next iteration's plan.

5. If any critical issue AND `blockOnCritical === true`:
   - Dispatch an implementer subagent with the critical issues. Re-run reviewers afterward.
   - Up to 3 retry cycles.
   - If the same issue repeats through 3 retry cycles, stop the retry loop and escalate to a planner/user decision.
   - If still failing: abort phase, push `{phase: 4, status: "blocked"}` to state, exit code 2.

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
