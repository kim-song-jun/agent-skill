---
name: agent-all-cursor
description: >
  Cursor port of /agent-all (intent → plan → wave-dispatch → gate → PR pipeline).
  Prompt-template approach — there is no programmatic runner. Cursor delegates
  to `.cursor/agents/agent-all-*.md` subagents via description-matching and
  parallelizes implementers/reviewers with `is_background: true`.
  See plugins/harness-floor/skills/agent-all/SKILL.md for the source-of-truth pipeline.
---

# /agent-all (Cursor port)

## Why a prompt template instead of an orchestrator

Cursor's subagent dispatch is *implicit*: a parent agent invokes a child by
matching the child's `description` frontmatter — there is no `dispatch()`
call to write. Cursor's planner handles routing automatically. That means
the orchestrator is not a `.mjs` file but a **rule + subagent kit** that
this skill installs into the target project. The pipeline lives in
`phases/*.md` for the parent (coordinator) agent to read sequentially.

## What this skill installs

1. `.agent-all.json` — config (same shape as Claude Code; platform-agnostic).
2. `.cursor/rules/agent-all.mdc` (`alwaysApply: true`) — gives every Cursor
   chat in this workspace the pipeline rules.
3. `.cursor/agents/agent-all-coordinator.md` — parent agent. Reads phases
   1–6 and routes work to implementer/reviewer subagents.
4. `.cursor/agents/agent-all-implementer.md` (`is_background: true`) — fans
   out per wave task. Cursor invokes multiple in parallel.
5. `.cursor/agents/agent-all-reviewer.md` (`is_background: true`) — fans
   out per wave for spec + quality review.

## Usage (from a Cursor chat)

```
@agent-all-coordinator run /agent-all for "add user signup form"
@agent-all-coordinator run /agent-all using docs/tasks/12-fix-login.md --loop --max-iter=5
@agent-all-coordinator run /agent-all using docs/tasks/x.md --no-pr --wave-size=large
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

When `--loop` is set, Phase 0 prompts the user interactively for the
break-condition preset (test-auto / visual-qa / Custom shell / Composite)
and offers to save the choice to `.agent-all.json`. Use
`--break-condition=<spec>` (JSON object or plain shell string) to skip
the prompt for one invocation, or `--reconfigure` to re-prompt even when
a non-default value already lives in config.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git + .cursor/agents/ + config + input checks |
| 1 | `phases/1-intent.md` | brainstorming (chat-driven) OR load task file |
| 2 | `phases/2-plan.md` | draft plan into docs/superpowers/plans/ |
| 3 | `phases/3-dispatch.md` | fan out to `agent-all-implementer` (parallel via `is_background`) |
| 4 | `phases/4-gate.md` | fan out to `agent-all-reviewer` for spec + quality review |
| 5 | `phases/5-pr.md` | branch push + `gh pr create` (or skip) |
| 6 | `phases/6-loop.md` | breakCondition shell loop (manual re-invoke) |

## Rules

1. **Coordinator reads phases sequentially**. Do not skip; do not parallelize phases.
2. **State lives in `.agent-all-state.json`.** Same shape as Claude port.
3. **Delegate, don't reimplement.** Phase 1 = brainstorming chat; Phase 2 = the user (or coordinator) writes the plan; Phase 3 = dispatch to `agent-all-implementer`.
4. **Cursor handles parallelism implicitly.** Coordinator says "for each wave task, invoke `agent-all-implementer` with this task block" — Cursor's planner fans out to background agents.
5. **Hard caps:** `--max-iter` clamped to 50; `--max-cost` is best-effort — Cursor doesn't expose per-turn cost in the chat surface, so the coordinator records cost only when the user pastes it.

## Differences from the Claude Code orchestrator

| Aspect | Claude Code (`/agent-all`) | Cursor (`agent-all-cursor`) |
|---|---|---|
| Phase runner | Read each phase file, execute steps | Read each phase file, write chat output |
| Dispatch | `superpowers:subagent-driven-development` (`Task` tool) | Cursor planner matches `agent-all-implementer.description` |
| Parallelism | One `Task` per wave task | `is_background: true` per subagent file |
| State writes | `.agent-all-state.json` (atomic) | Coordinator writes via Cursor's edit surface |
| Plan writer | `superpowers:writing-plans` skill | Coordinator drafts inline OR user supplies file |
| breakCondition loop | `loop-evaluator.mjs` reruns the pipeline | User re-invokes `@agent-all-coordinator` per iter |

## On error

- Dirty git tree → abort with `git stash` instruction.
- `.cursor/agents/` missing `agent-all-*` → run `cursor-init --theme=floor` (future flag) or install this skill via `node plugins/harness-floor-cursor/bin/init.mjs` (future flag).
- `.agent-all.json` missing → warn + use built-ins from `templates/agent-all.config.json.hbs`.
- Wave task BLOCKED 3× → mark wave incomplete, surface to user.
- `--max-cost` best-effort only on Cursor.

## When done

Coordinator prints summary: phases completed, iters, PR URL, cost (if tracked).

## References

- `references/porting-notes.md` — design rationale for the prompt-template approach
- `plugins/harness-floor/skills/agent-all/SKILL.md` — source-of-truth Claude Code orchestrator
