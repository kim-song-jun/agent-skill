# harness-builder-cursor

Run an `agent-init`-style scaffold inside Cursor. Emits:

- `.cursor/rules/agent-init.mdc` at project root
- `.cursor/agents/<role>.md` per role
- `AGENTS.md` as the cross-platform fallback

## Install

Cursor does not have an automated plugin loader. Use the manual install script:

```bash
bash plugins/harness-builder-cursor/bin/install.sh /path/to/project
```

## Usage

Run `bash plugins/harness-builder-cursor/bin/install.sh /path/to/project` (Cursor: manual install). The skill scaffolds:

- Project purpose
- Size (small/medium/large)
- QA personas
- Deploy targets

## Out of scope (MVP)

This iteration renders memory + role files only. Hooks, MCP wiring, brainstorm integration come in follow-ups.

See `docs/superpowers/specs/2026-05-18-cross-platform-plugins-design.md`.
