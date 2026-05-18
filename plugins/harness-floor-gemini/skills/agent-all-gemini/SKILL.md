---
name: agent-all-gemini
description: >
  Gemini CLI port of /agent-all (intent → plan → wave-dispatch → gate → PR).
  Subprocess-based dispatch — Gemini has no native subagent primitive, so
  Phase 3 forks N parallel `gemini chat` subprocesses per wave task.
  See plugins/harness-floor/skills/agent-all/SKILL.md for the source-of-truth pipeline.
---

# /agent-all (Gemini port)

Runs the cost-unrestricted multi-agent pipeline using Gemini CLI
primitives. Phase 3 dispatch is **subprocess-based**: each wave task
spawns its own `gemini chat` subprocess via `run_shell_command`, all
in parallel. The coordinator awaits via process exit + output file
parsing.

## Usage

```
/agent-all-gemini "add user signup form"
/agent-all-gemini docs/tasks/12-fix-login.md
/agent-all-gemini "fix flaky test" --loop --max-iter=5
/agent-all-gemini docs/tasks/x.md --no-pr --wave-size=large
```

## Flags

Same as Claude Code: `--loop`, `--max-iter=<N>`, `--max-cost=<USD>`,
`--wave-size=small|medium|large`, `--no-pr`, `--no-brainstorm`,
`--resume`, `--force`, `--yes`,
`--break-condition=<spec>`, `--reconfigure`.

When `--loop` is set, Phase 0 prompts the user interactively (via Gemini's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Custom shell / Composite) and offers to save the choice to
`.agent-all.json`. Use `--break-condition=<spec>` to skip the prompt for
one invocation, or `--reconfigure` to re-prompt even when a non-default
value already lives in config.

Additional Gemini-specific:
- `--subprocess-timeout=<seconds>` — per-task subprocess timeout (default 1800).
- `--max-subprocesses=<N>` — additional clamp on wave maxParallel (default 8).

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git + .gemini/settings.json + subprocess sanity + config |
| 1 | `phases/1-intent.md` | brainstorm (chat) OR load task file |
| 2 | `phases/2-plan.md` | draft plan via `write_file` |
| 3 | `phases/3-dispatch.md` | fork N parallel `gemini chat` subprocesses per wave |
| 4 | `phases/4-gate.md` | spawn reviewer subprocesses (same pattern) |
| 5 | `phases/5-pr.md` | `run_shell_command`: git branch push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Atomic write via `write_file` (write to .tmp then `run_shell_command` rename).
3. **Delegate, don't reimplement.** Phase 3 spawns subprocesses; Phase 4 same; Phase 5 uses `run_shell_command`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Hard caps:** `--max-iter` clamped to 50; `--max-cost` enforced by reading per-subprocess token logs (best-effort).

## Gemini primitive map

| Action | Gemini primitive |
|---|---|
| Read file | `read_file` |
| Write file | `write_file` |
| Shell | `run_shell_command` |
| Dispatch subagent | spawn `gemini chat -p "<prompt>" --output-json` subprocess |
| Await dispatched agent | subprocess `exit` + read its stdout JSON |
| Persist plan/state | `write_file` + atomic rename via `run_shell_command` |
| Prompt user | `ask_user` |
| Invoke another skill in same process | `activate_skill` |

## On error

Same as Claude port. Additional Gemini-specific notes:
- If `gemini` not in PATH: abort `gemini binary required for subprocess dispatch`.
- If subprocess times out (per `--subprocess-timeout`): kill it, mark task `failed`, continue wave.
- If `--max-subprocesses` reached: queue extra tasks, dispatch as slots free.
- If `write_file` fails (disk full, permissions): abort `state persistence failed`.

## When done

Print summary: phases completed, iters, cost, PR URL, max parallel subprocesses
used. Exit 0/1/2/3 per spec.

## References

- `references/porting-notes.md` — subprocess strategy rationale, alternatives considered
- `plugins/harness-floor/skills/agent-all/SKILL.md` — source-of-truth pipeline
