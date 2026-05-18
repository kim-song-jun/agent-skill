# harness-builder-codex

Run an `agent-init`-style scaffold inside Codex CLI. Emits:

- `AGENTS.md` at project root
- `.codex/skills/<role>/SKILL.md` per role
- `AGENTS.md` as the cross-platform fallback

## Install

```bash
codex plugins install <repo-url>
```

Note: confirm exact install command with your Codex CLI version — best-effort instruction.

## Usage

Run `/codex-init` inside Codex CLI. The skill scaffolds:

- Project purpose
- Size (small/medium/large)
- QA personas
- Deploy targets

## Out of scope (MVP)

This iteration renders memory + role files only. Hooks, MCP wiring, brainstorm integration come in follow-ups.

See `docs/superpowers/specs/2026-05-18-cross-platform-plugins-design.md`.
