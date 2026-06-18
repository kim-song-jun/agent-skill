> Korean: [copilot.ko.md](copilot.ko.md)

# Copilot CLI Quickstart

Scope: write the GitHub Copilot project scaffold and confirm that Copilot
instructions are present. Copilot CLI does not have a comparable
agent-workflow marketplace, so this path writes project-local files.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=copilot --target=/path/to/my-project
```

## Verify

```bash
test -f /path/to/my-project/.github/copilot-instructions.md
```

## Installed Means

The target project now has Copilot-oriented `agent-skill` instructions and
support files. This is the project-local bootstrap path for Copilot, not a
Claude-native hook install.

## Next Step

Open the target repository with Copilot and ask it to follow
`.github/copilot-instructions.md`. See [Usage](../USAGE.md) for the workflow
that corresponds to `/agent-init` and `/agent-all`.
