# visual-qa-copilot — porting notes

## Graduation from scaffold to full pipeline

Initial scaffold (commit `ecb86cb`) shipped:
- `.visual-qa.json` template
- Playwright MCP snippet for `~/.copilot/mcp-config.json`
- SKILL.md documenting Phases 1–2 only
- Phase 3 explicitly marked "not implemented in this scaffold"

This iteration ports the **full 6-phase orchestrator** using Copilot's
`task` tool for parallel per-page capture+analyze.

## Phase contract preserved

| Aspect | Claude Code | Copilot |
|---|---|---|
| Page dispatch | `Skill: dispatching-parallel-agents` + `Task` per page | `task` tool per page |
| Awaiter | `await` per Task | `subagentStop` hook OR `list_agents` polling |
| LLM call | claude-sonnet-4-6 via Task | Copilot's configured model |
| Matrix persistence | in-process | `store_memory(key="visual-qa/matrix")` |
| Output dir | `docs/visual-qa/<slug>/` | Same |

## Known unknowns

1. **`task` tool concurrency cap.** Whether Copilot rate-limits parallel
   task invocations per session. If so, the per-page fan-out should chunk.

2. **`subagentStop` hook payload.** Phase 3 doc assumes
   `{agentId, status, output, costUSD}`. Live confirmation needed.

3. **Per-task cost reporting.** `read_agent` response shape for `costUSD`
   not yet verified — fallback: token-count estimation from transcript.

## Future work

- Spawn-tracker `.mjs` lib once `task` tool concurrency is verified.
- `store_memory` GC handler — fall back to file if memory keys evict mid-run.
- `--dispatch=sequential` flag for slow networks where parallel task
  invocations are flaky.
