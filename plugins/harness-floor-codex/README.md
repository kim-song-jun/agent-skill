# harness-floor-codex

> **Decision-surfacing enforcement: 🟢 Hard (after manual config merge).** Codex CLI uses `~/.codex/config.toml` `[[hooks.agent]]` entries. This plugin prints a TOML snippet to stdout that the user merges manually. Once merged, non-compliant subagents are rejected at PostToolUse.

Scaffold-level visual-qa support for Codex CLI. Emits:

- `.visual-qa.json` at project root (capture matrix configuration)
- Playwright MCP snippet printed to stdout — merge into `~/.codex/config.toml`

## Install

```
codex plugins install <repo-url>
```

## Usage

Run `/visual-qa-codex` inside Codex CLI. The skill:

1. Renders `.visual-qa.json` (with confirmation if a file already exists).
2. Prints the Playwright MCP entry for you to merge into your Codex config.

## MVP scope

This iteration is **scaffold-only**. The full 6-phase visual-qa pipeline
(preflight → config → discover → capture → aggregate → summary) lives in
`plugins/harness-floor/skills/visual-qa/SKILL.md` (Claude Code). Porting
the orchestrator to Codex requires Codex's `agent` hook type for parallel
page-analysis dispatch and is tracked as a future per-platform spec.

For now, run Playwright commands manually via `shell_command` and analyze
captured images via `apply_patch` to write reports.
