# visual-qa-codex — porting notes

## Graduation

Initial scaffold (commit `ea3155a`-ish) shipped config + MCP snippet only.
This iteration ports the **full 6-phase orchestrator** using Codex's
`agent` hook (preferred) or sequential `.codex/skills/visual-qa-page` invocation (fallback).

## Phase contract preserved

| Aspect | Claude Code | Codex |
|---|---|---|
| Page dispatch | `Skill: dispatching-parallel-agents` + `Task` per page | `agent` hook fan-out OR sequential `.codex/skills/visual-qa-page` |
| Awaiter | `await` per Task | `codex agent wait --task-prefix visual-qa/page/` |
| Plan persistence | in-process | `apply_patch` to state file |
| LLM call | claude-sonnet-4-6 via Task | Codex's configured model |
| Browser MCP | `mcp__plugin_playwright_playwright__*` | `mcp__playwright__*` (via `[mcp_servers.playwright]` in config.toml) |

## Open research questions

Same as `agent-all-codex` porting-notes:
1. `[[hooks.agent]]` syntax confirmation.
2. `codex agent dispatch` and `codex agent wait` command shape verification.
3. Per-agent cost reporting via wait response payload.

Until the hook is verified, sequential fallback runs automatically.

## Future work

- Live CLI research spike for `agent` hook schema.
- `bin/init.mjs` to install hook snippet into config.toml with merge semantics.
- Cost-tracking integration once wait-response is confirmed.
