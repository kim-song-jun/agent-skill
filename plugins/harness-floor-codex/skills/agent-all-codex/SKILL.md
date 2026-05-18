---
name: agent-all-codex
description: >
  Codex CLI port of /agent-all (intent → plan → wave-dispatch → gate → PR).
  Phase 3 dispatch path is gated on Codex's `agent` hook type — until that
  hook is GA-confirmed, the port falls back to sequential `.codex/skills/<role>`
  invocations. See plugins/harness-floor/skills/agent-all/SKILL.md for the
  source-of-truth pipeline.
---

# /agent-all (Codex port)

Runs the cost-unrestricted multi-agent pipeline using Codex CLI
primitives. Two dispatch paths supported, chosen at preflight:

- **Preferred (when available):** Codex's `agent` hook type — fires on
  parent-→-subagent invocation, enables true parallel fan-out.
- **Fallback:** sequential invocation of `.codex/skills/<role>/SKILL.md`
  per wave task. Slower but works on any Codex CLI version.

## Usage

```
/agent-all-codex "add user signup form"
/agent-all-codex docs/tasks/12-fix-login.md
/agent-all-codex "fix flaky test" --loop --max-iter=5
/agent-all-codex docs/tasks/x.md --no-pr --wave-size=large
```

## Flags

Same as Claude Code: `--loop`, `--max-iter=<N>`, `--max-cost=<USD>`,
`--wave-size=small|medium|large`, `--no-pr`, `--no-brainstorm`,
`--resume`, `--force`, `--yes`,
`--break-condition=<spec>`, `--reconfigure`.

When `--loop` is set, Phase 0 prompts the user interactively (via Codex's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Custom shell / Composite) and offers to save the choice to
`.agent-all.json`. Use `--break-condition=<spec>` to skip the prompt for
one invocation, or `--reconfigure` to re-prompt even when a non-default
value already lives in config.

Additional Codex-specific:
- `--dispatch=agent-hook|sequential` — force the dispatch strategy
  (default: auto-detect at preflight).

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git + .codex/skills + config + dispatch-strategy detect |
| 1 | `phases/1-intent.md` | brainstorm (chat) OR load task file |
| 2 | `phases/2-plan.md` | draft plan via `apply_patch` |
| 3 | `phases/3-dispatch.md` | `agent` hook fan-out OR sequential skill invocations |
| 4 | `phases/4-gate.md` | dispatch reviewer (same strategy as Phase 3) |
| 5 | `phases/5-pr.md` | `shell_command`: git branch push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Atomic write via `apply_patch` (temp + rename).
3. **Delegate, don't reimplement.** Phase 3 uses `agent` hook (or sequential skill calls); Phase 4 same; Phase 5 uses `shell_command`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Hard caps:** `--max-iter` clamped to 50; `--max-cost` enforced after each wave via Codex's session-cost API (if exposed; else best-effort).

## Codex primitive map

| Action | Codex primitive |
|---|---|
| Read file | implicit (model reads file directly) |
| Write file | `apply_patch` |
| Shell (one-shot) | `shell_command` |
| Shell (long-running) | `exec_command` (keeps PTY) |
| Dispatch subagent | `agent` hook (preferred) OR invoke `.codex/skills/<role>/SKILL.md` |
| Prompt user | `ask_user` |
| Persist plan/state | `apply_patch` to `.agent-all-state.json` |

## On error

Same as Claude port. Additional Codex-specific notes:
- If `agent` hook not registered AND `--dispatch=agent-hook` was forced:
  abort with `Codex agent hook unavailable; rerun without --dispatch=agent-hook`.
- If `.codex/skills/<role>/SKILL.md` missing for any wave's task role:
  abort with `/codex-init --theme=floor required to seed skill roster`.
- `shell_command` timeout (default 30s) extended to 300s for `git push`.

## When done

Print summary: phases completed, iters, cost, PR URL, dispatch strategy used.
Exit 0/1/2/3 per spec.

## References

- `references/porting-notes.md` — `agent` hook research status + sequential fallback rationale
- `plugins/harness-floor/skills/agent-all/SKILL.md` — source-of-truth pipeline
