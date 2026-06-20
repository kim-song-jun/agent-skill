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
| Awaiter | `await` per Task | `task` result plus optional `subagentStop` lifecycle log |
| LLM call | claude-sonnet-4-6 via Task | Copilot's configured model |
| Matrix persistence | in-process | file path passed in task context |
| Output dir | `.agent-skill/reports/visual-qa/<slug>/` | Same |

## Known unknowns

1. **`task` tool concurrency cap.** Whether Copilot rate-limits parallel
   task invocations per session. If so, the per-page fan-out should chunk.

2. **`subagentStop` hook payload.** Current Copilot CLI emits lifecycle
   metadata such as `agentName`, `sessionId`, `transcriptPath`, and
   `stopReason`; it does not replace the page task result.

3. **Per-task cost reporting.** If the task result lacks cost, fallback to
   token-count estimation from transcript evidence.

## Future work

- Spawn-tracker `.mjs` lib once `task` tool concurrency is verified.
- `--dispatch=sequential` flag for slow networks where parallel task
  invocations are flaky.
