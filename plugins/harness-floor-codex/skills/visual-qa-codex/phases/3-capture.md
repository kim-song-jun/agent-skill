# Phase 3 — Capture + Analyze

## Codex dispatch strategy

Set in Phase 0 — `sequential` for current Codex hooks.

## Group matrix by page

Group matrix from Phase 1 by `page.name` (or `flows[i].name`).

## Sequential Dispatch

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

- Sequential page fails: mark `incomplete`, continue.
