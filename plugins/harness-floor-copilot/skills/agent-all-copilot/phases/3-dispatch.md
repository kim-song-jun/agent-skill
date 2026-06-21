# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`

## Steps

1. Parse the plan file (via `view`). Extract tasks matching
   `^### Task (\d+):\s*(.+)$`. For each task, collect file paths from
   `^- (?:Create|Modify):\s*\`([^\`]+)\`` bullets and `role:` if present.

2. Build waves from `config.waves[waveSize]`:
   - `maxParallel` = wave size cap.
   - `rolesAllowed` filter; overflow tasks go in a separate "all-roles"
     wave at the end.

3. Before dispatching each wave, build/update `state.orchestration` with the
   same state shape as the Claude planner:
   `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,
   failureSignatures,blockedReasons,budget}`. Compute `requiredAgents` from
   changed files and failure state:
   - UI/frontend changes require `frontend-dev`, `design-reviewer`, and
     `qa-reviewer`.
   - migrations/fixtures/backfills require `data-reviewer`.
   - auth/API/security-sensitive files require `security-reviewer`.
   - repeated failure signatures at the configured threshold require a
     planner/user decision and must not dispatch another implementer.
   Write every dynamic Copilot `task` spawn to
   `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role, reason, wave, and
   cost estimate. Emit compatible `BeforeAgentSpawn` policy entries with wave
   spawn count and same-role spawn count when policy logging is available.
   Do not invoke the built-in `Workflow` tool inside `/agent-all`;
   Workflow remains a sibling route that hands off through a task doc.

4. For each wave:

   If `state.resumeCheckpoint` is set and `state.resumeCheckpoint.wave === i`,
   re-enter this wave at step 3a.0 using `state.resumeCheckpoint.miniPlans`
   instead of re-parsing the plan; this covers the mid-wave death scenario
   where dispatched `task`s never returned.

   **3a.0 (pre-dispatch checkpoint).** BEFORE invoking any implementation
   `task` for this wave, flush the in-flight scoping intent derived from the
   wave plan so a mid-wave context death is recoverable. Do NOT include task
   outputs or transcript bodies — only mini-plan metadata from the wave plan:
   ```javascript
   import { join } from "node:path";
   import { makeFileMirror } from "./lib/memory-bridge.mjs";
   import { flushCheckpoint } from "./lib/memory-agent.mjs";
   const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
   const tasksInWave = waves[i];
   await flushCheckpoint({
     cwd, runId, wave: i, iter: state.iter ?? 0, phase: "3a", inFlight: true,
     taskIds: tasksInWave.map((t) => t.id),
     miniPlans: tasksInWave.map((t) => ({ taskId: t.id, title: t.title, files: t.files, role: t.role })),
     requiredAgents: state.orchestration?.requiredAgents ?? [],
     decisionsSoFar: state.decisions ?? {},
     fileMirror, config,
   });
   ```
   (The `flushCheckpoint`/`makeFileMirror` module calls are real pure-JS behavior
   proven by module tests; the live wave-death/resume on a running Copilot CLI is
   #27-unverified until the Copilot CLI spike.)

   a. **Capture `baseCommit` before implementation:**
      ```bash
      git rev-parse HEAD
      ```
      Store as `wave.baseCommit`. Phase 4 uses this as the diff base to
      include the first orchestrator-created task commit in gate diffs.
   b. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   c. For each task in the wave, build the prompt with the mandatory Dispatch
      Prompt Contract below (including the commit-ownership directive), then call:
      ```
      task({
        prompt: "<task body: title, files, role, plan section + Dispatch Prompt Contract>",
        context: { agentAllWave: i, agentAllTask: t.id, planPath: state.plan.path },
      })
      ```
      If the plan left `role: dev`, use `state.orchestration.requiredAgents`
      to choose or validate the implementer role for that task.
      Capture the returned task handle if the host provides one; otherwise
      rely on the task's final response text. Prompts must include a stable
      agent name such as `agent-all-wave-<i>-task-<id>` so optional
      `subagentStop` hooks can correlate lifecycle events by `agentName`.
   d. Wait for every task invocation to finish through the host's `task`
      result. If the optional `subagentStop` helper is installed, also tail
      `.copilot/agent-all/inbox.jsonl` for records with
      `{agentName, sessionId, transcriptPath, stopReason}` and attach the
      lifecycle evidence to the wave record. The hook does not provide
      implementation output, so do not invent `read_agent` or `list_agents`
      polling.
   e. **Orchestrator-owned commit (mandatory).** After each implementation
      `task` returns, the orchestrator (not the subagent) MUST:
      1. Inspect the reported changed files and run `git diff` to see all
         unstaged/staged changes.
      2. Stage only task-owned pathspecs:
         `git add -- <task.files…>`.
      3. Create the task commit:
         `git commit -m "<task title>" -- <task.files…>`.
      4. Record the orchestrator-created commit SHA on that task record.
      If `git diff` reveals unreported or forbidden files (owned by other
      active tasks or outside the task's declared scope), do **not** commit;
      re-dispatch the task with the conflict described, or escalate to the
      user. Subagent implementation `task`s are explicitly forbidden from
      self-committing or staging broad changes — the commit-ownership
      directive in the Dispatch Prompt Contract below enforces this.
      `commits` on the wave record are orchestrator-created pathspec commits,
      not subagent self-commits.
   f. For each finished task, parse the final response contract
      (`STATUS`, changed files, verification evidence, blockers) and attach
      any matching hook lifecycle record. Record reported or estimated usage as
      `agent-cost-telemetry/v1`, append
      `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror the latest
      summary to `state.costTelemetry.summary`, and accumulate `state.costUSD`
      for backward compatibility.
   g. Capture wave result:
      `{index: i, baseCommit, startCommit, endCommit, orchestration: state.orchestration, tasks: [{id, agentName, status, changedFiles, commits, costUSD}], status: "completed" | "incomplete"}`.
      Derive `startCommit` and `endCommit` from the first and last
      orchestrator-created commit SHAs recorded in `tasks[].commits`.

