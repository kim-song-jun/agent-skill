# visual-qa-gemini — porting notes

## Graduation

Initial scaffold shipped config + MCP snippet only. This iteration ports
the **full 6-phase orchestrator** using Gemini's subprocess primitive
(`run_shell_command("gemini -p ... --output-format json")` via the wrapper).

## Phase contract preserved

| Aspect | Claude Code | Gemini |
|---|---|---|
| Page dispatch | `Skill: dispatching-parallel-agents` + `Task` per page | `run_shell_command("gemini -p ... --output-format json")` per page |
| Awaiter | `await` per Task | `wait <pid>` OR poll tmp dir |
| Plan persistence | in-process | `write_file` + atomic rename |
| LLM call | claude-sonnet-4-6 via Task | Gemini's configured model |
| Browser MCP | `mcp__plugin_playwright_playwright__*` | `mcp__playwright__*` (via `~/.gemini/settings.json`) |

## Why subprocess?

Same reasoning as `agent-all-gemini`: Gemini has no native subagent
dispatch primitive. Subprocesses provide isolation + parallelism + cost
tracking via JSON stdout when usage fields are present.

## Open questions

Same as `agent-all-gemini`:
1. Authenticated JSON envelope examples beyond the unauthenticated error shape.
2. Persona selection through Gemini skills/extensions, not per-process roster flags.
3. Per-subprocess token-cost reporting.
4. Concurrent subprocess rate limits per Gemini API plan.

## Subprocess-specific risks for visual-qa

- **MCP session contention.** Each headless Gemini subprocess opens its own
  Playwright MCP server (or shares one if MCP server supports
  multiplexing). If shared, browser context collisions are possible. The
  phase doc assumes one-MCP-per-subprocess.
- **Tmp file races.** Per-page output files in `/tmp/visual-qa/` are named
  by page so no collision should occur, but stress-test validation needed.
- **Screenshot storage.** Subprocesses write screenshots to OUTPUT_DIR
  (under the slug dir). Disk space could fill on large matrices —
  Phase 5 GC handles `/tmp/visual-qa/` only; slug dir is preserved.

## Future work

- Additional authenticated output fixtures for `bin/spawn-page-subagent.mjs`.
- MCP session pool to avoid spawning N Playwright servers.
- Streaming progress via FIFOs instead of one-shot tmp files.
