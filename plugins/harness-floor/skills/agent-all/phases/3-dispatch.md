# Phase 3 — Dispatch (3a Scoping → 3b Ask → 3c Implement)

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`
- `config.policy.decisionSurfacing` (default true)
- `state.loop.{failureSignatures,lastFailureSignature}` when resuming from a
  failing loop iteration
- `state.costUSD`
- `state.costTelemetry.summary.totalUSD` when cost telemetry is present

## Steps

1. Parse the plan file. Extract task list using:
   ```javascript
   const text = readFileSync(plan.path, "utf-8");
   const headings = [...text.matchAll(/^### Task (\d+):\s*(.+)$/gm)];
   const tasks = headings.map((m, i) => {
     const next = headings[i + 1]?.index ?? text.length;
     const section = text.slice(m.index, next);
     const files = [...section.matchAll(/^- (?:Create|Modify):\s*`([^`]+)`/gm)].map(x => x[1]);
     const role = (/role:\s*(\w[\w-]*)/i.exec(section) ?? [])[1] ?? "dev";
     return { id: parseInt(m[1], 10), title: m[2].trim(), files, role };
   });
   ```

2. Build static waves first:
   ```javascript
   import { buildWaves } from "./lib/wave-builder.mjs";
   const waves = buildWaves(tasks, config.waves[waveSize]);
   ```

3. For each wave, classify the active wave through the dynamic orchestration
   planner, capture `baseCommit` before implementation with `git rev-parse HEAD`,
   then run sub-phases **3a → 3b → 3c**. Persist this pre-wave commit on the
   wave record so Phase 4 can include the first wave commit in gate diffs.
   If `state.resumeCheckpoint` is set and `state.resumeCheckpoint.wave === i`,
   re-enter at sub-phase 3a using `state.resumeCheckpoint.miniPlans` instead
   of re-parsing the plan; this covers the mid-3a death scenario where scoping
   subagents never returned.
   ```javascript
   import { planDynamicWave } from "./lib/orchestration/wave-planner.mjs";

   const planned = planDynamicWave({
     tasks,
     waveConfig: config.waves[waveSize],
     runId,
     wave: i,
     platform: "claude",
     failureSignatures: state.loop?.failureSignatures ?? {},
     visualQa: state.loop?.lastVisualQaVerdict ?? null,
     costUSD: state.costTelemetry?.summary?.totalUSD ?? state.costUSD ?? 0,
     maxCostUSD: config.defaults.maxCostUSD,
     repeatedFailureThreshold: config.loop?.maxRepeatedFailureSignature ?? 3,
     writePolicyAudit: true,
     writeSpawnLog: true,
   });
   ```

   Persist `planned.orchestration` to `state.orchestration` before dispatch and
   later copy it onto the wave record. Shape:
   `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,
   failureSignatures,blockedReasons,budget}`.

   `requiredAgents` is the dynamic source of truth for implementation/review
   roles: UI/frontend changes include `frontend-dev`, `design-reviewer`, and
   `qa-reviewer`; migrations/fixtures/backfills include `data-reviewer`;
   auth/API/security surfaces include `security-reviewer`; repeated failure
   signatures add a `planner` escalation and do not add another implementer.
   The spawn policy emits `BeforeAgentSpawn` events through the shared policy
   engine, enforces wave-level spawn caps and same-role repeat limits from
   `state.orchestration.spawnedAgents`, and appends
   `.agent-skill/runs/<run-id>/spawn-log.jsonl` entries with role, reason,
   wave, and cost estimate.

   Cost telemetry is the budget SSOT when present. Record each reported or
   estimated model/tool usage as `agent-cost-telemetry/v1`, append
   `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, and mirror the latest
   summary to `state.costTelemetry.summary` plus `state.costUSD` for backward
   compatibility. Do not store prompt, transcript, or tool-output bodies in the
   telemetry record.

   This is local `/agent-all` orchestration only. Do not call the built-in
   `Workflow` tool from this phase; `Workflow` remains a sibling route for
   evidence-producing work, never a nested executor inside `/agent-all`.

### 3a — Scoping (parallel)

**3a.0 (pre-dispatch checkpoint).** BEFORE dispatching any scoping subagent,
flush the in-flight scoping intent derived from the wave plan. A mid-3a context
death is now covered because the checkpoint exists before any subagent is even
dispatched. Do NOT include subagent outputs or transcript bodies in
`miniPlans` — only mini-plan metadata derived from the wave plan:
```javascript
import { join } from "node:path";
import { makeFileMirror } from "./lib/memory-bridge.mjs";
import { flushCheckpoint } from "./lib/memory-agent.mjs";
const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
const tasksInWave = wave.tasks;
await flushCheckpoint({
  cwd,
  runId,
  wave: i,
  iter: state.iter ?? 0,
  phase: "3a",
  inFlight: true,
  taskIds: tasksInWave.map((t) => t.id),
  miniPlans: tasksInWave.map((t) => ({
    taskId: t.id,
    title: t.title,
    files: t.files,
    role: t.role,
  })),
  requiredAgents: planned.orchestration?.requiredAgents ?? [],
  decisionsSoFar: state.decisions ?? {},
  fileMirror,
  config,
});
```

a. Dispatch one Task subagent per task in the wave with description `Implement Task N: <title>` and a prompt containing the mini-plan plus the mandatory Dispatch Prompt Contract below. Use `planned.orchestration.requiredAgents` to select or validate task roles (`frontend-dev`, `backend-dev`, `integration-dev`, or `dev`) when the plan left `role: dev` ambiguous. Do not duplicate the scoping addendum or verification directive; the `agent-policy-hook` PreToolUse hook (installed by `/agent-init`, Task matcher) injects those automatically.
b. Collect each return as a JSON payload between ` ```decision-payload ` fences. Parse with `lib/decisions/schema.mjs` `validateDecisionPayload`. If `result.ok === false`, treat as `NO_DECISIONS` and log a warning.

### 3b — Ask (sequential UI per task)

a. If `config.policy.decisionSurfacing === false`, skip 3b entirely and use empty answer map for all tasks.
b. Call `lib/decision-router.mjs` `routeWaveDecisions({ payloads, statePath, isTTY, askUser, runId })`.
   - `isTTY = process.stdout.isTTY && !flags.yes && iteration === 1`. Loop iteration > 1 forces non-TTY.
   - Each legacy decision payload is first normalized through `lib/interactions/schema.mjs` as `agent-interaction/v1` with kind `decision`.
   - `askUser` invokes `AskUserQuestion` with `renderer-claude.mjs` args. The returned index is mapped back through schema option IDs to the original decision option index.
   - Codex, Copilot, Cursor, and Gemini use `renderer-codex.mjs`, `renderer-copilot.mjs`, `renderer-cursor.mjs`, and `renderer-gemini.mjs` over the same interaction object.
c. Persist `state.decisions` and `state.interactions` to `.agent-all-state.json` after every individual answer (resumable). Append `.agent-skill/runs/<run-id>/interactions.jsonl` for every shown or auto-resolved interaction.
d. In non-TTY mode, auto-select only the recommended/default option when it is not high-risk. High-risk recommended/default options produce a blocked interaction, keep `chosen_index: null`, write the markdown review trail to `.agent-skill/runs/<run-id>/decisions.md`, and require a user/planner decision before implementation continues.

### 3c — Implementation (parallel re-dispatch)

a. For each task, build a fresh prompt: the original mini-plan PLUS the mandatory Dispatch Prompt Contract below PLUS a section `## User Decisions for This Task` listing `decision.title → chosen option label + description`.
b. Re-dispatch implementer subagent. PostToolUse hook validates `STATUS: DONE` came with `verification_passed` line.
c. After each implementer returns, the orchestrator MUST inspect the reported changed files and `git diff`, stage only task-owned pathspecs, create the task commit, and record the orchestrator-created commit SHA on that task. If the diff includes unreported or forbidden files, do not commit; re-dispatch or escalate.
d. Phase 4 (Gate) reviewer subagents likewise get the `Review Task N: <title>` description; PreToolUse hook injects the `VERIFICATION_AUDIT` directive; PostToolUse hook validates the token's presence.

4. Capture wave result: `{index: i, baseCommit, startCommit, endCommit, orchestration: planned.orchestration, costTelemetry: state.costTelemetry?.summary, tasks: [{id, status, changedFiles, commits, decisions: state.decisions[id]}], status: "completed"|"incomplete"}`. `commits` are orchestrator-created pathspec commits, not subagent self-commits. Derive `startCommit` and `endCommit` from the first and last entries in `wave.tasks[].commits`.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`. Then
   flush a completion marker checkpoint to supersede the in-flight 3a.0 pointer:
   ```javascript
   await flushCheckpoint({
     cwd,
     runId,
     wave: i,
     iter: state.iter ?? 0,
     phase: "3-complete",
     inFlight: false,
     miniPlans: [],
     taskIds: [],
     requiredAgents: [],
     fileMirror,
     config,
   });
   ```
   This overwrites `checkpoint/LATEST` with `inFlight:false`, so a `--resume`
   after this point does NOT re-enter 3a (the wave is complete).

## On error

- If a 3a scoping subagent returns invalid JSON or a payload that fails schema validation: treat as `NO_DECISIONS` for that task and log a warning to `state.warnings`.
- If a 3c implementer reports BLOCKED for >1 task in a wave: mark wave `incomplete`. Phase 4 will decide whether to retry or abort.
- If `planned.orchestration.blockedReasons` contains a repeated failure
  escalation or budget exceedance: do not dispatch another implementer. Stop
  the wave, write the orchestration state, and surface the planner/user
  decision requirement.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Dispatch Prompt Contract (mandatory)

Every 3a scoping and 3c implementation Task prompt MUST include:

- Working directory: the repository root where commands must run.
- Owned files or line ranges: the task's declared files, or an explicit note that no files were declared and the subagent must ask before broad edits.
- Forbidden files or areas: files owned by other active wave tasks plus any out-of-scope paths.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not edit outside the owned files without reporting the expansion.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: `STATUS`, changed files, verification evidence, blockers, and a concise `Self-Audit` covering requested scope, processed items, unprocessed items, shortcuts, and next action.
- Reusable references: task doc, plan path, relevant root guidance, and any files/functions/commands the orchestrator already identified.

Do not self-commit from an implementer subagent. The orchestrator owns pathspec commit review after it inspects changed files and verification evidence.

## Per-subagent verification (safety net)

Now enforced by the `agent-policy-hook` (Pre+Post on `Task`, installed by `/agent-init`). The hook auto-injects:

- For implementer dispatches (`description: "Implement Task ..."`): scoping-pass addendum + verification directive.
- For reviewer dispatches (`description: "Review Task ..."`): `VERIFICATION_AUDIT` directive.

PostToolUse validates each. A failing implementer (claims DONE without verification log) or failing reviewer (omits `VERIFICATION_AUDIT:` line) is rejected — the controller must re-dispatch with the hook's error message visible.

Implementer subagents are expected to invoke `superpowers:verification-before-completion` (running the project's test command from `.agent-all.json` `breakCondition`, falling back to the stack-detected default) before reporting `STATUS: DONE`. The PostToolUse hook's verification check is the safety net for cases where they don't.

If verification fails the implementer must report `STATUS: blocked, REASON: verification failed` with the failing output captured — not `DONE`. This is the "two-layer safety net" guarantee: implementer asserts + reviewer audits.

For projects that opt out via `.agent-all.json` `policy: { decisionSurfacing: false, verification: false, reviewerAudit: false }`, the corresponding hook routes become no-ops; phase 3 falls back to a single implementer dispatch with the mini-plan only.

For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes (typos, docs, config tweaks).

## Output to user

Print per wave:
```
Wave <i> — scoping <N>/<N>, ask <K>/<N>, implement <M>/<N>
```
Print decision summary in non-TTY mode:
```
[wave i] auto-resolved 5 decisions across 3 tasks → .agent-skill/runs/<run-id>/decisions.md + .agent-skill/runs/<run-id>/interactions.jsonl
```
