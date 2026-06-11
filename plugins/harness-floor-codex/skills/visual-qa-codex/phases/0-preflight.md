# Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at project root. If not: print
   `Run scaffold first.` and abort.
2. Confirm Playwright MCP in `~/.codex/config.toml`
   (`[mcp_servers.playwright]`). Test with `list_tools` — if missing:
   abort with snippet from `templates/mcp-snippet.toml.hbs`.
3. **Detect dispatch strategy** (same as agent-all-codex):
   - Current Codex hooks do not expose the command surface needed for
     this pipeline's previous parallel page-dispatch design.
   - Set `dispatch = "sequential"`.
   - If `--dispatch=agent-hook` was passed, abort with
     `agent-hook dispatch is unsupported by current Codex hooks`.
4. Unless `--skip-health`:
   `shell_command("curl --max-time 5 -s -o /dev/null -w '%{http_code}' <baseUrl>")`.
   If not 2xx:
   - Build an `agent-interaction/v1` confirmation with
     `kind: "confirmation"`, `id: "visual-qa:base-url-health"`,
     default option `abort`, and options `abort` (recommended, low risk)
     and `continue` (medium risk).
   - Render with
     `../agent-all-codex/lib/interactions/renderer-codex.mjs` and append
     the result to `.agent-skill/runs/<run-id>/interactions.jsonl` with
     `appendInteractionLog({ source: "visual-qa" })`.
   - If `--yes` or non-TTY, resolve through `resolveNonTtyInteraction()`;
     because the default is `abort`, non-TTY must abort with
     `baseUrl not responding` unless a TTY user selects `continue`.
5. Read `.visual-qa-state.json`. If `--resume` and `max(state.phases[*].phase) >= 0`,
   skip rest of Phase 0.
6. Push `{phase: 0, completedAt, dispatch}` to state via `apply_patch`.
