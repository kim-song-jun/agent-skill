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

   Capture `baseCommit` before any subprocess is spawned:
   `run_shell_command("git rev-parse HEAD")` → store as `wave.baseCommit`.
   Phase 4 uses this to compute the gate diff including the first
   coordinator-created task commit.

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
      Extract `{status, changedFiles, costUSD, exitCode}`. If file missing
      (subprocess crashed): synthesize `{status: "failed", exitCode: -1}`.

   e. **Orchestrator-owned commit (E3).** After reading each subprocess result,
      the coordinator MUST:
      - Inspect `changedFiles` reported by the subprocess and run
        `run_shell_command("git diff --name-only")` to see the actual diff.
      - Stage ONLY task-owned pathspecs:
        `run_shell_command("git add -- <task-owned-pathspecs>")`.
      - If the diff includes unreported or forbidden files (files outside the
        task's declared ownership), do NOT commit; re-dispatch the subprocess
        with a scoping error or escalate to the user.
      - Create the task commit:
        `run_shell_command("git commit -m 'Task <id>: <title>' -- <task-owned-pathspecs>")`.
      - Record the coordinator-created commit SHA on that task:
        `run_shell_command("git rev-parse HEAD")` → `task.commits = [sha]`.
      Implementer subprocesses are explicitly forbidden from self-committing or
      staging broad changes. `commits` in the wave record are coordinator-created
      pathspec commits only, never subprocess self-commits.

   f. Record per-subprocess usage as `agent-cost-telemetry/v1`, append
      `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, mirror the latest
      summary to `state.costTelemetry.summary`, and accumulate
      `state.costUSD += sum(costUSD)` for backward compatibility. If
      `state.costUSD > config.defaults.maxCostUSD`: push
      `{phase: 3, status: "cost-cap"}`, abort.

   g. Capture wave result:
      `{index: i, baseCommit, startCommit, endCommit, orchestration: state.orchestration, tasks: [...], status: "completed" | "incomplete", maxParallelUsed: actual}`.
      `commits` are coordinator-created pathspec commits (step e), not subprocess
      self-commits. Derive `startCommit` and `endCommit` from the first and last
      coordinator-created commit SHAs in `tasks[].commits`.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- Subprocess timeout: kill via `kill <pid>`, mark task `failed`, continue wave.
- Output file unparseable: mark task `failed`, log raw stderr (read from
  `task-<id>.err`).
- If >1 task `failed` in a wave: mark wave `incomplete`. Phase 4 decides.
- `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output

Print one line per wave: `Wave <i>: <completed>/<total> succeeded (parallel=<actual>), ~$<wave.costUSD>`.

## Dispatch Prompt Contract (mandatory)

Every `gemini chat` subprocess's prompt MUST include:

- Working directory: the repository root where commands must run.
- Owned files or line ranges: the task's declared files, or an explicit note
  that no files were declared and the subprocess must ask before broad edits.
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

Do not self-commit from an implementer subprocess. The coordinator owns
pathspec commit review after it inspects changed files and verification
evidence (step 4e above).

## Per-subagent verification (safety net for unattended runs)

Every `gemini chat` subprocess's prompt MUST include the following directive:

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion` to run the project's test command (from `.agent-all.json` `breakCondition`, falling back to the stack-detected default). Do not mark a task complete if verification fails — report `STATUS: blocked, REASON: verification failed` instead, with the failing output captured.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke `superpowers:test-driven-development` to write tests before implementation. This is recommended, not strictly enforced — judgment calls allowed for trivial changes.

This is the safety net that makes `--loop` runs safe to leave unattended.
