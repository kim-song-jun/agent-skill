> Korean: [codex.ko.md](codex.ko.md)

# Codex CLI Quickstart

Scope: install the Codex CLI plugin bundle and confirm that Codex skill files
are visible. Codex uses canonical public command names, while runtime dispatch
uses Codex's current skill and prompt-level surfaces.

## Install

Codex CLI 0.140.0 and newer include a native plugin manager. From an
`agent-skill` checkout, use the native updater:

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
cd /tmp/agent-skill
./scripts/update-codex-plugins.sh
```

Manual fallback uses the same singular Codex plugin surface. Register the
marketplace once:

```bash
codex plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

If the marketplace is already configured, refresh its snapshot instead:

```bash
codex plugin marketplace upgrade agent-skill
```

Then install or refresh the Codex plugin set:

```bash
codex plugin add harness-builder-codex@agent-skill
codex plugin add harness-floor-codex@agent-skill
codex plugin add harness-thrift-codex@agent-skill
codex plugin add harness-debug-codex@agent-skill
```

## Verify

```bash
codex plugin list | grep -E 'harness-(builder|floor|thrift|debug)-codex@agent-skill[[:space:]]+installed, enabled'
```

## Installed Means

Codex can load the installed `agent-skill` plugin bundle from its native plugin
manager. Target repository files are not created until `/agent-init` runs in a
project.

## Next Step

Open the project you want to harness and run `/agent-init` in Codex. See
[Usage](../USAGE.md) for project-local setup.
