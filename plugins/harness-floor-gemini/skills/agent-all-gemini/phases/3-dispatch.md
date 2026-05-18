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

3. For each wave:

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

   e. Accumulate `state.costUSD += sum(costUSD)`. If
      `state.costUSD > config.defaults.maxCostUSD`: push
      `{phase: 3, status: "cost-cap"}`, abort.

   f. Capture wave result:
      `{index: i, tasks: [...], status: "completed" | "incomplete", maxParallelUsed: actual}`.

4. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

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
