# harness-builder-codex

Run an operational `agent-init`-style scaffold inside Codex CLI. The default
profile is heavy; pass `--lite` for the minimal scaffold.

Emits:

- `AGENTS.md` at project root
- folder-level `AGENTS.md` guides for detected app/package directories
- `.codex/skills/<role>/SKILL.md` per role
- `.codex/hooks/agent-policy-hook.mjs`
- task-ledger files under `docs/tasks/`
- operational workspace directories under `docs/superpowers/specs/`,
  `docs/superpowers/plans/`, and `docs/decisions/`
- a current `~/.codex/config.toml` snippet on stdout using command-hook tables
  such as `[[hooks.PreToolUse]]`

## Install

```bash
./scripts/install-platform.sh --platform=codex --target=/path/to/project
./scripts/install-platform.sh --platform=codex --target=/path/to/project --update-foundations
```

Use `--force` when intentionally replacing generated artifacts in an existing
project. `--update-foundations` refreshes only the approved foundation plugins
through `scripts/update.sh --foundations-only`; combine it with `--dry-run` to
print the exact plan without calling `claude`. Codex `all`, `builder`, and
`--lite` installs run the post-install doctor automatically; pass
`--no-doctor` only when intentionally deferring validation.

Manual doctor re-run from the plugin bundle:

```bash
node /path/to/harness-builder-codex/bin/doctor.mjs --target=/path/to/project --platform=codex
```

From a source checkout, `node scripts/doctor.mjs ...` is the equivalent
compatibility wrapper.

## Usage

Run `/codex-init` inside Codex CLI. The skill scaffolds:

- Project purpose
- Size (small/medium/large)
- QA personas
- Deploy targets
- Operational task ledger and role roster
- Policy hook files

Lite mode:

```
/codex-init --lite
```

Lite mode keeps root guidance and the minimal skill roster, and skips task
ledger, policy hooks, and config patch prompts.

Language:

```
/codex-init --lang=ko
```

Records the selected interaction language in `AGENTS.md`. Keep `.agent-all.json`
`language` aligned when installing the floor bundle so downstream workflow
prompts use the same language.

Foundation updates:

```
/codex-init --update-foundations
/codex-init --dry-run --update-foundations
```

This prints the approved foundation update plan and updates/installs only
`superpowers@claude-plugins-official` and `context-mode@context-mode` when not
in dry-run mode. It does not patch global Codex config files.

## Codex Hook Surface

Codex command hooks are used for shell/policy events only. The floor pipeline's
agent-level decision and reviewer protocol is prompt-level because current
Codex command hooks do not expose Claude Code's Task-style subagent dispatch
surface.

See `docs/superpowers/specs/2026-06-01-operational-agent-init-agent-all-design.md`.
