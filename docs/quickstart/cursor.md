> Korean: [cursor.ko.md](cursor.ko.md)

# Cursor Quickstart

Scope: write the Cursor project scaffold and confirm that Cursor rules and
agent assets are present.

## Install

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh --platform=cursor --target=/path/to/my-project
```

## Verify

```bash
test -f /path/to/my-project/.cursor/rules/agent-init.mdc
test -f /path/to/my-project/.cursor/rules/agent-all.mdc
```

## Installed Means

The target project now has Cursor rules, agent assets, and harness config
files. Enforcement strength depends on Cursor's host surfaces, so this is not
Claude-style hard hook parity.

## Next Step

Open the target repository in Cursor and use the generated rules and agents.
This project-local bootstrap is the Cursor equivalent of `/agent-init`; see
[Usage](../USAGE.md) for workflow examples.
