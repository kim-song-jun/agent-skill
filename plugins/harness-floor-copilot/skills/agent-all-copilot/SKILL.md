---
name: agent-all-copilot
description: >
  GitHub Copilot CLI port of /agent-all (intent → plan → wave-dispatch → gate → PR).
  Uses Copilot's `task` tool for parallel wave dispatch and `store_memory`
  (scope=repository) for plan persistence. See plugins/harness-floor/skills/agent-all/SKILL.md
  for the source-of-truth pipeline.
---

# /agent-all (Copilot port)

Runs the cost-unrestricted multi-agent pipeline using Copilot CLI
primitives. Phase 3 fan-out dispatches one `task` per wave task and
awaits via Copilot's `subagentStop` hook (or polls `list_agents`).

## Usage

```
/agent-all-copilot "add user signup form"
/agent-all-copilot .agent-skill/tasks/12-fix-login.md
/agent-all-copilot "fix flaky test" --loop --max-iter=5
/agent-all-copilot .agent-skill/tasks/x.md --no-pr --wave-size=large
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

`--qa` is the one-flag shortcut for end-to-end verification: equivalent
to `--break-condition='{"type":"composite","steps":[{"type":"test-auto"},
{"type":"visual-qa","mode":"comprehensive"}]}'`. Tests run as a cheap gate;
visual-qa (comprehensive mode) runs as the final E2E check. Auto-scaffolds
`.visual-qa.json` with sane defaults if missing.

When `--loop` is set, Phase 0 prompts the user interactively (via Copilot's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Verification adapter / Custom shell / Composite) and offers to save the choice to
`.agent-all.json`. Use `--break-condition=<spec>` to skip the prompt for
one invocation, or `--reconfigure` to re-prompt even when a non-default
value already lives in config.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git + .copilot/agents + config + input checks |
| 1 | `phases/1-intent.md` | brainstorm (chat) OR load task file; persist via store_memory |
| 2 | `phases/2-plan.md` | draft plan into store_memory (key=`agent-all/plan`) + file |
| 3 | `phases/3-dispatch.md` | fan out parallel `task` invocations per wave |
| 4 | `phases/4-gate.md` | dispatch reviewer `task`s for spec + quality |
| 5 | `phases/5-pr.md` | `read_bash`: git branch push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in two places.** `.agent-all-state.json` for cross-session resume; `store_memory` scope=repository for in-session dispatch coordination. Mirror the latest `agent-cost-telemetry/v1` summary to `state.costTelemetry.summary` and keep `state.costUSD` as the backward-compatible total.
3. **Delegate, don't reimplement.** Phase 3 uses `task`; Phase 4 uses `task`; Phase 5 uses `read_bash`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Loop stops:** completion is break-condition driven. `--max-iter=0` or
   `loop.maxIter: null` enables unlimited iterations, while cost/runtime
   budgets, hard policy hooks, user interruption, and repeated failure signatures can still
   stop the loop. Cost enforcement reads Copilot's per-session cost field if
   exposed via `list_agents`, else best-effort estimates through
   `agent-cost-telemetry/v1`.
6. **Policy events use the shared schema.** Copilot surfaces
   `agent-policy-event/v1` results as soft warnings/logs unless an optional
   reviewed hook helper is installed; append
   `.agent-skill/runs/<run-id>/policy-log.jsonl` when possible. Cost usage
   appends `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`.
7. **Interactions use the shared UX schema.** Render
   `agent-interaction/v1` decision/confirmation/resume prompts through the
   Copilot markdown renderer, persist choices in `.agent-all-state.json`, and
   append `.agent-skill/runs/<run-id>/interactions.jsonl`. Non-TTY may
   auto-select recommended low/medium-risk options only; high-risk options
   pause or block.

## Copilot primitive map

| Action | Copilot primitive |
|---|---|
| Read file | `read_file` |
| Write file | `apply_patch` |
| Shell | `read_bash` |
| Dispatch subagent | `task` |
| Inspect dispatched agent | `read_agent`, `list_agents` |
| Wait for completion | `subagentStop` hook OR poll `list_agents` |
| Persist plan/state | `store_memory` (scope=`repository`) |
| Prompt user | `ask_user` (where available) |

## On error

Same as Claude port. Additional Copilot-specific notes:
- If `task` tool unavailable (Copilot CLI < v0.0.380): abort with upgrade hint.
- If `subagentStop` hook not registered: fall back to `list_agents` polling every 2s.
- If `store_memory` quota exceeded: warn and continue using only file-based state.

## When done

Print summary: phases completed, iters, cost, PR URL. Exit 0/1/2/3 per spec.

## References

- `references/porting-notes.md` — Copilot primitive mapping rationale
- `plugins/harness-floor/skills/agent-all/SKILL.md` — source-of-truth pipeline
