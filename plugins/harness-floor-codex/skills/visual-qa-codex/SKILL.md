---
name: visual-qa-codex
description: >
  Scaffold visual-qa config and Playwright MCP entry for Codex CLI projects.
  MVP — emits config files but does not implement the full 6-phase orchestrator.
  See plugins/harness-floor/skills/visual-qa/SKILL.md for the source-of-truth pipeline design.
---

# visual-qa-codex (scaffold)

This skill produces:

- `.visual-qa.json` at project root — the visual-qa config (capture matrix, breakpoints, flows, etc.)
- A Playwright MCP snippet printed to stdout — user merges into `~/.codex/config.toml` or project `.codex/config.toml`.

## Phase 1 — Emit config

1. Ask the user (via `ask_user`) whether to overwrite an existing `.visual-qa.json` if one exists; default refuse.
2. Render `templates/visual-qa.config.json.hbs` to `.visual-qa.json` via `apply_patch`.

## Phase 2 — Print MCP snippet

Render `templates/mcp-snippet.toml.hbs` and print to stdout with a header:

```
# Copy the following into ~/.codex/config.toml:
```

The user merges manually.

## Phase 3 — Run the visual-qa pipeline

**Not implemented in this scaffold.** Refer to
`plugins/harness-floor/skills/visual-qa/SKILL.md` for the 6-phase pipeline
design (preflight → config → discover → capture → aggregate → summary). A
follow-up Codex-specific spec will port the orchestrator using Codex's
`agent` hook type for parallel page-analysis dispatch.

For now, users can run Playwright commands manually via Codex's
`shell_command` and have the agent analyze captured images via `apply_patch`
to write reports.
