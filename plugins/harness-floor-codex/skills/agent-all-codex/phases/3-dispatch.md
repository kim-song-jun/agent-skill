# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `state.dispatch` (`"sequential"` for current Codex hooks, set in Phase 0)
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`
- `state.loop.failureSignatures`, `state.costUSD`, `state.costTelemetry`, and latest
  `state.orchestration` when resuming from a failing loop iteration

## Steps

1. Parse the plan file. Extract tasks matching `^### Task (\d+):\s*(.+)$`.
   For each task, collect file paths from `^- (?:Create|Modify):\s*\`([^\`]+)\``
   bullets and `role:` if present (default `dev`).

2. Build waves from `config.waves[waveSize]`:
   - `maxParallel` = wave size cap.
   - `rolesAllowed` filter; overflow tasks → "all-roles" wave at the end.
   - Each task must have a matching `.codex/skills/<role>/SKILL.md` —
     validate now; if missing role: abort `unknown role: <role>`.

3. For each wave:

   Capture `baseCommit` before implementation with `git rev-parse HEAD` so
   Phase 4 can include the first coordinator-created task commit in gate diffs.

   a. Build/update `state.orchestration` before dispatch. Use the same state
      shape as the Claude planner:
      `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,
      failureSignatures,blockedReasons,budget}`. Compute `requiredAgents`
      from changed files and failure state before choosing sequential role
      skills:
      - UI/frontend changes require `frontend-dev`, `design-reviewer`, and
        `qa-reviewer`.
      - migrations/fixtures/backfills require `data-reviewer`.
      - auth/API/security-sensitive files require `security-reviewer`.
      - repeated failure signatures at the configured threshold require a
        planner/user decision and must not dispatch another implementer.
      Write every dynamic sequential spawn to
      `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role, reason, wave,
      and cost estimate. Emit compatible `BeforeAgentSpawn` policy entries
      when the local policy writer is available. Include wave spawn count and
      same-role spawn count so policy can enforce per-wave caps and repeated
      role limits.
      Do not invoke the built-in `Workflow` tool inside `/agent-all-codex`;
      Workflow remains a sibling route that hands off through a task doc.
   b. Print: `Wave <i+1>/<N> — <waves[i].length> tasks (sequential dispatch)`.
   c. For each task in the wave (one at a time):
      - Build the sequential prompt with `lib/sequential-dispatch.mjs`; it MUST include the role skill body, task body, and mandatory Dispatch Prompt Contract below.
      - If the plan left `role: dev`, use `state.orchestration.requiredAgents`
        and the task's files to choose `frontend-dev`, `backend-dev`,
        `integration-dev`, or `dev`.
      - Any scoping decision, confirmation, budget warning, blocked state, or
        resume action must be normalized as `agent-interaction/v1`. Render it
        with the Codex interaction prompt renderer, persist the result under
        `state.interactions`, and append
        `.agent-skill/runs/<run-id>/interactions.jsonl`.
      - In non-TTY mode, auto-select only recommended low/medium-risk options.
        High-risk recommendations must pause/block rather than continue.
      - Read `.codex/skills/<task.role>/SKILL.md` and invoke its phases.
      - The role-skill performs the implementation and returns changed files,
        verification evidence, blockers, and final JSON. It must not commit.
      - The coordinator inspects the reported changed files and `git diff`,
        stages only task-owned pathspecs, creates the task commit, and records
        the coordinator-created commit SHA on that task. If the diff includes
        unreported or forbidden files, do not commit; re-dispatch or escalate.
   d. After all tasks finish, assemble the same `{agentId, status, changedFiles, commits, costUSD}`
      shape (agentId synthetic in fallback mode). `commits` are coordinator-created pathspec commits, not role-skill self-commits.

4. For each finished agent, record reported or estimated usage as
   `agent-cost-telemetry/v1`, append
   `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror the latest summary
   to `state.costTelemetry.summary`, and accumulate `state.costUSD` for
   backward compatibility. If
   `state.costUSD > config.defaults.maxCostUSD`: push
   `{phase: 3, status: "cost-cap"}`, abort.

5. Capture wave result:
   `{index: i, baseCommit, startCommit, endCommit, orchestration: state.orchestration, tasks: [...], status: "completed" | "incomplete", strategy: state.dispatch}`.
   Derive `startCommit` and `endCommit` from the first and last
   coordinator-created task commit SHAs recorded in `tasks[].commits`.

6. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- `sequential` strategy: if a role-skill returns non-zero: mark task
  `blocked`. If >1 task blocked in a wave: mark wave `incomplete`.
- If orchestration reports repeated failure or budget block, write state and
  surface planner/user decision instead of dispatching more implementers.
- `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> succeeded (strategy=<a>), ~$<wave.costUSD>`.

## Dispatch Prompt Contract (mandatory)

Every sequential `.codex/skills/<role>/SKILL.md` invocation MUST receive a prompt containing:

- Working directory: the repository root where `codex exec` commands must run.
- Owned files or line ranges: the task's declared files, or an explicit note that no files were declared and the role must ask before broad edits.
- Forbidden files or areas: files owned by other active tasks plus any path outside the task scope.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not edit outside the owned files without reporting the expansion.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: final JSON result, changed files, verification evidence, blockers, and a concise `Self-Audit` covering requested scope, processed items, unprocessed items, shortcuts, and next action.
- Reusable references: task doc, plan path, role skill path, relevant root guidance, and files/functions/commands the coordinator already identified.

Do not self-commit from a sequential role invocation. The coordinator owns pathspec commit review after it inspects changed files and verification evidence.

## Per-subagent verification (safety net for unattended runs)

Every dispatched subagent (via sequential `.codex/skills/<role>/SKILL.md` invocation) MUST receive the following directive in its prompt body:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
