# harness-floor-gemini

> **Decision-surfacing enforcement: 🟡 Soft.** Gemini CLI does not have a tool-call hook system today. The decision-protocol is prompt-only via `.gemini/agent-all-decision-protocol.md` (referenced from `GEMINI.md`). A non-compliant subagent cannot be blocked at the harness layer — compliance is best-effort. Hard enforcement (PostToolUse rejection) is only available on Claude Code, Copilot CLI, and Codex CLI.

Scaffold-level visual-qa support for Gemini CLI. Emits:

- `.visual-qa.json` at project root
- Playwright MCP snippet printed to stdout — merge into `~/.gemini/settings.json`

## Install

```
gemini extensions install <repo-url>
```

## Usage

Run `/visual-qa-gemini`. The skill emits the config and the MCP snippet.

## MVP scope

This is **scaffold-only**. The full 6-phase pipeline lives in
`plugins/harness-floor/skills/visual-qa/SKILL.md` (Claude Code). Porting
to Gemini requires its subagent dispatch primitive (still under
investigation — likely `activate_skill` calls plus `run_shell_command`
subprocesses) and is tracked as a future spec.

For now, run Playwright commands via `run_shell_command` and have the
model analyze captured images via `read_file` and the configured LLM.
