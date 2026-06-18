> Korean: [gemini.ko.md](gemini.ko.md)

# Gemini CLI Quickstart

Scope: write the Gemini CLI project scaffold and confirm that Gemini memory and
skill assets are present.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=gemini --target=/path/to/my-project
```

## Verify

```bash
test -f /path/to/my-project/GEMINI.md
test -f /path/to/my-project/.gemini/skills/planner/SKILL.md
```

## Installed Means

The target project now has Gemini memory and skill files. MCP/settings
integration remains host-specific and is not Claude-style hook parity.

## Next Step

Open the target repository with Gemini CLI. This project-local bootstrap is the
Gemini equivalent of `/agent-init`; see [Usage](../USAGE.md) for workflow
examples.