5. If `state.costUSD > config.defaults.maxCostUSD` after the wave: push
   `{phase: 3, status: "cost-cap"}`, abort.

6. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`. Then
   flush a completion marker checkpoint to supersede the in-flight 3a.0 pointer:
   ```javascript
   await flushCheckpoint({
     cwd, runId, wave: i, iter: state.iter ?? 0,
     phase: "3-complete", inFlight: false,
     miniPlans: [], taskIds: [], requiredAgents: [],
     fileMirror, config,
   });
   ```
   This overwrites `checkpoint/LATEST` with `inFlight:false`, so a `--resume`
   after this point does NOT re-enter the wave.

## On error

- If `task` invocation errors immediately (rate-limit, etc.): retry once
  with exponential backoff, then mark the wave's task as `failed`.
- If >1 task reports `STATUS: blocked` in a wave: mark wave `incomplete`.
  Phase 4 decides.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> tasks succeeded, ~$<wave.costUSD>`.

## Dispatch Prompt Contract (mandatory)

Every implementation `task(...)` invocation's prompt MUST include:

- Working directory: the repository root where commands must run.
- Owned files or line ranges: the task's declared files, or an explicit note
  that no files were declared and the subagent must ask before broad edits.
- Forbidden files or areas: files owned by other active wave tasks plus any
  out-of-scope paths.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not edit outside the owned files without reporting the expansion.
  - Do not stage broad changes or self-commit. The orchestrator owns all
    `git add` and `git commit` operations after inspecting your changed files.
  - Do not revert unrelated user or other-agent edits.
- Expected output: `STATUS`, changed files list, verification evidence,
  blockers, and a concise `Self-Audit` covering requested scope, processed
  items, unprocessed items, shortcuts, and next action.
- Reusable references: task doc, plan path, relevant root guidance, and any
  files/functions/commands the orchestrator already identified.

Do not self-commit from an implementation subagent. The orchestrator owns
pathspec commit review after it inspects changed files and verification
evidence.

## Per-subagent verification (safety net for unattended runs)

Every `task(...)` invocation's prompt body MUST include the following directive:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
