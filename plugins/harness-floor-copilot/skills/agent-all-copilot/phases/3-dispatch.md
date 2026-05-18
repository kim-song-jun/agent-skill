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

3. For each wave:
   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   b. For each task in the wave, call:
      ```
      task({
        prompt: "<task body: title, files, role, plan section>",
        context: { agentAllWave: i, agentAllTask: t.id, planKey: "agent-all/plan" },
      })
      ```
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
      `status`, `commits`, `cost`. Accumulate `state.costUSD`.
   e. Capture wave result:
      `{index: i, tasks: [{id, agentId, status, commits, costUSD}], status: "completed" | "incomplete"}`.

4. If `state.costUSD > config.defaults.maxCostUSD` after the wave: push
   `{phase: 3, status: "cost-cap"}`, abort.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If `task` invocation errors immediately (rate-limit, etc.): retry once
  with exponential backoff, then mark the wave's task as `failed`.
- If `read_agent` returns `status: "blocked"` for >1 task in a wave: mark
  wave `incomplete`. Phase 4 decides.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> tasks succeeded, ~$<wave.costUSD>`.
