# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff and changed-file list:
   ```bash
   git diff <wave.baseCommit>..<wave.endCommit>
   git diff --name-only <wave.baseCommit>..<wave.endCommit>
   ```
   `wave.baseCommit` is the pre-wave commit captured by Phase 3 before
   orchestrator-created task commits. For older state without `baseCommit`,
   fall back to `git diff <wave.startCommit>^..<wave.endCommit>` and
   `git diff --name-only <wave.startCommit>^..<wave.endCommit>` when
   `wave.startCommit` has a parent. If `wave.startCommit` is a root commit
   with no parent, use the empty-tree hash
   (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) as the diff base.

2. Build the deterministic gate plan:
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
   `gatePlan.dispatches` is the source of truth for Phase 4 ordering.
   `lib/gate-plan.mjs` uses `classifyChangedFiles(files)` internally, then
   unions any dynamic roles persisted by Phase 3. It dispatches coordinators
   before reviewers and includes the description prefix plus required audit
   token, gate reason, and pass criteria for each dispatch.
   When `gates.qualityReview !== false`, the plan must include
   `quality-debt-reviewer` even if the classifier finds no domain-specific
   reviewer.

3. Dispatch every `gatePlan.dispatches[]` entry in order as a Copilot `task`
   invocation. Tag each with `context.agentAllGate = "<wave>:<mode>"` and a
   stable agent name such as `agent-all-gate-<wave>-<mode>-<role>` so optional
   `subagentStop` lifecycle logs can be correlated:
   - `kind=coordinator`, `role=orchestrator`: description prefix
     `Orchestration Gate Task <N>: <title>`. Prompt it to identify HOT files,
     unsafe ownership overlap, retry sequencing, and pathspec commit risk
     before reviewer dispatch. It **must emit**
     `ORCHESTRATION_AUDIT: passed|failed|skipped`.
   - `mode=spec`: description prefix `Spec Review Task <N>: <title>`. Prompt
     includes the plan section for this wave, the diff, and a request to flag
     spec deviations.
   - `mode=quality`: dispatch one reviewer `task` per returned reviewer
     persona. Prompt includes the wave's plan section, diff, changed-file
     list, and persona context when available.
   - Each prompt MUST copy `dispatch.requiredAudit`, `dispatch.gateReason`,
     and `dispatch.passCriteria` so the reviewer knows why the classifier
     selected that gate and what evidence can pass it.
   - `qa-reviewer` audits **user-side flow only** — completeness of
     scenarios, persona-perspective edge cases, would-this-confuse-the-user
     concerns. NOT tech-stack verification. It **must emit**
     `QA_AUDIT: passed|failed|skipped`.
   - Technical reviewers (including `verification-reviewer`,
     `quality-debt-reviewer`, `data-reviewer`, `design-reviewer`,
     `integration-dev`, `security-reviewer`) **must emit**
     `VERIFICATION_AUDIT: passed|failed|skipped`.
   - Append each dynamic gate `task` spawn to
     `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role, reason, wave,
     and cost estimate. If a dispatch was not already policy-evaluated in
     Phase 3, emit a compatible `BeforeAgentSpawn` policy entry before
     invoking it.

4. Collect verdicts from each reviewer task's final response contract. Bucket
   issues by severity (`critical | major | minor`). Optional hook records add
   lifecycle evidence only; they are not a substitute for the reviewer verdict.

4b. **Classifier-based gate.** Wave passes Phase 4 iff:
   - `ORCHESTRATION_AUDIT ∈ {passed, skipped}` for every coordinator
     dispatch, AND
   - `VERIFICATION_AUDIT ∈ {passed, skipped}` for the
     `verification-reviewer` dispatch, AND
   - `QA_AUDIT ∈ {passed, skipped}` for `qa-reviewer` when the classifier
     returned `qa-reviewer`, AND
   - `quality-debt-reviewer` reports no unapproved quality debt; every
     accepted exception must be recorded in the task doc
     `Quality Debt Exceptions` table with reason, owner, follow-up issue,
     and expiry, AND
   - no returned coordinator reports HOT-file ownership conflicts, unsafe
     retry sequencing, or pathspec commit risk, AND
   - no returned reviewer persona reports blocking issues.

   A reviewer returning untokenized prose (no `*_AUDIT:` line) must NOT
   pass the gate — treat as a `failed` audit and re-dispatch.

   Tech success != user-flow success. A `passed` Verification audit
   alongside a `failed` QA audit fails the wave; the QA defect report
   becomes input to the next iteration's plan.

5. If any critical AND `blockOnCritical === true`:
   - Dispatch an implementer `task` with the critical issues.
   - Re-dispatch classifier-selected reviewer `task`s afterward.
   - Up to 3 retry cycles. If the same issue repeats through 3 retry
     cycles, update `state.orchestration.failureSignatures` and stop the
     retry loop. Escalate to a planner/user decision instead of dispatching
     more implementers.
   - If still failing: abort, push `{phase: 4, status: "blocked"}`,
     exit code 2.
6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
   Keep `state.orchestration.blockedReasons` in sync with any critical
   repeated-failure, budget, or policy block.
7. Push `{phase: 4, completedAt}` once all waves processed.

## Dispatch Prompt Contract (mandatory)

Every reviewer `task(...)` invocation in this phase MUST include a prompt
containing:

- Working directory: the repository root where review commands must run.
- Owned files or line ranges: the changed-file list and the diff range under
  review; reviewers may inspect related files but must not edit unless
  explicitly dispatched for a retry fix.
- Forbidden files or areas: files outside the wave diff, files owned by other
  active agents, and any path not needed for the review verdict.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not rewrite implementation code during review unless the orchestrator
    dispatched a retry implementer.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: verdict, issues by severity, audit token
  (`VERIFICATION_AUDIT`, `QA_AUDIT`, or `ORCHESTRATION_AUDIT`),
  verification evidence checked, and a concise `Self-Audit` covering
  reviewed scope, unreviewed items, shortcuts, and next action.
- Reusable references: task doc, plan section, diff command, changed-file
  list, `dispatch.requiredAudit`, `dispatch.gateReason`,
  `dispatch.passCriteria`, and relevant root guidance.

Do not self-commit from a reviewer subagent. Report findings and verification
evidence back to the orchestrator for retry or pathspec commit review.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Per-reviewer verification check (mandatory)

Every reviewer `task(...)` invocation's prompt body MUST include the following directive:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Two-layer safety net.

## Step 3-adversarial — Independent adversarial re-verification (mandatory when `gates.adversarialVerify === true`)

When `config.gates.adversarialVerify === true`, `buildGatePlan()` appends one
dispatch with `role: "verification-reviewer-adversarial"`, `kind: "reviewer"`,
`mode: "adversarial"` (see `lib/gate-plan.mjs`). The orchestrator dispatches it
LAST, after every other `gatePlan.dispatches[]` entry, as a dedicated Copilot
`task` tagged `agent-all-gate-<wave>-adversarial-verification-reviewer-adversarial`.

- **Model tier:** this `task` MUST run as **opus** (judge node, spec §3.1 / rule 11). Never sonnet or haiku.
- **Independence is structural, not promised.** The adversarial `task` MUST NOT
  read the implementer's self-report, commit messages, or any role-produced
  output. It MUST re-derive the verdict from the wave diff and the wave tip
  commit only — `git diff <wave.baseCommit>..<wave.endCommit>` plus the canonical
  wrapper `adversarialVerify({diff, acceptanceCriteria, breakCondition, cwd})`
  from `lib/verification-adapters/adversarial-verifier.mjs`. The dispatched task
  runs:
  ```bash
  WAVE_DIFF="$(git diff <wave.baseCommit>..<wave.endCommit>)" \
  REPO_ROOT="$(pwd)" \
  node --input-type=module -e "
    import { adversarialVerify } from './lib/verification-adapters/adversarial-verifier.mjs';
    const result = await adversarialVerify({ diff: process.env.WAVE_DIFF, acceptanceCriteria: [], breakCondition: <breakCondition>, cwd: process.env.REPO_ROOT });
    console.log(JSON.stringify(result));
  "
  ```
  and reports the returned `{ audit, evidence, exitCode }` literal. Do NOT call
  `runVerificationAdapterSpec()` directly — the production path MUST go through
  `adversarialVerify` so its structural-independence guard (the signature
  excludes any self-report) is enforced on every live invocation.
- **Prompt contract:** the verifier `task` prompt MUST NOT include the
  implementer's implementation notes, self-assessments, or self-report output.
  Structural independence — not a promise.
- **Required output:** exactly one of `VERIFICATION_AUDIT: passed`,
  `VERIFICATION_AUDIT: failed`, or `VERIFICATION_AUDIT: skipped`, plus a
  `verification-evidence/v1` evidence object (reuse `lib/verification-adapters/schema.mjs`).
- **Failure is critical:** a `VERIFICATION_AUDIT: failed` from
  `verification-reviewer-adversarial` is a `critical` issue that BLOCKS the wave;
  the orchestrator MUST enter the block-on-critical retry loop (step 5). A
  passing self-reviewer verdict does NOT override a failing adversarial verdict.
- **Nesting constraint:** the adversarial `task` lives at the orchestrator level;
  a reviewer or implementer `task` MUST NOT spawn it (`references/orchestrator-routing.md`).
- **Live-CLI posture (#27):** the `adversarialVerify` module is pure JS and runs
  real behavior (proven by the module tests). The *live `task` dispatch* of this
  step is spec-level and live-CLI-unverified (#27) until the Copilot CLI spike.
