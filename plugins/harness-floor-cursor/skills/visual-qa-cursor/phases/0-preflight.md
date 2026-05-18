# Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at workspace root. If not: print
   `Install harness-floor-cursor visual-qa kit first or run scaffold.` and abort.
2. Confirm Playwright MCP is registered in `.cursor/mcp.json` (or
   `~/.cursor/mcp.json`). Test by invoking a no-op `browser_snapshot`. If
   the server is missing: print `Add Playwright MCP to .cursor/mcp.json`
   and abort.
3. Unless `--skip-health`: HTTP GET `<baseUrl>` with 5s timeout via
   Cursor's terminal. If status is not 2xx:
   - If `--yes`: abort with `baseUrl not responding`.
   - Else: ask in chat `Dev server at <baseUrl> not responding (status=<x>). Continue anyway? [y/N]`.
4. Read `.visual-qa-state.json` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
5. Push `{phase: 0, completedAt: "<iso>"}` to `phases` via Cursor's
   edit surface. Atomic via write-tmp + rename in Cursor's terminal.
