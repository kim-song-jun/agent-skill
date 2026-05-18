# harness-floor-cursor

Scaffold-level visual-qa support for Cursor. Emits:

- `.visual-qa.json` at project root (capture matrix configuration)
- Playwright MCP snippet printed to stdout — merge into `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)

## Install

Cursor has no plugin loader. Use the bundled renderer:

```
node plugins/harness-floor-cursor/bin/init.mjs /path/to/your/project [--force]
```

Or copy the templates manually from `plugins/harness-floor-cursor/skills/visual-qa-cursor/templates/`.

## Usage

The skill is documentation. In a Cursor chat, ask Cursor to follow
`plugins/harness-floor-cursor/skills/visual-qa-cursor/SKILL.md`, which:

1. Confirms before overwriting an existing `.visual-qa.json`.
2. Renders the config template to `.visual-qa.json` in the workspace root.
3. Prints the Playwright MCP entry for you to merge into `.cursor/mcp.json`.

## MVP scope

This iteration is **scaffold-only**. The full 6-phase visual-qa pipeline
(preflight → config → discover → capture → aggregate → summary) lives in
`plugins/harness-floor/skills/visual-qa/SKILL.md` (Claude Code). Porting
the orchestrator to Cursor is tracked as a future per-platform spec —
Cursor delegates to subagents via prompt routing (`.cursor/agents/*.md`
with `is_background: true`), so the port is a prompt template rather than
a programmatic runner.

For now, run Playwright commands manually in Cursor's chat and analyze
captured images via Cursor's vision-capable model directly.
