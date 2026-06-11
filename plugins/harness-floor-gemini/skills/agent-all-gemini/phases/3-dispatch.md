# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`
- `config.dispatch.subprocessTimeout` (default 1800)
- `config.dispatch.maxSubprocesses` (default 8)

## Steps

1. Parse the plan file (via `read_file`). Extract tasks matching
   `^### Task (\d+):\s*(.+)$`. For each task, collect file paths from
   `^- (?:Create|Modify):\s*\`([^\`]+)\`` bullets and `role:` if present.

2. Build waves from `config.waves[waveSize]`:
   - `maxParallel` = `min(wave.maxParallel, config.dispatch.maxSubprocesses)`.
   - `rolesAllowed` filter; overflow tasks → "all-roles" wave at end.

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
   Write every dynamic Gemini subprocess spawn to
   `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role, reason, wave, and
   cost estimate. Emit compatible `BeforeAgentSpawn` policy entries with wave
   spawn count and same-role spawn count when policy logging is available.
   Do not invoke the built-in `Workflow` tool inside `/agent-all-gemini`;
   Workflow remains a sibling route that hands off through a task doc.

4. For each wave:

   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel (subprocesses)`.

   b. For each task in the wave, spawn a subprocess via `run_shell_command`:
      ```
      run_shell_command(
        "gemini chat -p '<task body prompt>' \
          --output-json \
          --output-file '/tmp/agent-all/wave-<i>/task-<task.id>.json' \
          --skill-roster .gemini/skills/<role>/ \
	          --timeout <subprocessTimeout> &",
	        { background: true }
	      )
	      ```
      If the plan left `role: dev`, use `state.orchestration.requiredAgents`
      to choose or validate the skill roster role for that task.
      Each subprocess writes its result JSON to the output file when done.
      Capture each subprocess `pid`.

   c. Await all subprocesses in the wave:
      ```
      run_shell_command("wait <pid1> <pid2> ... <pidN>", { timeout: subprocessTimeout + 60 })
      ```
      OR (if `wait` not portable in Gemini's shell):
      ```
      run_shell_command("while :; do
        sleep 2
        finished=$(ls /tmp/agent-all/wave-<i>/*.json 2>/dev/null | wc -l)
        [ \"$finished\" -ge <N> ] && break
      done", { timeout: subprocessTimeout + 60 })
      ```

   d. For each task, `read_file('/tmp/agent-all/wave-<i>/task-<id>.json')`.
      Extract `{status, commits, costUSD, exitCode}`. If file missing
      (subprocess crashed): synthesize `{status: "failed", exitCode: -1}`.

   e. Record per-subprocess usage as `agent-cost-telemetry/v1`, append
      `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror the latest
      summary to `state.costTelemetry.summary`, and accumulate
      `state.costUSD += sum(costUSD)` for backward compatibility. If
      `state.costUSD > config.defaults.maxCostUSD`: push
      `{phase: 3, status: "cost-cap"}`, abort.

   f. Capture wave result:
      `{index: i, orchestration: state.orchestration, tasks: [...], status: "completed" | "incomplete", maxParallelUsed: actual}`.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- Subprocess timeout: kill via `kill <pid>`, mark task `failed`, continue wave.
- Output file unparseable: mark task `failed`, log raw stderr (read from
  `task-<id>.err`).
- If >1 task `failed` in a wave: mark wave `incomplete`. Phase 4 decides.
- `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> succeeded (parallel=<actual>), ~$<wave.costUSD>`.

## Per-subagent verification (safety net for unattended runs)

Every `gemini chat` subprocess's prompt MUST include the following directive:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
