# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`

## Steps

1. Parse the plan file (via `read_file`). Extract tasks matching
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
   Do not invoke the built-in `Workflow` tool inside `/agent-all-copilot`;
   Workflow remains a sibling route that hands off through a task doc.

4. For each wave:
   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   b. For each task in the wave, call:
      ```
      task({
        prompt: "<task body: title, files, role, plan section>",
        context: { agentAllWave: i, agentAllTask: t.id, planKey: "agent-all/plan" },
      })
      ```
      If the plan left `role: dev`, use `state.orchestration.requiredAgents`
      to choose or validate the implementer role for that task.
      Capture each returned `agentId`.
   c. Wait for all `agentId`s in the wave to settle. Two strategies:
      - **Hook strategy** (preferred if `subagentStop` is registered): the
        hook writes per-agent completion to `store_memory` with key
        `agent-all/wave/<i>/agent/<agentId>`. Coordinator polls memory
        every 1s until all agents in the wave are present.
      - **Polling strategy** (fallback): call `list_agents()` every 2s and
        filter for agents whose `parentTask = "agent-all/wave/<i>/<t.id>"`.
        Wave done when all show `status: "completed" | "blocked" | "failed"`.
   d. For each finished agent, call `read_agent(agentId)` to extract
      `status`, `commits`, `cost`. Record reported or estimated usage as
      `agent-cost-telemetry/v1`, append
      `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror the latest
      summary to `state.costTelemetry.summary`, and accumulate `state.costUSD`
      for backward compatibility.
   e. Capture wave result:
      `{index: i, orchestration: state.orchestration, tasks: [{id, agentId, status, commits, costUSD}], status: "completed" | "incomplete"}`.

5. If `state.costUSD > config.defaults.maxCostUSD` after the wave: push
   `{phase: 3, status: "cost-cap"}`, abort.

6. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If `task` invocation errors immediately (rate-limit, etc.): retry once
  with exponential backoff, then mark the wave's task as `failed`.
- If `read_agent` returns `status: "blocked"` for >1 task in a wave: mark
  wave `incomplete`. Phase 4 decides.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> tasks succeeded, ~$<wave.costUSD>`.

## Per-subagent verification (safety net for unattended runs)

Every `task(...)` invocation's prompt body MUST include the following directive:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
