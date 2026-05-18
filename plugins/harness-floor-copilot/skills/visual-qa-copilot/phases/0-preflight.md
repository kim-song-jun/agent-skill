# Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at project root via `read_file`. If
   not: print `Run scaffold to seed config first.` and abort.
2. Confirm Playwright MCP is registered in `~/.copilot/mcp-config.json`.
   Test with `list_tools()` — if `playwright.*` tools missing: print
   `Add Playwright MCP entry to ~/.copilot/mcp-config.json` and abort.
3. Confirm `task` tool available: `list_agents()` returns []. If error: abort
   `Copilot CLI v0.0.380+ required for task tool`.
4. Unless `--skip-health`: `read_bash("curl --max-time 5 -s -o /dev/null -w '%{http_code}' <baseUrl>")`.
   If not 2xx:
   - If `--yes`: abort.
   - Else: `ask_user("Dev server at <baseUrl> not responding. Continue? [y/N]")`.
5. Read `.visual-qa-state.json` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
6. Push `{phase: 0, completedAt}` to state via `apply_patch`.
