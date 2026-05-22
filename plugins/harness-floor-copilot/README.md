# harness-floor-copilot

> **Decision-surfacing enforcement: 🟢 Hard.** Copilot CLI exposes a `.github/hooks/` framework. The decision-protocol hook installed by this plugin registers `pre-tool-use` and `post-tool-use` matchers on the `task` tool — non-compliant subagents are rejected at PostToolUse.

Scaffold-level visual-qa support for GitHub Copilot CLI. Emits:

- `.visual-qa.json` at project root
- Playwright MCP snippet printed to stdout — merge into `~/.copilot/mcp-config.json`

## Install

```
copilot plugin install <repo-url>
```

## Usage

Run `/visual-qa-copilot`. The skill emits the config and the MCP snippet.

## MVP scope

This is **scaffold-only**. The full 6-phase pipeline lives in
`plugins/harness-floor/skills/visual-qa/SKILL.md` (Claude Code). Porting
to Copilot requires its `task` / `read_agent` / `list_agents` tools for
parallel dispatch and is tracked as a future spec.

For now, run Playwright commands via `read_bash` and analyze images
through the model directly.
