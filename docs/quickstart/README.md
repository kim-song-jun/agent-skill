> Korean: [README.ko.md](README.ko.md)

# Platform Quickstart

Use this page when you want the shortest install path for your agent host and
one command that confirms the installed plugin, skill, rule, or instruction
surface is visible.

This page is intentionally narrow. It does not replace the full project setup
guide. After verification, continue with `/agent-init` or the matching
project-local platform bootstrap in [Usage](../USAGE.md).

## Install Decision Table

| Host | Use this quickstart | What it verifies |
|---|---|---|
| Claude Code | [Claude Code](claude.md) | Claude plugin marketplace install is visible |
| Codex CLI | [Codex CLI](codex.md) | Codex plugin bundle and skills are visible |
| Copilot CLI | [Copilot CLI](copilot.md) | Copilot project scaffold files are present |
| Cursor | [Cursor](cursor.md) | Cursor rules and agent assets are present |
| Gemini CLI | [Gemini CLI](gemini.md) | Gemini memory and skill assets are present |
| VS Code Copilot | [VS Code Copilot](vscode-copilot.md) | Instructions-only assets are present |

## Next Step

After this quickstart passes, open the repository you want to harness and run
the appropriate project setup. Claude and Codex users can use `/agent-init`.
Other hosts use `install-platform.sh`, which writes that host's project-local
equivalent. See [Usage](../USAGE.md) for the project-local flow and
[Harness Positioning](../HARNESS_POSITIONING.md) for comparison with other
harnesses.
