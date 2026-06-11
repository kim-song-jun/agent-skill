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
   - Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   - For each task in the wave, **invoke `@agent-all-implementer`** with
     this task as a chat message body (task title, files, role, the plan
     section verbatim). Cursor's planner sees `agent-all-implementer`
     has `is_background: true` and runs them concurrently.
   - If the plan left `role: dev`, use `state.orchestration.requiredAgents`
     to choose or validate the implementer role for that task.
   - Wait for all background invocations to settle.
   - Capture wave result:
     `{index: i, orchestration: state.orchestration, tasks: [{id, status, commits}], status: "completed" | "incomplete"}`.

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

## Per-subagent verification (safety net for unattended runs)

Every `@agent-all-implementer` invocation's chat body MUST include the following directive:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
