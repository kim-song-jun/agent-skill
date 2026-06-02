# visual-qa-codex — porting notes

## Graduation

Initial scaffold shipped config plus a Playwright MCP snippet. This
iteration ports the full 6-phase orchestrator using sequential
`.codex/skills/visual-qa-page` dispatch.

## Current Codex Hook Limitation

Current Codex hooks support command handlers for events such as
`PreToolUse`, `PostToolUse`, and `SessionStart`. They do not expose the
older agent-dispatch hook surface that early scaffold notes assumed.

For that reason, visual-qa-codex now uses sequential page dispatch:

- Phase 0 always selects `dispatch = "sequential"`.
- `--dispatch=sequential` is accepted as an explicit no-op override.
- `--dispatch=agent-hook` aborts with an unsupported-current-hooks error.
- The hook snippet template is documentation-only and emits no TOML hook
  registration.

## Phase Contract Preserved

| Aspect | Claude Code | Codex |
|---|---|---|
| Page dispatch | `Skill: dispatching-parallel-agents` + `Task` per page | sequential `.codex/skills/visual-qa-page` |
| Plan persistence | in-process | `apply_patch` to state file |
| LLM call | claude-sonnet-4-6 via Task | Codex's configured model |
| Browser MCP | `mcp__plugin_playwright_playwright__*` | `mcp__playwright__*` via `[mcp_servers.playwright]` |

## Future Work

- Revisit parallel page dispatch only if Codex exposes an official
  command surface for spawning and awaiting subagents.
- Keep the sequential path as the stable baseline even if a future
  parallel strategy is added.
