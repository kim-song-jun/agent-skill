# visual-qa-cursor — porting notes

## Graduation from scaffold to full pipeline

The initial scaffold (commit `1fd58ba`) shipped:
- `.visual-qa.json` template
- Playwright MCP snippet for `.cursor/mcp.json`
- SKILL.md documenting Phases 1–2 only (config emit, snippet print)
- Phase 3 explicitly marked "not implemented in this scaffold"

This iteration ports the **full 6-phase orchestrator** as a prompt
template + Cursor-native subagent (`@visual-qa-page` with `is_background: true`).

## Phase contract preserved

All 6 phases (0-preflight, 1-config, 2-discover, 3-capture+analyze,
4-aggregate+diff, 5-summary) match the Claude Code source-of-truth at
`plugins/harness-floor/skills/visual-qa/SKILL.md`. Differences concentrate
in Phase 3:

| Aspect | Claude Code (`/visual-qa`) | Cursor (`/visual-qa` port) |
|---|---|---|
| Page subagent dispatch | `Skill: dispatching-parallel-agents` + `Task` tool per page | `@visual-qa-page` invocations with `is_background: true` |
| Awaiter | `await Promise.all(tasks)` in orchestrator | Cursor planner; coordinator waits for all background chats |
| LLM call | claude-sonnet-4-6 via Task | Cursor's configured model (typically claude-sonnet-4-6 or gpt-4o) |
| Browser MCP | `mcp__plugin_playwright_playwright__*` (Claude Code path) | `mcp__playwright__*` (Cursor MCP path; project-scoped in `.cursor/mcp.json`) |
| Output dir | `.agent-skill/reports/visual-qa/<slug>/` (configurable) | Same |

## Known limitations (Cursor-specific)

1. **Awaiter is the user.** Cursor doesn't expose a programmatic way for
   the coordinator to know all `@visual-qa-page` background invocations
   have finished. The phase 3 doc instructs the coordinator to wait for
   the user to confirm before continuing to Phase 4. A future
   `cursor-cli` GA may add a transcript-listener primitive.

2. **MCP server path.** Cursor's MCP tool names are platform-prefixed
   differently from Claude Code's (`mcp__playwright__browser_*` vs
   `mcp__plugin_playwright_playwright__browser_*`). The page subagent
   template uses Cursor's path.

3. **Cost-cap is best-effort.** Cursor's chat doesn't surface per-message
   cost; the per-page subagent stops on local accumulator only.

## Future work

- `bin/init.mjs` Node renderer to install kit into target workspace
  (matches `harness-builder-cursor/bin/init.mjs` pattern).
- `cursor-cli` integration for background-chat completion polling.
- Streaming progress per page (instead of waiting for full subagent return).
