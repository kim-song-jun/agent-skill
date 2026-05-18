# Cross-platform harness-builder plugins (Codex / Copilot / Gemini / Cursor)

**Date:** 2026-05-18
**Status:** Draft — design for new plugin family
**Scope:** Add four new plugins to the marketplace so users on Codex CLI, GitHub Copilot CLI, Gemini CLI, and Cursor can run a harness-builder-equivalent inside their tool of choice.

## Problem

`harness-builder` and `harness-floor` today are Claude Code plugins. They render `CLAUDE.md`, `.claude/agents/`, `.claude/settings.local.json`, and Claude-Code-style hooks. Engineers using Codex CLI, Copilot CLI, Gemini CLI, or Cursor cannot adopt the same harness pattern without manual porting.

## Goal

Ship four new sibling plugins in this repo so users on each platform get equivalent project memory + role guidance + (where applicable) hooks and MCP wiring:

- `harness-builder-codex`
- `harness-builder-copilot`
- `harness-builder-gemini`
- `harness-builder-cursor`

Each provides at minimum an `<platform>-init` skill that scaffolds the right artifacts for that tool. The four plugins are listed in `marketplace.json` and discoverable in their respective platforms.

## Non-goals

- Porting `visual-qa` or `agent-all` (harness-floor) skills. They depend on Playwright MCP, Skill-tool subagent dispatch, and other Claude-Code-specific machinery that varies sharply across platforms. Out of scope for this spec.
- Building a unified abstract "plugin SDK" or runtime polyfill. We ship per-platform plugins, each idiomatic for its host. Shared logic is vendored (each plugin keeps its own copy of small lib files) rather than cross-imported across plugin boundaries.
- Translating every Claude-Code-specific tool call in every existing SKILL.md. Per-platform plugins use platform-native tool names directly.
- Full feature parity with `harness-builder/agent-init` in this iteration. The MVP is memory-file rendering plus minimal role/agent files. Hooks, MCP wiring, brainstorm integration, plugin scanning come in follow-ups.

## Cross-platform research summary (grounded)

Verified against official docs/source per platform (citations in spec appendix).

