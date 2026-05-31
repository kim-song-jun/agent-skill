---
name: agent-all-codex
description: >
  Codex CLI port of /agent-all (intent → plan → wave-dispatch → gate → PR).
  Current Codex hooks do not expose the older agent-dispatch surface, so
  Phase 3 uses sequential `.codex/skills/<role>` invocations. See
  plugins/harness-floor/skills/agent-all/SKILL.md for the source-of-truth
  pipeline.
---

# /agent-all (Codex port)

Runs the cost-unrestricted multi-agent pipeline using Codex CLI
primitives. Current Codex hooks do not expose a command surface for the
older parallel agent dispatch design, so this port uses sequential
invocation of `.codex/skills/<role>/SKILL.md` per wave task.

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
`--break-condition=<spec>`, `--reconfigure`, `--qa`.

`--qa` is the one-flag shortcut for end-to-end verification: equivalent
to `--break-condition='{"type":"composite","steps":[{"type":"test-auto"},
{"type":"visual-qa","mode":"comprehensive"}]}'`. Tests run as a cheap gate;
visual-qa (comprehensive mode) runs as the final E2E check. Auto-scaffolds
`.visual-qa.json` with sane defaults if missing.

When `--loop` is set, Phase 0 prompts the user interactively (via Codex's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Custom shell / Composite) and offers to save the choice to
`.agent-all.json`. Use `--break-condition=<spec>` to skip the prompt for
one invocation, or `--reconfigure` to re-prompt even when a non-default
value already lives in config.

Additional Codex-specific:
- `--dispatch=sequential` — explicit no-op override. `--dispatch=agent-hook`
  aborts because current Codex hooks do not support that path.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git + .codex/skills + config + dispatch-strategy detect |
| 1 | `phases/1-intent.md` | brainstorm (chat) OR load task file |
| 2 | `phases/2-plan.md` | draft plan via `apply_patch` |
| 3 | `phases/3-dispatch.md` | sequential skill invocations |
| 4 | `phases/4-gate.md` | dispatch reviewer (same strategy as Phase 3) |
| 5 | `phases/5-pr.md` | `shell_command`: git branch push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Atomic write via `apply_patch` (temp + rename).
3. **Delegate, don't reimplement.** Phase 3 uses sequential skill calls; Phase 4 same; Phase 5 uses `shell_command`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Hard caps:** `--max-iter` clamped to 50; `--max-cost` enforced after each wave via Codex's session-cost API (if exposed; else best-effort).

## Codex primitive map

| Action | Codex primitive |
|---|---|
| Read file | implicit (model reads file directly) |
| Write file | `apply_patch` |
| Shell (one-shot) | `shell_command` |
| Shell (long-running) | `exec_command` (keeps PTY) |
| Dispatch subagent | invoke `.codex/skills/<role>/SKILL.md` |
| Prompt user | `ask_user` |
| Persist plan/state | `apply_patch` to `.agent-all-state.json` |

## On error

Same as Claude port. Additional Codex-specific notes:
- If `--dispatch=agent-hook` was forced: abort because current Codex hooks
  do not expose that dispatch surface.
- If `.codex/skills/<role>/SKILL.md` missing for any wave's task role:
  abort with `/codex-init --theme=floor required to seed skill roster`.
- `shell_command` timeout (default 30s) extended to 300s for `git push`.

## When done

Print summary: phases completed, iters, cost, PR URL, dispatch strategy used.
Exit 0/1/2/3 per spec.

## References

- `references/porting-notes.md` — current Codex hook limitation + sequential rationale
- `plugins/harness-floor/skills/agent-all/SKILL.md` — source-of-truth pipeline
