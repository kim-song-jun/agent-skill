# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff and changed-file list via `run_shell_command`:
   ```bash
   git diff <wave.baseCommit>..<wave.endCommit>
   git diff --name-only <wave.baseCommit>..<wave.endCommit>
   ```
   `wave.baseCommit` is the pre-wave commit captured by Phase 3 before the
   coordinator-created task commits. For older state without `baseCommit`,
   fall back to `git diff <wave.startCommit>^..<wave.endCommit>` when
   `wave.startCommit` has a parent. If `wave.startCommit` is a root commit
   with no parent, use the empty-tree hash
   (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as the diff base.

2. Build the deterministic gate plan and dispatch subprocess roster:
   ```javascript
   import { buildGatePlan } from "./lib/gate-plan.mjs";
   const orchestration = wave.orchestration ?? state.orchestration ?? null;
   const requiredReviewerRoles = (orchestration?.requiredAgents ?? [])
     .filter((agent) => agent.kind === "reviewer")
     .map((agent) => agent.role);
   const requiredCoordinatorRoles = (orchestration?.requiredAgents ?? [])
     .filter((agent) => agent.kind === "coordinator")
     .map((agent) => agent.role);
   const gatePlan = buildGatePlan({
     files,
     gates: config.gates,
     taskId,
     title,
     requiredReviewerRoles,
     requiredCoordinatorRoles,
   });
   ```
   `gatePlan.dispatches` is the source of truth for Phase 4 subprocess
   ordering. It invokes coordinators before reviewers and includes the
   description prefix plus required audit token, gate reason, and pass
   criteria for each subprocess. Union dynamic roles from
   `orchestration.requiredAgents` before spawning. Record every dynamic gate
   subprocess in `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role,
   reason, wave, and cost estimate; emit a compatible `BeforeAgentSpawn`
   policy entry if the dispatch was not already policy-evaluated in Phase 3.

3. Spawn every `gatePlan.dispatches[]` entry as a headless Gemini subprocess
   through the same wrapper/output-file pattern used in Phase 3:

   - `kind=coordinator`, `role=orchestrator`: spawn with description prefix
     `Orchestration Gate Task <N>: <title>`. Prompt it to identify HOT files,
     unsafe ownership overlap, retry sequencing, and pathspec commit risk
     before reviewer subprocesses are spawned. It **must** emit
     `ORCHESTRATION_AUDIT: passed|failed|skipped` in its output.
     ```
     run_shell_command("gemini -p 'Orchestration Gate Task <N>: <title>\n<prompt>...' \
       --output-format json --skip-trust > /tmp/agent-all/wave-<i>/orchestration-review.json &")
     ```
   - `mode=spec`: spawn a reviewer subprocess with the plan section, diff, and
     a request to flag spec deviations. Technical reviewer — must emit
     `VERIFICATION_AUDIT: passed|failed|skipped`.
     ```
     run_shell_command("gemini -p 'MODE=spec; <prompt>...' \
       --output-format json --skip-trust > /tmp/agent-all/wave-<i>/spec-review.json &")
     ```
   - `mode=quality`: spawn one reviewer subprocess per returned reviewer
     persona. Include the wave plan section, diff, changed-file list, and
     persona context. Pass `dispatch.requiredAudit`, `dispatch.gateReason`,
     and `dispatch.passCriteria` into each subprocess prompt so it knows why
     the classifier selected that gate and what evidence can pass it.
   - `qa-reviewer` audits **user-side flow only** — completeness of scenarios,
     persona-perspective edge cases, would-this-confuse-the-user concerns. NOT
     tech-stack verification. It **must** emit `QA_AUDIT: passed|failed|skipped`.
   - Technical reviewers (`verification-reviewer`, `data-reviewer`,
     `design-reviewer`, `security-reviewer`, `quality-debt-reviewer`, etc.)
     must emit `VERIFICATION_AUDIT: passed|failed|skipped`.
   - When `gates.qualityReview !== false`, the plan must include
     `quality-debt-reviewer` even if the classifier finds no domain-specific
     reviewer. This gate checks unrequested fallback, meaningless tests,
     suppressions, TODO/dead code, debug/test-only production paths, and
     unjustified temporary debt.

4. Await all review subprocesses. Read result JSON files. Bucket issues by
   severity (`critical | major | minor`).

4b. **Classifier-based gate.** Wave passes Phase 4 iff:
   - `ORCHESTRATION_AUDIT ∈ {passed, skipped}` for every coordinator
     subprocess, AND
   - `VERIFICATION_AUDIT ∈ {passed, skipped}` for the `verification-reviewer`
     subprocess, AND
   - `QA_AUDIT ∈ {passed, skipped}` for the `qa-reviewer` subprocess when the
     classifier returned `qa-reviewer`, AND
   - `quality-debt-reviewer` reports no unapproved quality debt; every accepted
     exception must be recorded in the task doc `Quality Debt Exceptions` table
     with reason, owner, follow-up issue, and expiry, AND
   - no returned coordinator subprocess reports HOT-file ownership conflicts,
     unsafe retry sequencing, or pathspec commit risk, AND
   - no returned reviewer subprocess reports blocking issues.

   **A reviewer subprocess that returns untokenized prose without its required
   audit token (`VERIFICATION_AUDIT:`, `QA_AUDIT:`, or `ORCHESTRATION_AUDIT:`)
   MUST NOT pass the gate.** The coordinator must re-dispatch the subprocess
   with the missing-token error visible in its prompt.

   Tech success != user-flow success. A `passed` Verification audit alongside a
   `failed` QA audit fails the wave; the QA defect report becomes input to the
   next iteration's plan.

5. If any critical issue AND `blockOnCritical === true`:
   - Spawn an implementer subprocess with the critical issues.
   - Re-spawn reviewer subprocesses afterward.
   - Up to 3 retry cycles. If the same issue repeats through 3 retry cycles,
     update `state.orchestration.failureSignatures`, stop the retry loop, and
     escalate to planner/user decision instead of spawning more implementers.
     If still failing: abort, push `{phase: 4, status: "blocked"}`, exit code 2.

6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}` and
   keep `state.orchestration.blockedReasons` in sync with any critical
   repeated-failure, budget, or policy block.

7. Push `{phase: 4, completedAt}` once all waves processed.

## Gemini-specific

Reviewer subprocesses use the same `gemini -p --output-format json` headless
pattern as Phase 3 implementers. Each reviewer skill/persona must be selected
by the prompt body (`MODE=spec|quality|orchestration`) and must emit its
required audit token (`ORCHESTRATION_AUDIT`, `VERIFICATION_AUDIT`, or
`QA_AUDIT`) in the output. The `/gemini-init` default roster ships
`orchestrator`, `reviewer`, `qa-reviewer`, `design-reviewer`,
`security-reviewer`, `data-reviewer`, `quality-debt-reviewer`. If a selected
persona is missing from `.gemini/skills/`, abort with
`missing review persona: <persona> — upgrade /gemini-init`.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Dispatch Prompt Contract (mandatory)

Every reviewer `gemini -p` subprocess's prompt MUST include:

- Working directory: the repository root where review commands must run.
- Owned files or line ranges: the changed-file list and the diff range under
  review; reviewers may inspect related files but must not edit unless
  explicitly re-dispatched for a retry fix.
- Forbidden files or areas: files outside the wave diff, files owned by other
  active subprocesses, and any path not needed for the review verdict.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not rewrite implementation code during review unless the coordinator
    spawned a retry implementer subprocess.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: verdict, issues by severity, required audit token
  (`ORCHESTRATION_AUDIT:`, `VERIFICATION_AUDIT:`, or `QA_AUDIT:` with value
  `passed|failed|skipped`), verification evidence checked, and a concise
  `Self-Audit` covering reviewed scope, unreviewed items, shortcuts, and next
  action.
- Reusable references: task doc, plan section, diff command, changed-file list,
  reviewer skill path, `dispatch.requiredAudit`, `dispatch.gateReason`,
  `dispatch.passCriteria`, and relevant root guidance.

Do not self-commit from a reviewer subprocess. Report findings and verification
evidence back to the coordinator for retry or pathspec commit review.

## Per-reviewer verification check (mandatory)

Every reviewer `gemini -p` subprocess's prompt MUST include the following
directive:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Two-layer safety net.
