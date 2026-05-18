---
name: visual-qa-cursor
description: >
  Scaffold visual-qa config and Playwright MCP entry for Cursor projects.
  MVP — emits config files but does not implement the full 6-phase orchestrator.
  See plugins/harness-floor/skills/visual-qa/SKILL.md for the source-of-truth pipeline design.
---

# visual-qa-cursor (scaffold)

This skill produces:

- `.visual-qa.json` at project root — the visual-qa config (capture matrix, breakpoints, flows, etc.)
- A Playwright MCP snippet printed to stdout — user merges into `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global).

## Phase 1 — Emit config

1. Ask the user (in chat) whether to overwrite an existing `.visual-qa.json` if one exists; default refuse.
2. Render `templates/visual-qa.config.json.hbs` to `.visual-qa.json` in the workspace root (Cursor edits the file directly via its editor surface).

## Phase 2 — Print MCP snippet

Render `templates/mcp-snippet.json.hbs` and print to stdout with a header:

```
# Copy the following into .cursor/mcp.json:
```

The user merges manually. Cursor reads `.cursor/mcp.json` for project-scoped
MCP servers and `~/.cursor/mcp.json` for global ones.

## Phase 3 — Run the visual-qa pipeline

**Not implemented in this scaffold.** Refer to
`plugins/harness-floor/skills/visual-qa/SKILL.md` for the 6-phase pipeline
design (preflight → config → discover → capture → aggregate → summary). A
follow-up Cursor-specific spec will port the orchestrator using a prompt
template that routes per-page work to `.cursor/agents/visual-qa-page.md`
(with `is_background: true`) — Cursor handles parallel dispatch natively
through subagent description-matching rather than an explicit dispatch
call.

For now, users can run Playwright commands manually in Cursor's chat and
have Cursor's vision-capable model analyze captured images directly.
