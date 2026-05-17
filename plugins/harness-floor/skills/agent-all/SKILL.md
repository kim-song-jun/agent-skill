---
name: agent-all
description: Cost-unrestricted multi-agent pipeline. Drives intent→plan→wave-dispatch→gate→PR over the .claude/agents/ roster, with optional --loop until a shell break-condition succeeds (bounded by --max-iter and --max-cost). Requires /agent-init scaffolding.
---

# /agent-all

Runs a complete multi-agent pipeline from a free-form prompt or an existing task file. Phase 3 fan-out delegates to `superpowers:subagent-driven-development`. Phase 6 optionally loops the entire run.

## Usage

```
/agent-all "add user signup form"
/agent-all docs/tasks/12-fix-login.md
/agent-all "fix flaky test" --loop --max-iter=5
/agent-all docs/tasks/x.md --no-pr --wave-size=large
```

## Flags

- `--loop` — enable Phase 6 looping.
- `--max-iter=<N>` — cap loop iterations (default from config, hard cap 50).
- `--max-cost=<USD>` — cap accumulated cost.
- `--wave-size=small|medium|large` — override config default.
- `--no-pr` — skip Phase 5 (PR creation).
- `--no-brainstorm` — skip Phase 1's brainstorming for free-form prompts.
- `--resume` — skip phases already complete per `.agent-all-state.json`.
- `--force` — wipe state and restart.
- `--yes` — skip interactive confirms.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git+roster+config+input checks |
| 1 | `phases/1-intent.md` | brainstorming OR load task file |
| 2 | `phases/2-plan.md` | writing-plans for the task |
| 3 | `phases/3-dispatch.md` | wave-builder + subagent-driven-development |
| 4 | `phases/4-gate.md` | wave-level spec+quality reviews |
| 5 | `phases/5-pr.md` | branch push + gh pr create |
| 6 | `phases/6-loop.md` | breakCondition + stableIters + maxIter/Cost |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Shape: `{phases:[{phase,completedAt}], task, plan, waves[], iter, costUSD, prUrl}`. `--resume` resumes after `max(phases[*].phase)`.
3. **Delegate, don't reimplement.** Phase 1 calls `superpowers:brainstorming`; Phase 2 calls `superpowers:writing-plans`; Phase 3 calls `superpowers:subagent-driven-development`. Your code is a thin coordinator.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Hard caps:** `--max-iter` clamped to 50 server-side; `--max-cost` enforced after each wave.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`. Returns built-in `DEFAULTS` when path missing.
- `lib/wave-builder.mjs` — `buildWaves(tasks, waveConfig)` → array of waves.
- `lib/loop-evaluator.mjs` — `evaluateLoop(state, limits, runner)` → `{action: "break"|"continue"|"exhausted", consecutivePass?, exitCode?}`.

## On error

- Dirty git tree → abort.
- `.claude/agents/` missing → abort + suggest `/agent-init`.
- `.agent-all.json` missing → warn + use built-ins.
- writing-plans fails → abort.
- Wave task BLOCKED 3× → Phase 3 abort with exit code 2.
- `--max-cost` exceeded → finish current wave, abort, preserve state.
- Loop maxIter exhausted → exit code 3, last commit preserved.

## When done

Print summary: phases completed, iters, cost, PR URL. Exit code 0/1/2/3 per spec.
