---
name: agent-all
description: >
  Use when a Gemini CLI project needs a full feature, bugfix, or task run from
  intent through planning, subprocess role execution, review, verification, and
  optional PR creation.
---

# /agent-all (Gemini port)

Runs the cost-unrestricted multi-agent pipeline using Gemini CLI
primitives. Phase 3 dispatch is **subprocess-based**: each wave task
spawns through `bin/spawn-wave.mjs`, which invokes Gemini CLI as
`gemini -p "<prompt>" --output-format json --skip-trust`. The coordinator
awaits via process exit + wrapper-written output files.

## Usage

```
/agent-all "add user signup form"
/agent-all .agent-skill/tasks/12-fix-login.md
/agent-all "fix flaky test" --loop --max-iter=5
/agent-all .agent-skill/tasks/x.md --no-pr --wave-size=large
/agent-handoff .agent-skill/tasks/x.md --strict
```

## Flags

Same as Claude Code: `--loop`, `--max-iter=<N>`, `--max-cost=<USD>`,
`--max-runtime-sec=<seconds>`, `--wave-size=small|medium|large`, `--no-pr`, `--no-brainstorm`,
`--resume`, `--force`, `--yes`,
`--break-condition=<spec>`, `--reconfigure`, `--qa`.

`--resume` checks for `/agent-handoff` sibling artifacts
(`.agent-skill/tasks/<NN>-<slug>.handoff.md` and `.session.md`) and uses their
metadata to surface the recommended next action. In non-TTY mode the
recommended action is auto-selected and logged to
`.agent-skill/runs/handoff-audit.jsonl` plus the shared
`.agent-skill/runs/handoff/interactions.jsonl`.

> **Port note:** the `/agent-handoff` skill is not bundled on the Gemini port
> (this plugin ships only `agent-all-gemini` and `visual-qa-gemini`). On Gemini,
> `--resume` only surfaces handoff metadata when the `.handoff.md`/`.session.md`
> siblings were produced elsewhere (e.g. by another port's `/agent-handoff`);
> with no such artifacts it simply resumes from `.agent-all-state.json`.

`--qa` is the one-flag shortcut for end-to-end verification: equivalent
to `--break-condition='{"type":"composite","steps":[{"type":"test-auto"},
{"type":"visual-qa","mode":"comprehensive"}]}'`. Tests run as a cheap gate;
visual-qa (comprehensive mode) runs as the final E2E check. Auto-scaffolds
`.visual-qa.json` with sane defaults if missing.

When `--loop` is set, Phase 0 prompts the user interactively (via Gemini's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Verification adapter / Custom shell / Composite) and offers to save the choice to
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
| 3 | `phases/3-dispatch.md` | fork N parallel headless `gemini -p` subprocesses per wave |
| 4 | `phases/4-gate.md` | spawn reviewer subprocesses (same pattern) |
| 5 | `phases/5-pr.md` | `run_shell_command`: git branch push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Atomic write via `write_file` (write to .tmp then `run_shell_command` rename). Mirror the latest `agent-cost-telemetry/v1` summary to `state.costTelemetry.summary` and keep `state.costUSD` as the backward-compatible total.
3. **Delegate, don't reimplement.** Phase 3 spawns subprocesses; Phase 4 same; Phase 5 uses `run_shell_command`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Loop stops:** completion is break-condition driven. `--max-iter=0` or
   `loop.maxIter: null` enables unlimited iterations, while cost/runtime
   budgets, hard policy hooks, user interruption, and repeated failure signatures can still
   stop the loop. Cost enforcement reads per-subprocess token logs best-effort
   through `agent-cost-telemetry/v1`.
6. **Policy events use the shared schema.** Gemini has no hard hook for this
   workflow; emit the same `agent-policy-event/v1` results as soft warnings
   and append `.agent-skill/runs/<run-id>/policy-log.jsonl` when possible.
   Cost usage appends `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`.
7. **Interactions use the shared UX schema.** Render
   `agent-interaction/v1` decision/confirmation/resume prompts through the
   Gemini markdown renderer, persist choices in `.agent-all-state.json`, and
   append `.agent-skill/runs/<run-id>/interactions.jsonl` when possible.
   Non-TTY may auto-select recommended low/medium-risk options only; high-risk
   options pause or block.

## Gemini primitive map

| Action | Gemini primitive |
|---|---|
| Read file | `read_file` |
| Write file | `write_file` |
| Shell | `run_shell_command` |
| Dispatch subagent | spawn `gemini -p "<prompt>" --output-format json` subprocess through the wrapper |
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
