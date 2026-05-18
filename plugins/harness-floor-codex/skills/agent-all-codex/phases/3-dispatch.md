# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `state.dispatch` (`"agent-hook"` or `"sequential"`, set in Phase 0)
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`

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

   ### Strategy A — `dispatch === "agent-hook"`

   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel (agent-hook)`.
   b. For each task in the wave, dispatch via the `agent` hook:
      ```
      shell_command("codex agent dispatch \
        --role '<task.role>' \
        --skill '.codex/skills/<task.role>/SKILL.md' \
        --task-id 'agent-all/wave/<i>/<task.id>' \
        --body '<task body JSON>'")
      ```
      The `agent` hook registered in `~/.codex/config.toml` handles the
      actual subagent spawn. Capture each dispatch's `agentId` from stdout.
   c. Await all wave agents via the hook's completion event:
      ```
      shell_command("codex agent wait --task-prefix 'agent-all/wave/<i>/' --timeout 1800")
      ```
      The wait command blocks until all matching dispatches finish.
      Returns a JSON array of `{agentId, status, commits, costUSD}`.

   ### Strategy B — `dispatch === "sequential"`

   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks (sequential fallback)`.
   b. For each task in the wave (one at a time):
      - Read `.codex/skills/<task.role>/SKILL.md` and invoke its phases.
      - The role-skill performs the implementation, returns commits.
   c. After all tasks finish, assemble the same `{agentId, status, commits, costUSD}`
      shape (agentId synthetic in fallback mode).

4. For each finished agent, accumulate `state.costUSD += costUSD`. If
   `state.costUSD > config.defaults.maxCostUSD`: push
   `{phase: 3, status: "cost-cap"}`, abort.

5. Capture wave result:
   `{index: i, tasks: [...], status: "completed" | "incomplete", strategy: state.dispatch}`.

6. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- `agent-hook` strategy: if dispatch fails (hook crash, etc.): retry once.
  If still failing, fall back to sequential for this wave only (warn user).
- `sequential` strategy: if a role-skill returns non-zero: mark task
  `blocked`. If >1 task blocked in a wave: mark wave `incomplete`.
- `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> succeeded (strategy=<a>), ~$<wave.costUSD>`.

## Per-subagent verification (safety net for unattended runs)

Every dispatched subagent (via `codex agent dispatch` OR sequential `.codex/skills/<role>/SKILL.md` invocation) MUST receive the following directive in its prompt body:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