| Surface | Claude Code | Codex CLI | Copilot CLI | Gemini CLI | Cursor |
|---|---|---|---|---|---|
| Project memory | `CLAUDE.md` | `AGENTS.md` (+ `AGENTS.override.md`) | `.github/copilot-instructions.md` + `AGENTS.md` | `GEMINI.md` | `.cursor/rules/*.mdc` (+ honors `AGENTS.md`) |
| Global memory | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.copilot/` (settings, no memory file) | `~/.gemini/GEMINI.md` | IDE settings only |
| Skill manifest | `SKILL.md` (yaml frontmatter: `name`, `description`, `tools`) | `.codex/skills/<n>/SKILL.md` (yaml: `name`, `description`) | `~/.agents/skills/<n>/SKILL.md` (yaml: `name`, `description`) | `.gemini/skills/<n>/SKILL.md` or `.agents/skills/<n>/SKILL.md` (yaml: `name`, `description`) | None (uses subagent files instead) |
| Subagent roles | `.claude/agents/<role>.md` | (community: `.codex/agents/`) | Multi-agent task tools | (via skills) | `.cursor/agents/<name>.md` (also reads `.claude/agents/`, `.codex/agents/`) |
| Plugin manifest | `.claude-plugin/plugin.json` | `plugin.json` (Open Plugin spec) | `.claude-plugin/plugin.json` or `.plugin/plugin.json` (Open Plugin spec) | `gemini-extension.json` | None |
| Hooks | `settings.json` `hooks` (`PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`) | `~/.codex/config.toml` `[hooks]` (same event names) | `.github/hooks/` + `~/.copilot/hooks/` (PascalCase events) | `settings.json` `hooks` (`BeforeTool`, `AfterTool`, `BeforeModel`, `SessionStart`/`SessionEnd`) | None |
| MCP config | `.claude/settings.local.json` `mcpServers` | `~/.codex/config.toml` `[mcp_servers.*]` | `~/.copilot/mcp-config.json` + `.mcp.json` | `settings.json` `mcpServers` | `.cursor/mcp.json` `mcpServers` |

**Key takeaways exploited by this design:**

1. **`AGENTS.md` is a de-facto cross-platform standard.** Codex, Cursor, and Copilot all read it natively. Gemini and Claude Code can be configured to honor it. We make `AGENTS.md` the canonical memory artifact emitted by every new plugin (plus a platform-native file alongside it when needed).
2. **Open Plugin spec (`.claude-plugin/plugin.json`)** is already understood by Codex and Copilot CLI natively. The Codex and Copilot plugins re-use the same manifest shape as the existing `harness-builder` — no new format invention.
3. **Skill frontmatter is converging** on `name` + `description`. Codex/Copilot/Gemini all read the same minimal shape. Our skills use only those two fields so they are portable; Claude-Code-specific `tools:` lists are omitted from per-platform skills.
4. **"Antigravity" is not a public product as of 2026-05.** The actually shipping Google CLI agent is **Gemini CLI** (`@google/gemini-cli`). We name the plugin `harness-builder-gemini` and note "antigravity" in the description as a colloquial alias for users searching.

## Architecture

```
plugins/
├── harness-builder/           # existing (Claude Code)
├── harness-floor/             # existing (Claude Code)
├── harness-builder-codex/     # new
├── harness-builder-copilot/   # new
├── harness-builder-gemini/    # new
└── harness-builder-cursor/    # new
```

Each new plugin is **self-contained**:
- Its own `.claude-plugin/plugin.json` (or `gemini-extension.json` for Gemini)
- One skill: `<platform>-init`
- Its own `templates/` with the right memory file for that platform
- Its own vendored copy of `lib/render.mjs` and `lib/detect-stack.mjs` from `harness-builder` (copy-on-update; lib files total <200 lines, cost of vendoring is low; YAGNI on a shared package)
- A short `README.md`

The four new plugins do not import from each other or from `harness-builder`. This keeps each plugin independently installable.

### What each `<platform>-init` skill produces

| Plugin | Skill name | Artifacts emitted in user project |
|---|---|---|
| `harness-builder-codex` | `/codex-init` | `AGENTS.md` (project root), `.codex/skills/<roles>/SKILL.md` per role, optional `.codex/config.toml` snippet for MCP |
| `harness-builder-copilot` | `/copilot-init` | `.github/copilot-instructions.md`, `AGENTS.md` (both, deduplicated by CLI), `.github/hooks/` placeholder dir, optional `~/.copilot/mcp-config.json` snippet |
| `harness-builder-gemini` | `/gemini-init` | `GEMINI.md`, `.gemini/skills/<roles>/SKILL.md` per role, optional `.gemini/settings.json` with `mcpServers` |
| `harness-builder-cursor` | `/cursor-init` | `.cursor/rules/agent-init.mdc` (`alwaysApply: true`), `.cursor/agents/<role>.md` per role, optional `.cursor/mcp.json` |

All four also produce `AGENTS.md` at project root as the cross-platform fallback so a user can switch tools without re-running init.

### Template strategy

Each new plugin owns a slim `templates/` directory:

- One memory-file template (e.g., `AGENTS.md.hbs`, `GEMINI.md.hbs`, `copilot-instructions.md.hbs`, `.mdc.hbs` for Cursor rules)
- One role-file template per platform's role convention (e.g., `agents/<role>.md.hbs` for Codex/Cursor; `skills/<role>/SKILL.md.hbs` for Codex/Gemini; etc.)
- The render engine is the existing `lib/render.mjs` (mustache-subset, no Handlebars helpers).

Templates are kept simple in this iteration — the same discovery context (`{ purpose, stack, runtime, services_str, deploy_targets, constraints, agents }`) is rendered through each platform's template. The harness-builder rendering pipeline (`detectProject`, `agents` array, etc.) is reused.

### Skill discovery and runtime

Per platform:

- **Codex CLI**: drops the plugin into `~/.agents/plugins/` or the user's marketplace. Codex picks up `plugin.json` automatically. The `/codex-init` slash command is exposed because the plugin declares it via `plugin.json`'s `skills` field pointing to the `SKILL.md` directory.
- **Copilot CLI**: same `plugin.json` Open Plugin spec is recognized. User installs via `copilot plugin install <repo>`.
- **Gemini CLI**: needs `gemini-extension.json` at plugin root in addition to `plugin.json`. The Gemini variant has both files; Gemini reads its own manifest, others ignore it.
- **Cursor**: no plugin system. The Cursor plugin is documentation + a manual `bin/install.sh` (or `npm run install`) that copies the `templates/` outputs into the user's project. Strictly opt-in.

### Skill content portability

Each `<platform>-init` SKILL.md is **rewritten to use platform-native tool names**. The existing harness-builder/agent-init SKILL.md references `Skill`, `mcp__plugin_context-mode_context-mode__ctx_batch_execute`, `TaskCreate` — none of these exist in Codex/Copilot/Gemini/Cursor. Per-platform skills use:

- Codex: `apply_patch`, `shell_command`, `exec_command`
- Copilot: `apply_patch`, `read_bash`, `grep`, `glob`, `ask_user`, `store_memory`
- Gemini: `read_file`, `write_file`, `replace`, `run_shell_command`, `activate_skill`, `glob`, `grep_search`
- Cursor: abstract narrative (Cursor doesn't expose explicit tool names; the SKILL.md is more of an instructional file for users)

This means each skill is mostly hand-written prose adapted to the host platform's idioms. We do NOT generate skills via a translation pipeline — that's a future optimization.

## Marketplace.json updates

The repo's `.claude-plugin/marketplace.json` gains four new entries:

```json
{ "name": "harness-builder-codex",     "source": "./plugins/harness-builder-codex",     "description": "Run agent-init for Codex CLI projects — emits AGENTS.md + .codex/skills/" },
{ "name": "harness-builder-copilot",   "source": "./plugins/harness-builder-copilot",   "description": "Run agent-init for GitHub Copilot CLI projects — emits .github/copilot-instructions.md + AGENTS.md" },
{ "name": "harness-builder-gemini",    "source": "./plugins/harness-builder-gemini",    "description": "Run agent-init for Gemini CLI (a.k.a. 'antigravity') projects — emits GEMINI.md + .gemini/skills/" },
{ "name": "harness-builder-cursor",    "source": "./plugins/harness-builder-cursor",    "description": "Run agent-init for Cursor projects — emits .cursor/rules + .cursor/agents/" }
```

## Tests

For this iteration we test only what we can verify mechanically:

1. **Template render snapshots.** Each plugin's memory template renders deterministically with a representative ctx → committed snapshot. Reuse the existing `render.test.mjs` FIXTURES pattern.
2. **Plugin manifest validity.** A small test asserts each new `plugin.json` parses and has the required fields (`name`, `version`, `description`). For Gemini, also `gemini-extension.json` is parseable JSON.
3. **Marketplace.json schema sanity.** Existing tests already validate this; add the four new entries and re-run.
4. **Cross-plugin self-containment.** A test grep asserts that no `import` in any new plugin's `lib/` reaches outside its own plugin directory.

End-to-end runtime testing inside Codex / Copilot / Gemini / Cursor is **manual** — the user runs the slash command in each tool and verifies the artifacts appear. We document the manual check in each plugin's README.

## Risks

- **Skill content drift.** Hand-written per-platform skills will diverge as `agent-init` evolves. Mitigation: write each SKILL.md to delegate to the same `templates/` files; only the prose differs.
- **Open Plugin spec drift.** Codex and Copilot both read `.claude-plugin/plugin.json` today but the spec is unstable. If a field name changes, all three plugins (existing + Codex + Copilot) need updates. Acceptable risk — single point of update.
- **Cursor has no plugin system.** Users must manually run an install script. We document this clearly. If Cursor adds a plugin format later, we adopt it.
- **Antigravity might launch.** If Google ships an "Antigravity" product distinct from Gemini CLI, this design needs revisit. Plugin name is `harness-builder-gemini` to be accurate today; alias in description.

## Out-of-scope (future sessions)

- Visual-qa / agent-all parity on each platform
- Real subagent dispatch via each platform's primitive (Codex `agent` hooks, Copilot `task`, Gemini's task tools, Cursor subagents)
- Generated test matrix that boots each CLI in CI and runs `<platform>-init` against fixtures
- Brainstorm/clarification flow inside each platform — currently each plugin assumes inputs are passed via flags rather than interactively gathered

## Implementation phasing (for the plan)

Phase A: scaffolding (Tasks 1–4)
- `plugin.json` + minimal README + directory layout for all four plugins
- Marketplace entries

Phase B: memory + role rendering (Tasks 5–8)
- `templates/` + vendored lib per plugin
- `SKILL.md` per plugin
- Render path connecting discovery ctx → memory file output

Phase C: tests + docs (Tasks 9–10)
- Snapshot tests
- Manifest validity test
- Cross-plugin self-containment test
- CHANGELOG (EN + KO) + repo README cross-link

Phase D: out-of-scope tracking (Task 11)
- One follow-up spec file enumerating what remains per platform

The plan elaborates each task with file paths and code blocks.
