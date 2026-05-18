# harness-builder-gemini

Run an `agent-init`-style scaffold inside Gemini CLI. Emits:

- `GEMINI.md` at project root
- `.gemini/skills/<role>/SKILL.md` per role
- `AGENTS.md` as the cross-platform fallback

## Install

```bash
gemini extensions install <repo-url>
```

## Usage

Run `/gemini-init` inside Gemini CLI. The skill scaffolds:

- Project purpose
- Size (small/medium/large)
- QA personas
- Deploy targets

## Out of scope (MVP)

This iteration renders memory + role files only. Hooks, MCP wiring, brainstorm integration come in follow-ups.

See `docs/superpowers/specs/2026-05-18-cross-platform-plugins-design.md`.
