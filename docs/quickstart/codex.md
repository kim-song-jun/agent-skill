> Korean: [codex.ko.md](codex.ko.md)

# Codex CLI Quickstart

Scope: install the Codex CLI plugin bundle and confirm that Codex skill files
are visible. Codex uses canonical public command names, while runtime dispatch
uses Codex's current skill and prompt-level surfaces.

## Install

Register the marketplace once in Claude Code if it is not already added:

```text
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

Then install the Codex plugin set from a terminal:

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --cli=codex
```

## Verify

```bash
find ~/.codex/plugins/cache/agent-skill -maxdepth 7 -name SKILL.md | sort | grep -E '/(codex-init|agent-all-codex|visual-qa-codex|thrift-codex|debug-codex)/SKILL.md'
```

## Installed Means

Codex can load the installed `agent-skill` plugin bundle from its local plugin
cache. Target repository files are not created until `/agent-init` runs in a
project.

## Next Step

Open the project you want to harness and run `/agent-init` in Codex. See
[Usage](../USAGE.md) for project-local setup.
