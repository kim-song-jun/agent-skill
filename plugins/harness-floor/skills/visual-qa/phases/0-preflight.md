# Phase 0 — Preflight

## Steps

1. Confirm `.visual-qa.json` exists at the project root. If not: print `Run /agent-init --visual-qa to scaffold the config.` and abort.

2. Confirm Playwright MCP tools are available. Use `ToolSearch` to load `mcp__plugin_playwright_playwright__browser_navigate`. If unavailable: print `Install the playwright plugin: /plugin install playwright@claude-plugins-official` and abort.

3. Unless `--skip-health`: GET `<baseUrl>` with 5s timeout (use `ctx_execute` with `language: "shell"` and `curl --max-time 5 -s -o /dev/null -w "%{http_code}" <baseUrl>`). If the status is not 2xx:
   - If `--yes`: abort with `baseUrl not responding`.
   - Else: ask user `Dev server at <baseUrl> not responding (status=<x>). Continue anyway? [y/N]` and wait.

4. Read `.visual-qa-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 0`, skip the rest of Phase 0.

5. Push `{ "phase": 0, "completedAt": "<iso>" }` onto `phases` in `.visual-qa-state.json` (create the file with `{"phases": []}` if missing). Atomic write: temp file + rename.

## Output to user

Print: `Preflight OK (config + Playwright + health).`
