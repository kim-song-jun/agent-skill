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
/agent-all-copilot docs/tasks/12-fix-login.md
/agent-all-copilot "fix flaky test" --loop --max-iter=5
/agent-all-copilot docs/tasks/x.md --no-pr --wave-size=large
```

## Flags

Same as Claude Code: `--loop`, `--max-iter=<N>`, `--max-cost=<USD>`,
`--wave-size=small|medium|large`, `--no-pr`, `--no-brainstorm`,
`--resume`, `--force`, `--yes`,
`--break-condition=<spec>`, `--reconfigure`.

When `--loop` is set, Phase 0 prompts the user interactively (via Copilot's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Custom shell / Composite) and offers to save the choice to
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
2. **State lives in two places.** `.agent-all-state.json` for cross-session resume; `store_memory` scope=repository for in-session dispatch coordination.
3. **Delegate, don't reimplement.** Phase 3 uses `task`; Phase 4 uses `task`; Phase 5 uses `read_bash`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Hard caps:** `--max-iter` clamped to 50; `--max-cost` enforced after each wave by reading Copilot's per-session cost field (if exposed via `list_agents` summary; else best-effort).

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
