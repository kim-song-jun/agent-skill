# harness-builder-copilot

Run an `agent-init`-style scaffold inside GitHub Copilot CLI. Emits:

- `.github/copilot-instructions.md` at project root
- `.github/instructions/<role>.instructions.md` per role
- `AGENTS.md` as the cross-platform fallback

## Install

```bash
copilot plugin install <repo-url>
```

## Usage

Run `/copilot-init` inside GitHub Copilot CLI. The skill scaffolds:

- Project purpose
- Size (small/medium/large)
- QA personas
- Deploy targets

## Out of scope (MVP)

This iteration renders memory + role files only. Hooks, MCP wiring, brainstorm integration come in follow-ups.

See `docs/superpowers/specs/2026-05-18-cross-platform-plugins-design.md`.
