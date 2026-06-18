> Korean: [claude.ko.md](claude.ko.md)

# Claude Code Quickstart

Scope: install the Claude Code plugin bundle and confirm that Claude can see
the selected `agent-skill` plugins.

## Install

Run once in Claude Code:

```text
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/plugin install harness-data@agent-skill
/reload-plugins
```

For a faster terminal path, use:

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --claude-code
```

## Verify

```bash
cat ~/.claude/plugins/installed_plugins.json | python3 -m json.tool | grep -B1 agent-skill
```

## Installed Means

Claude Code can see the selected marketplace plugins. Project files are not
created until you run `/agent-init` in a target repository.

## Next Step

Open the project you want to harness and run `/agent-init`. See
[Usage](../USAGE.md) for project-local setup.
