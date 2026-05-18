# visual-qa porting across platforms — design

**Date:** 2026-05-18
**Status:** Draft
**Scope:** Scaffold-level visual-qa support on Codex / Copilot / Gemini. Cursor remains docs-only.

## Problem

`harness-floor/visual-qa` is a 6-phase Claude Code skill that drives Playwright MCP to capture screenshot matrices, fan out per-page LLM analysis to subagents, diff against prior runs, and emit reports. It depends on three Claude-Code-specific layers:

1. **Playwright MCP** — fetched via Claude Code's plugin marketplace; tool names look like `mcp__plugin_playwright_playwright__browser_*`.
2. **Subagent dispatch** — via `superpowers:dispatching-parallel-agents` which uses Claude Code's `Task`/`Skill` tools.
3. **Project state** — `.visual-qa-state.json` written via Claude Code's `Write` tool.

Porting this to Codex / Copilot / Gemini at runtime parity would require redesigning each layer: per-platform MCP tool naming (Codex `mcp_<server>_<tool>`, Gemini `mcp_<server>_<tool>`, Copilot `mcp_<server>_<tool>`), per-platform parallel-dispatch primitive (Codex `agent` hook type, Copilot `task` tool, Gemini's lack of formal subagents), and per-platform file I/O tool names (Codex `apply_patch`, Gemini `write_file`, Copilot's `apply_patch` + `read_bash`).

## Goal

Ship **scaffold-level** visual-qa support on three platforms in this iteration. Each platform gets a new sibling plugin `harness-floor-<platform>` that:

1. Emits a `.visual-qa.json` config template (same shape as the Claude Code version).
2. Emits a Playwright MCP server entry to the platform's native MCP config location.
3. Ships a SKILL.md that documents the visual-qa workflow using the platform's tool names but **does not** implement the full 6-phase orchestrator. The skill states explicitly that the orchestration loop is a future iteration.

For Cursor, ship documentation only — Cursor has no skill-execution surface, so the user would invoke the workflow manually via Cursor's chat with a checklist.

## Non-goals

- Full per-platform reimplementation of the 6-phase orchestrator. That's a separate spec per platform.
- Per-platform subagent-driven parallel page analysis. Each platform's subagent primitive needs its own design.
- Cross-platform sharing of `lib/matrix-builder.mjs`, `lib/cost-estimator.mjs`, `lib/diff-runs.mjs`. These are vendored-as-needed when full implementations land per platform.
- Runtime verification (we can't run Codex/Copilot/Gemini CLIs in this environment).

## Architecture

```
plugins/
├── harness-floor/            # existing (Claude Code) — unchanged
├── harness-floor-codex/      # new
├── harness-floor-copilot/    # new
└── harness-floor-gemini/     # new
```

Each new plugin is **scaffold-only**:

- `.claude-plugin/plugin.json` — Open Plugin spec (Codex/Copilot natively read this; included for marketplace).
- `gemini-extension.json` (Gemini plugin only).
- `skills/visual-qa-<platform>/SKILL.md` — documents the workflow, references platform-native tools, and points users to the source `harness-floor/visual-qa/SKILL.md` for the underlying logic.
- `skills/visual-qa-<platform>/templates/`:
  - `.visual-qa.json.hbs` — same shape as the Claude Code version, renders identically.
  - Platform-specific MCP config snippet (Codex `config.toml` `[mcp_servers.playwright]` block, Copilot `mcp-config.json` snippet, Gemini `settings.json` `mcpServers.playwright` entry).
- `README.md` — install instructions for the host CLI.

Cursor receives a section appended to `plugins/harness-builder-cursor/README.md` (or a new `docs/visual-qa-cursor.md`) explaining the manual workflow.

### Marketplace entries

Three new entries in `.claude-plugin/marketplace.json`:

```json
{ "name": "harness-floor-codex",   "source": "./plugins/harness-floor-codex",   "description": "visual-qa scaffold for Codex CLI — emits .visual-qa.json + Playwright MCP entry" },
{ "name": "harness-floor-copilot", "source": "./plugins/harness-floor-copilot", "description": "visual-qa scaffold for Copilot CLI" },
{ "name": "harness-floor-gemini",  "source": "./plugins/harness-floor-gemini",  "description": "visual-qa scaffold for Gemini CLI" }
```

### Per-platform Playwright MCP entries

| Platform | Config target | Snippet |
|---|---|---|
| Codex | `~/.codex/config.toml` (user-level) or `.codex/config.toml` (project) | `[mcp_servers.playwright]` with `command = "npx"`, `args = ["-y", "@playwright/mcp@latest"]` |
| Copilot | `~/.copilot/mcp-config.json` or workspace `.mcp.json` | `{ "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] } } }` |
| Gemini | `~/.gemini/settings.json` or `.gemini/settings.json` | `{ "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] } } }` |

The exact Playwright MCP package name (`@playwright/mcp@latest`) is from the Microsoft Playwright MCP project, the standard implementation in 2026. If users prefer a different MCP, they edit the rendered config.

### `.visual-qa.json` template

Reused verbatim from `harness-floor/visual-qa/templates/visual-qa.config.json.hbs`. The config shape is platform-agnostic — it describes what to capture, not how to dispatch. The platform-specific runner consumes the same config.

## Tests

1. **Manifest validity** — extend `tests/lib/cross-platform-manifest.test.mjs` to cover the 3 new plugins.
2. **Render** — test that each plugin's `.visual-qa.json.hbs` renders correctly with a fixed ctx, and that the MCP snippet template renders.
3. **Isolation** — extend the cross-plugin isolation test to cover the new directories.

## Risks

- **Playwright MCP package name may drift.** We pin to `@playwright/mcp@latest`. If the published name changes (e.g., a fork takes over), all three plugins need updates. Mitigation: documented in README; users can edit the rendered config.
- **MCP config snippets are emit-only.** We do not write to `~/.codex/config.toml` etc. — we print snippets for the user to merge. This avoids destructive edits to user-level files.
- **Stub orchestration may mislead users.** Each SKILL.md is documentation, not a working pipeline. We flag this clearly with a "MVP scaffold — orchestrator TBD" header.

## Out of scope (per-platform follow-ups)

- Full 6-phase orchestrator port for each platform (separate specs per platform)
- Subagent-driven parallel page analysis using each platform's primitive
- Per-platform state file management
- agent-all porting (separate decomposition spec)

## Decomposition for future agent-all porting

agent-all is even more Claude-Code-coupled than visual-qa: it relies on `superpowers:writing-plans`, `superpowers:subagent-driven-development`, wave-dispatch over the agent roster, and a break-condition loop. Each platform's equivalent:

- **Codex CLI**: research `[hooks]` `agent` handler type. May allow programmatic subagent dispatch. Separate research spike needed.
- **Copilot CLI**: has `task` / `read_agent` / `list_agents` tools. Likely a clean fit but the dispatch contract differs from Claude Code's.
- **Gemini CLI**: subagent dispatch primitive unclear; may need to compose `activate_skill` calls plus shell subprocesses.
- **Cursor**: native subagent format. Cursor delegates automatically based on subagent description — no manual dispatch.

Per-platform agent-all spec needed for each. **Defer to dedicated session per platform** — the porting work for each is comparable in size to the original agent-all skill.
