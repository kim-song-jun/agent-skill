> Korean: [vscode-copilot.ko.md](vscode-copilot.ko.md)

# VS Code Copilot Quickstart

Scope: write the VS Code Copilot instructions-only surface and confirm that
the target project has Copilot instructions.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=vscode-copilot --target=/path/to/my-project
```

## Verify

```bash
test -f /path/to/my-project/.github/copilot-instructions.md
```

## Installed Means

VS Code Copilot can read the generated project instructions. The current
release does not provide runtime hook enforcement for this editor-only host.

## Next Step

Open the target repository in VS Code with Copilot enabled. This
instructions-only surface is the VS Code Copilot equivalent of `/agent-init`;
see [Usage](../USAGE.md) for the supported workflow boundaries.
