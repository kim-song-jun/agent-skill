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

3. For each wave:
   - Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   - For each task in the wave, **invoke `@agent-all-implementer`** with
     this task as a chat message body (task title, files, role, the plan
     section verbatim). Cursor's planner sees `agent-all-implementer`
     has `is_background: true` and runs them concurrently.
   - Wait for all background invocations to settle.
   - Capture wave result:
     `{index: i, tasks: [{id, status, commits}], status: "completed" | "incomplete"}`.

4. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

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
