# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`

## Steps

1. Parse the plan file. Extract tasks by matching `^### Task (\d+):\s*(.+)$`.
   For each task, collect file paths from `^- (?:Create|Modify):\s*\`([^\`]+)\``
   bullets and `role:` if present.

2. Build waves from `config.waves[waveSize]`:
   - `maxParallel` = wave size cap (default 4 for medium).
   - `rolesAllowed` = filter; tasks whose role is not in this list go in a
     separate "all-roles" overflow wave at the end.
   - Pack tasks greedily into waves of size `maxParallel`.

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
   Write every dynamic Cursor background spawn to
   `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role, reason, wave, and
   cost estimate. Emit compatible `BeforeAgentSpawn` policy entries with wave
   spawn count and same-role spawn count when policy logging is available.
   Do not invoke the built-in `Workflow` tool inside `/agent-all-cursor`;
   Workflow remains a sibling route that hands off through a task doc.

4. For each wave:
   - Capture `baseCommit` before any implementer dispatch:
     `git rev-parse HEAD`. Store on the wave record so Phase 4 can diff
     from the pre-wave state.
   - Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   - For each task in the wave, **invoke `@agent-all-implementer`** with
     this task as a chat message body (task title, files, role, the plan
     section verbatim). Cursor's planner sees `agent-all-implementer`
     has `is_background: true` and runs them concurrently.
   - If the plan left `role: dev`, use `state.orchestration.requiredAgents`
     to choose or validate the implementer role for that task.
   - Wait for all background invocations to settle.
   - After each `@agent-all-implementer` settles, the coordinator MUST inspect
     the reported changed files and `git diff`, stage ONLY task-owned pathspecs,
     create the task commit, and record the orchestrator-created commit SHA on
     that task. Implementer subagents are explicitly forbidden from self-committing
     or staging broad changes. If the diff includes unreported or forbidden files,
     do not commit; re-dispatch or escalate. Commits recorded in `tasks[].commits`
     are coordinator-created pathspec commits — not subagent self-commits.
   - Capture wave result:
     `{index: i, baseCommit, startCommit, endCommit, orchestration: state.orchestration, tasks: [{id, status, changedFiles, commits}], status: "completed" | "incomplete"}`.
     Derive `startCommit` and `endCommit` from the first and last
     coordinator-created commit SHAs in `tasks[].commits`.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If a wave's implementer reports BLOCKED for >1 task: mark wave
  `incomplete`. Phase 4 decides whether to retry or abort.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> tasks succeeded`.

## Shell helpers

```bash
# Re-parse the plan to get the canonical task list (step 1).
node .cursor/agent-all/lib/plan-parser.mjs <plan.path>

# Persist wave results after each wave (step 4).
node .cursor/agent-all/lib/state-rw.mjs read  .agent-all-state.json
# ... mutate the parsed JSON in memory ...
node .cursor/agent-all/lib/state-rw.mjs write .agent-all-state.json '<mutated-json>'
```

Wave construction (step 2) stays inline — greedy bin-packing by
file-overlap conflict is short enough to compute in the coordinator's
working memory. Pseudocode:

```
waves = []
remaining = tasks.filter(t => rolesAllowed.includes(t.role) || t.role == null)
while remaining:
  wave = []
  used = new Set()  // files claimed by tasks already in this wave
  for t in remaining:
    if wave.length >= maxParallel: break
    if t.files.some(f => used.has(f)): continue  // file conflict, defer
    wave.push(t); for f of t.files: used.add(f)
  waves.push(wave); remaining = remaining.filter(t => !wave.includes(t))
```

## Dispatch Prompt Contract (mandatory)

Every `@agent-all-implementer` chat message body MUST include:

- Working directory: the repository root where commands must run.
- Owned files or line ranges: the task's declared files, or an explicit note
  that no files were declared and the subagent must ask before broad edits.
- Forbidden files or areas: files owned by other active wave tasks plus any
  out-of-scope paths.
- DO NOT:
  - Do not run destructive commands, force-push, or reset shared state.
  - Do not edit outside the owned files without reporting the expansion.
  - Do not stage broad changes or self-commit.
  - Do not revert unrelated user or other-agent edits.
- Expected output: `STATUS`, changed files, verification evidence, blockers,
  and a concise `Self-Audit` covering requested scope, processed items,
  unprocessed items, shortcuts, and next action.
- Reusable references: task doc, plan path, relevant root guidance, and any
  files/functions/commands the coordinator already identified.

Do not self-commit from an implementer subagent. The coordinator owns pathspec
commit review after it inspects changed files and verification evidence.

## Per-subagent verification (safety net for unattended runs)

Every `@agent-all-implementer` invocation's chat body MUST include the following directive:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
