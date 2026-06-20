---
name: agent-all
description: >
  Use when a GitHub Copilot CLI project needs a full feature, bugfix, or task
  run from intent through planning, implementation, review, verification, and
  optional PR creation.
---

# /agent-all (Copilot port)

Runs the cost-unrestricted multi-agent pipeline using Copilot CLI
primitives. Phase 3 fan-out dispatches one `task` per wave task and
records lifecycle events via Copilot's `subagentStop` hook when the optional
reviewed hook helper is installed. Copilot CLI does not expose
`read_agent`, `list_agents`, or `store_memory` as public harness primitives,
so durable coordination state lives in repository files.

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
| 0 | `phases/0-preflight.md` | git + Copilot CLI config + input checks |
| 1 | `phases/1-intent.md` | brainstorm (chat) OR load task file; persist to files |
| 2 | `phases/2-plan.md` | draft plan into `.agent-skill/plans/` + state |
| 3 | `phases/3-dispatch.md` | fan out parallel `task` invocations per wave |
| 4 | `phases/4-gate.md` | dispatch reviewer `task`s for spec + quality |
| 5 | `phases/5-pr.md` | `bash` / `powershell`: git push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in files.** `.agent-all-state.json` is the resume source of truth. Mirror the latest `agent-cost-telemetry/v1` summary to `state.costTelemetry.summary` and keep `state.costUSD` as the backward-compatible total.
3. **Delegate, don't reimplement.** Phase 3 uses `task`; Phase 4 uses `task`; Phase 5 uses `bash` / `powershell`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Loop stops:** completion is break-condition driven. `--max-iter=0` or
   `loop.maxIter: null` enables unlimited iterations, while cost/runtime
   budgets, hard policy hooks, user interruption, and repeated failure signatures can still
   stop the loop. Cost enforcement uses reported evidence when available,
   else best-effort estimates through `agent-cost-telemetry/v1`.
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
| Read file | `view` |
| Write file | `create`, `edit` |
| Shell | `bash`, `powershell` |
| Dispatch subagent | `task` |
| Wait for lifecycle event | `subagentStop` hook (`agentName`, `sessionId`, `transcriptPath`, `stopReason`) |
| Persist plan/state | repository files such as `.agent-all-state.json` and `.agent-skill/plans/` |
| Prompt user | `ask_user` (where available) |

## On error

Same as Claude port. Additional Copilot-specific notes:
- If `task` is unavailable in the current Copilot CLI surface: abort with an upgrade hint.
- If `subagentStop` hook is not registered: continue with prompt-level task results and file state; do not invent a polling API.

## When done

Print summary: phases completed, iters, cost, PR URL. Exit 0/1/2/3 per spec.

## References

- `references/porting-notes.md` — Copilot primitive mapping rationale
- `plugins/harness-floor/skills/agent-all/SKILL.md` — source-of-truth pipeline
