# harness-builder-codex

Run an operational `agent-init`-style scaffold inside Codex CLI. The default
profile is heavy; pass `--lite` for the minimal scaffold.

Emits:

- `AGENTS.md` at project root
- folder-level `AGENTS.md` guides for detected app/package directories
- `.codex/skills/<role>/SKILL.md` per role
- `.codex/hooks/agent-policy-hook.mjs`
- task-ledger files under `docs/tasks/`
- a current `~/.codex/config.toml` snippet on stdout using command-hook tables
  such as `[[hooks.PreToolUse]]`

## Install

```bash
./scripts/install-platform.sh --platform=codex --target=/path/to/project
```

Use `--force` when intentionally replacing generated artifacts in an existing
project.

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

## Codex Hook Surface

Codex command hooks are used for shell/policy events only. The floor pipeline's
agent-level decision and reviewer protocol is prompt-level because current
Codex command hooks do not expose Claude Code's Task-style subagent dispatch
surface.

See `docs/superpowers/specs/2026-06-01-operational-agent-init-agent-all-design.md`.
