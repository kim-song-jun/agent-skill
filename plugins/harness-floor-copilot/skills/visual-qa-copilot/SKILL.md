---
name: visual-qa-copilot
description: >
  Scaffold visual-qa config and Playwright MCP entry for GitHub Copilot CLI projects.
  MVP — emits config files but does not implement the full 6-phase orchestrator.
---

# visual-qa-copilot (scaffold)

This skill produces:

- `.visual-qa.json` at project root
- A Playwright MCP snippet printed to stdout — user merges into `~/.copilot/mcp-config.json`.

## Phase 1 — Emit config

1. Ask the user whether to overwrite an existing `.visual-qa.json`; default refuse.
2. Render `templates/visual-qa.config.json.hbs` to `.visual-qa.json` via `apply_patch`.

## Phase 2 — Print MCP snippet

Render `templates/mcp-snippet.json.hbs` and print to stdout with a header:

```
# Copy the following into ~/.copilot/mcp-config.json:
```

## Phase 3 — Run the visual-qa pipeline

**Not implemented in this scaffold.** A follow-up Copilot-specific spec will
port the orchestrator using Copilot's `task` / `read_agent` / `list_agents`
tools for parallel dispatch.

For now, run Playwright captures via `read_bash` and analyze images via
the model directly.
