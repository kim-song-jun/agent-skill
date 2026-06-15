# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip
Phase 4. Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff and changed-file list:
   ```bash
   git diff <wave.baseCommit>..<wave.endCommit>
   git diff --name-only <wave.baseCommit>..<wave.endCommit>
   ```
   `wave.baseCommit` is the pre-wave commit captured by Phase 3 before the
   first implementer dispatch. For state without `baseCommit`, fall back to
   `git diff <wave.startCommit>^..<wave.endCommit>` when `wave.startCommit`
   has a parent; if it is a root commit, use the empty-tree hash
   (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as the diff base.
2. Read `const orchestration = wave.orchestration ?? state.orchestration`.
   Union dynamic reviewer/coordinator roles from
   `orchestration.requiredAgents` into the gate dispatch list before invoking
   reviewers. Dynamic `orchestrator`, `design-reviewer`, `qa-reviewer`,
   `security-reviewer`, `data-reviewer`, and `integration-dev` selections
   must keep their role, reason, wave, and cost estimate in
   `.agent-skill/runs/<run-id>/spawn-log.jsonl`; if a gate dispatch was not
   already policy-evaluated in Phase 3, emit a compatible `BeforeAgentSpawn`
   policy entry before invoking it.
3. If `gates.specReview`: invoke `@agent-all-reviewer` with `mode=spec`,
   passing the plan section for this wave plus the diff. The reviewer must
   emit `VERIFICATION_AUDIT: passed|failed|skipped`.
4. If `gates.qualityReview`: invoke `@agent-all-reviewer` with `mode=quality`,
   passing the diff. The reviewer must emit `VERIFICATION_AUDIT: passed|failed|skipped`.
   When `orchestration.requiredAgents` includes `qa-reviewer`, that invocation
   must emit `QA_AUDIT: passed|failed|skipped`. When it includes the
   `orchestrator` coordinator role, that invocation must emit
   `ORCHESTRATION_AUDIT: passed|failed|skipped`.
5. Collect verdicts. Bucket issues by severity (`critical | major | minor`).

5b. **Classifier-based gate.** A wave passes Phase 4 iff:
   - `ORCHESTRATION_AUDIT ∈ {passed, skipped}` for every coordinator dispatch, AND
   - `VERIFICATION_AUDIT ∈ {passed, skipped}` for every technical reviewer dispatch, AND
   - `QA_AUDIT ∈ {passed, skipped}` for the `qa-reviewer` dispatch when the
     orchestration required `qa-reviewer`, AND
   - no returned reviewer persona reports blocking issues.

   A reviewer returning untokenized prose MUST NOT pass the gate. If any
   required audit token is absent from the reviewer's return, treat it as
   `failed` for that token and re-dispatch. Tech success != user-flow success:
   a `passed` VERIFICATION_AUDIT alongside a `failed` QA_AUDIT fails the wave.

6. If any critical AND `blockOnCritical === true`:
   - Re-dispatch `@agent-all-implementer` with the critical issues.
   - Re-invoke reviewers afterward.
   - Up to 3 retry cycles. If the same issue repeats through 3 retry cycles,
     update `state.orchestration.failureSignatures` and stop the retry loop.
     Escalate to a planner/user decision instead of dispatching more implementers.
     If still failing: abort phase, push
     `{phase: 4, status: "blocked"}`, exit code 2.
7. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
   Keep `state.orchestration.blockedReasons` in sync with any critical
   repeated-failure, budget, or policy block.
8. Push `{phase: 4, completedAt}` once all waves processed.

## Cursor-specific

Cursor's reviewer is the same `agent-all-reviewer.md` file — `mode` is
passed in the chat prompt body (the reviewer reads `mode=spec` vs
`mode=quality` from the first line). Both modes use the same subagent
because Cursor's description-match routing is coarse-grained.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Dispatch Prompt Contract (mandatory)

Every `@agent-all-reviewer` chat message body MUST include:

- Working directory: the repository root where review commands must run.
- Owned files or line ranges: the changed-file list and the diff range under
  review; reviewers may inspect related files but must not edit unless
  explicitly re-dispatched for a retry fix.
- Forbidden files or areas: files outside the wave diff, files owned by other
  active agents, and any path not needed for the review verdict.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not rewrite implementation code during review unless the coordinator
    dispatched a retry implementer.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: verdict, issues by severity, audit token
  (`VERIFICATION_AUDIT`, `QA_AUDIT`, or `ORCHESTRATION_AUDIT` as applicable),
  verification evidence checked, and a concise `Self-Audit` covering reviewed
  scope, unreviewed items, shortcuts, and next action.
- Reusable references: task doc, plan section, diff command, changed-file list,
  and relevant root guidance.

Do not self-commit from a reviewer subagent. Report findings and verification
evidence back to the coordinator for retry or pathspec commit review.

## Per-reviewer verification check (mandatory)

Every `@agent-all-reviewer` invocation's chat body MUST include the following directive:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Phase 3 instructs implementers to verify before claiming done; Phase 4 instructs reviewers to confirm that verification actually happened. Two-layer safety net.
