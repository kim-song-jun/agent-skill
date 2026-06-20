# Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at project root via `view`. If
   not: print `Run scaffold to seed config first.` and abort.
2. Confirm Playwright MCP is registered in `~/.copilot/mcp-config.json`.
   Test with `list_tools()` — if `playwright.*` tools missing: print
   `Add Playwright MCP entry to ~/.copilot/mcp-config.json` and abort.
3. Confirm `task` is available in the host tool surface. If not: abort
   `Copilot CLI task support is required`.
4. Unless `--skip-health`: `bash("curl --max-time 5 -s -o /dev/null -w '%{http_code}' <baseUrl>")`.
   If not 2xx:
   - Build an `agent-interaction/v1` confirmation with
     `kind: "confirmation"`, `id: "visual-qa:base-url-health"`,
     default option `abort`, and options `abort` (recommended, low risk)
     and `continue` (medium risk).
   - Render with
     `../agent-all-copilot/lib/interactions/renderer-copilot.mjs` and append
     the result to `.agent-skill/runs/<run-id>/interactions.jsonl` with
     `appendInteractionLog({ source: "visual-qa" })`.
   - If `--yes` or non-TTY, resolve through `resolveNonTtyInteraction()`;
     because the default is `abort`, non-TTY must abort with
     `baseUrl not responding` unless a TTY user selects `continue`.
5. Read `.visual-qa-state.json` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
6. Push `{phase: 0, completedAt}` to state via `create` / `edit`.
