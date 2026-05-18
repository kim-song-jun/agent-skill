# Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at project root. If not: print
   `Run scaffold first.` and abort.
2. Confirm Playwright MCP in `~/.codex/config.toml`
   (`[mcp_servers.playwright]`). Test with `list_tools` — if missing:
   abort with snippet from `templates/mcp-snippet.toml.hbs`.
3. **Detect dispatch strategy** (same as agent-all-codex):
   - Read `~/.codex/config.toml`. If `[[hooks.agent]]` registered for
     `visual-qa/page/.*`: `dispatch = "agent-hook"`.
   - Else: `dispatch = "sequential"`, warn user.
4. Unless `--skip-health`:
   `shell_command("curl --max-time 5 -s -o /dev/null -w '%{http_code}' <baseUrl>")`.
   If not 2xx: ask via `ask_user`, abort if `--yes`.
5. Read `.visual-qa-state.json`. If `--resume` and `max(state.phases[*].phase) >= 0`,
   skip rest of Phase 0.
6. Push `{phase: 0, completedAt, dispatch}` to state via `apply_patch`.
