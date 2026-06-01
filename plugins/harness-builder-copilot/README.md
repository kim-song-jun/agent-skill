# harness-builder-copilot

Operational builder scaffold for GitHub Copilot CLI. The renderer writes the
project-local guidance and role files that Copilot can load from a repository,
then prints the MCP config snippet for manual merge.

Emits:

- `.github/copilot-instructions.md`
- `AGENTS.md`
- `.github/instructions/planner.instructions.md`
- `.github/instructions/dev.instructions.md`
- `.github/instructions/reviewer.instructions.md`
- `.github/hooks/preToolUse.json`
- `.github/hooks/postToolUse.json`
- `.github/hooks/agentStop.json`
- MCP snippet printed to stdout for `~/.copilot/mcp-config.json`

## Install

```bash
./scripts/install-platform.sh --platform=copilot --theme=builder --target=/path/to/project
```

Use `--platform=vscode-copilot` when you only want the VS Code Copilot
instructions surface; that path writes `.github/copilot-instructions.md` only.

## Usage

Open Copilot CLI or Copilot chat in the target repository and ask it to follow
`.github/copilot-instructions.md` for planning, implementation, and review.
The role-specific instructions in `.github/instructions/` define the planner,
developer, and reviewer behavior.

`install-platform.sh` writes project-local files only. Merge the printed MCP
snippet into `~/.copilot/mcp-config.json` after review.
