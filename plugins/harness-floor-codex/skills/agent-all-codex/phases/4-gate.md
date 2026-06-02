# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff and changed-file list via `shell_command`:
   ```bash
   git diff <wave.baseCommit>..<wave.endCommit>
   git diff --name-only <wave.baseCommit>..<wave.endCommit>
   ```
   `wave.baseCommit` is the pre-wave commit captured by Phase 3 before the
   coordinator-created task commits. For older state without `baseCommit`,
   fall back to `git diff <wave.startCommit>^..<wave.endCommit>` and
   `git diff --name-only <wave.startCommit>^..<wave.endCommit>` when
   `wave.startCommit` has a parent. If `wave.startCommit` is a root commit
   with no parent, use the empty-tree hash
   (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as the diff base.
2. Build the deterministic gate plan:
   ```
   import { buildGatePlan } from "./lib/gate-plan.mjs";
   const gatePlan = buildGatePlan({ files, gates: config.gates, taskId, title });
   ```
   `gatePlan.dispatches` is the source of truth for Phase 4 ordering.
   `lib/gate-plan.mjs` wraps `lib/changed-file-classifier.mjs` and uses
   `classifyChangedFiles(files)` internally, invokes returned coordinators
   before reviewers, and includes the description prefix plus required audit
   token, gate reason, and pass criteria for each dispatch.
3. Dispatch every `gatePlan.dispatches[]` entry in order:
   - `kind=coordinator`, `role=orchestrator`: prompt `.codex/skills/orchestrator/SKILL.md`
     first. Ask it to identify HOT files, unsafe ownership overlap, retry
     sequencing, and pathspec commit risk before reviewer dispatch. It must emit
     `ORCHESTRATION_AUDIT: passed|failed|skipped`.
   - `mode=spec`: invoke `reviewer` with the plan section, diff, and a request
     to flag spec deviations.
   - `mode=quality`: invoke one sequential review per returned reviewer persona
     by reading `.codex/skills/<persona>/SKILL.md`.
   - Prompt each persona with `lib/sequential-dispatch.mjs` `buildReviewPrompt`,
     including the wave plan section, diff, changed-file list, and persona
     context. Pass `dispatch.requiredAudit`, `dispatch.gateReason`, and
     `dispatch.passCriteria` into the review prompt so the sequential skill
     knows why it was selected and what evidence can pass the gate. Preserve
     Codex's sequential strategy; do not use the unsupported legacy agent hook.
   - `qa-reviewer` audits user-side flow only: missing scenarios, persona
     confusion, accessibility-visible behavior, and acceptance gaps. NOT
     tech-stack verification. It must emit `QA_AUDIT: passed|failed|skipped`.
   - Technical reviewers must emit `VERIFICATION_AUDIT: passed|failed|skipped`.
4. Collect verdicts. Bucket issues by severity.
4b. **Classifier-based gate.** Wave passes Phase 4 iff:
   - `ORCHESTRATION_AUDIT` is `passed` or `skipped` for every coordinator
     dispatch, AND
   - `VERIFICATION_AUDIT` is `passed` or `skipped` for
     `verification-reviewer`, AND
   - `QA_AUDIT` is `passed` or `skipped` for `qa-reviewer` when the classifier
     returned `qa-reviewer`, AND
   - no returned coordinator reports HOT-file ownership conflicts, unsafe retry
     sequencing, or pathspec commit risk, AND
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
`.codex/skills/<persona>/SKILL.md`. This includes both returned reviewers and
coordinators. The default operational roster from `/codex-init` ships
`orchestrator`, `frontend-dev`, `backend-dev`, `reviewer`,
`verification-reviewer`, `qa-reviewer`, `design-reviewer`,
`security-reviewer`, `data-reviewer`, and `integration-dev`. If any selected
persona is missing, abort with
`missing review persona: <persona> — upgrade /codex-init`.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Dispatch Prompt Contract (mandatory)

Every sequential reviewer invocation in this phase MUST receive a prompt containing:

- Working directory: the repository root where review commands must run.
- Owned files or line ranges: the changed-file list and the diff range under review; reviewers may inspect related files but must not edit unless explicitly invoked for retry implementation.
- Forbidden files or areas: files outside the wave diff, files owned by other active agents, and any path not needed for the review verdict.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not rewrite implementation code during review unless the coordinator dispatched a retry implementer.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: verdict, issues by severity, audit token, verification evidence checked, and a concise `Self-Audit` covering reviewed scope, unreviewed items, shortcuts, and next action.
- Reusable references: task doc, plan section, diff command, changed-file list, reviewer skill path, `dispatch.requiredAudit`, `dispatch.gateReason`, `dispatch.passCriteria`, and relevant root guidance.

Do not self-commit from a reviewer invocation. Report findings and verification evidence back to the coordinator for retry or pathspec commit review.

## Per-reviewer verification check (mandatory)

Every dispatched reviewer subagent (via sequential `.codex/skills/<persona>/SKILL.md` invocation) MUST receive the following directive in its prompt body:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Two-layer safety net.
