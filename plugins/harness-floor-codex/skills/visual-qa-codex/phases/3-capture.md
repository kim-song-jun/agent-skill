# Phase 3 — Capture + Analyze (parallel fan-out)

## Codex dispatch strategy

Set in Phase 0 — `agent-hook` (preferred) or `sequential` (fallback).

## Group matrix by page

Group matrix from Phase 1 by `page.name` (or `flows[i].name`).

## Strategy A — `dispatch === "agent-hook"`

For each page-group:

```
shell_command("codex agent dispatch \
  --role visual-qa-page \
  --skill .codex/skills/visual-qa-page/SKILL.md \
  --task-id 'visual-qa/page/<page.name>' \
  --body '<page-prompt body JSON>'")
```

The `[[hooks.agent]]` matcher in `~/.codex/config.toml` (snippet at
`templates/codex-hooks-snippet.toml.hbs`) catches the dispatch and spawns
the subagent. Capture each returned `agentId`.

Await all:

```
shell_command("codex agent wait --task-prefix 'visual-qa/page/' --timeout 1800")
```

Returns JSON array of `{agentId, status, captures, analyses, costUSD, errors}`.

## Strategy B — `dispatch === "sequential"`

For each page-group, one at a time:
- Render `templates/page-prompt.md.hbs` for this page.
- Invoke `.codex/skills/visual-qa-page/SKILL.md` (or inline the prompt
  to the main model).
- Collect result before next page.

## Per-subagent steps (in page-prompt template)

1. `browser_navigate(BASE_URL + page.path)`.
2. AUTH_FLOW if `page.requiresAuth`.
3. For each breakpoint × component × state: capture screenshot to OUTPUT_DIR.
4. For each PNG: LLM analysis → `<image>.analysis.{json,md}`.
5. Return per-page JSON status.

## Orchestrator after fan-out

1. Aggregate per-page results.
2. `state.costUSD += sum(costUSD)`. Abort if exceeds `maxCostUSD`.
3. Push `{phase: 3, completedAt, strategy: dispatch}` to state.

## On error

- agent-hook dispatch fails: retry once, then fall back to sequential for
  this wave (warn).
- Sequential page fails: mark `incomplete`, continue.
