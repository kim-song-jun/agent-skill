# Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at project root via `read_file`. If
   not: print `Run scaffold first.` and abort.
2. Confirm Playwright MCP in `~/.gemini/settings.json` `mcpServers`. Test
   with a no-op `browser_snapshot`. If missing: print snippet from
   `templates/mcp-snippet.json.hbs` and abort.
3. Confirm `gemini` binary in PATH:
   `run_shell_command("command -v gemini")` exit 0.
4. Probe subprocess sanity:
   `run_shell_command("gemini chat -p 'reply OK' --output-json --timeout 30")`.
   Parse JSON, verify response. If fail: abort.
5. Unless `--skip-health`:
   `run_shell_command("curl --max-time 5 -s -o /dev/null -w '%{http_code}' <baseUrl>")`.
   If not 2xx:
   - Build an `agent-interaction/v1` confirmation with
     `kind: "confirmation"`, `id: "visual-qa:base-url-health"`,
     default option `abort`, and options `abort` (recommended, low risk)
     and `continue` (medium risk).
   - Render with
     `../agent-all-gemini/lib/interactions/renderer-gemini.mjs` and append
     the result to `.agent-skill/runs/<run-id>/interactions.jsonl` with
     `appendInteractionLog({ source: "visual-qa" })`.
   - If `--yes` or non-TTY, resolve through `resolveNonTtyInteraction()`;
     because the default is `abort`, non-TTY must abort with
     `baseUrl not responding` unless a TTY user selects `continue`.
6. Read `.visual-qa-state.json` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
7. Push `{phase: 0, completedAt}` to state via `write_file` + atomic rename.
