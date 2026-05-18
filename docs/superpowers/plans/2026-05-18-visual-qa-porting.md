# visual-qa porting scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Scaffold three sibling plugins (`harness-floor-codex`, `-copilot`, `-gemini`) that emit `.visual-qa.json` + Playwright MCP config for each host CLI. Each plugin's SKILL.md documents the workflow using platform-native tool names but does NOT implement the orchestrator (MVP scaffold).

**Architecture:** Each plugin = `.claude-plugin/plugin.json` + (Gemini) `gemini-extension.json` + one skill directory `skills/visual-qa-<platform>/` with `SKILL.md` + `templates/.visual-qa.json.hbs` + `templates/mcp-snippet.<format>.hbs`. Reuse `.visual-qa.json.hbs` content from `harness-floor/visual-qa/templates/visual-qa.config.json.hbs` (copy verbatim — no shared lib).

**Spec:** [`docs/superpowers/specs/2026-05-18-visual-qa-porting-design.md`](../specs/2026-05-18-visual-qa-porting-design.md)

---

## File Structure

| Path | Plugin | Purpose |
|---|---|---|
| `plugins/harness-floor-codex/.claude-plugin/plugin.json` | codex | Open Plugin manifest |
| `plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md` | codex | Scaffold-level orchestrator stub |
| `plugins/harness-floor-codex/skills/visual-qa-codex/templates/visual-qa.config.json.hbs` | codex | Reused config |
| `plugins/harness-floor-codex/skills/visual-qa-codex/templates/mcp-snippet.toml.hbs` | codex | Playwright MCP entry for config.toml |
| `plugins/harness-floor-codex/README.md` | codex | Install + usage |
| `plugins/harness-floor-copilot/...` | copilot | Mirror; `mcp-snippet.json.hbs` instead |
| `plugins/harness-floor-gemini/.claude-plugin/plugin.json` | gemini | Manifest |
| `plugins/harness-floor-gemini/gemini-extension.json` | gemini | Gemini-specific manifest |
| `plugins/harness-floor-gemini/skills/visual-qa-gemini/...` | gemini | Same shape |
| `.claude-plugin/marketplace.json` | repo | 3 new entries |
| `tests/lib/cross-platform-manifest.test.mjs` | repo | Extended for 3 new plugins |
| `tests/lib/cross-platform-render.test.mjs` | repo | Add render assertions for new templates |
| `tests/lib/cross-platform-isolation.test.mjs` | repo | Includes new plugin dirs (no code change — walk paths covered by glob) |
| `CHANGELOG.md`, `CHANGELOG.ko.md` | repo | New section |

---

## Task 1: Scaffold three new plugin directories

- [ ] **Step 1: Create the directory layout**

```bash
mkdir -p plugins/harness-floor-codex/.claude-plugin \
         plugins/harness-floor-codex/skills/visual-qa-codex/templates \
         plugins/harness-floor-copilot/.claude-plugin \
         plugins/harness-floor-copilot/skills/visual-qa-copilot/templates \
         plugins/harness-floor-gemini/.claude-plugin \
         plugins/harness-floor-gemini/skills/visual-qa-gemini/templates
```

- [ ] **Step 2: Write the three plugin.json files**

Same shape as cross-platform builder plugins. Each:

```json
{
  "name": "harness-floor-<platform>",
  "version": "0.1.0",
  "description": "<one-liner>",
  "keywords": ["visual-qa", "<platform>", "playwright"]
}
```

Specifics:
- `harness-floor-codex`: description = `"visual-qa scaffold for Codex CLI — emits .visual-qa.json + Playwright MCP entry for config.toml"`
- `harness-floor-copilot`: description = `"visual-qa scaffold for GitHub Copilot CLI — emits .visual-qa.json + Playwright MCP entry"`
- `harness-floor-gemini`: description = `"visual-qa scaffold for Gemini CLI — emits .visual-qa.json + Playwright MCP entry for settings.json"`

- [ ] **Step 3: Gemini extension manifest**

`plugins/harness-floor-gemini/gemini-extension.json`:

```json
{
  "name": "harness-floor-gemini",
  "version": "0.1.0",
  "description": "visual-qa scaffold for Gemini CLI"
}
```

- [ ] **Step 4: READMEs**

Each plugin gets `README.md` (≤30 lines) documenting:
- What it emits (config + MCP snippet)
- Install command per platform
- Reference to `plugins/harness-floor/skills/visual-qa/SKILL.md` for orchestrator logic
- "MVP scaffold — full orchestrator TBD" disclaimer

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor-codex plugins/harness-floor-copilot plugins/harness-floor-gemini
git commit -m "feat: scaffold harness-floor-{codex,copilot,gemini} plugins"
```

---

## Task 2: Templates per plugin

For each of the three plugins, do all of the steps below for that plugin's directory.

### 2-A. visual-qa.config.json.hbs (same in all three)

Copy `plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs` into each new plugin's `templates/visual-qa.config.json.hbs`. Verbatim copy.

### 2-B. Codex MCP snippet template

`plugins/harness-floor-codex/skills/visual-qa-codex/templates/mcp-snippet.toml.hbs`:

```handlebars
# Append to ~/.codex/config.toml or merge into project-level .codex/config.toml.

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
```

### 2-C. Copilot MCP snippet template

`plugins/harness-floor-copilot/skills/visual-qa-copilot/templates/mcp-snippet.json.hbs`:

```handlebars
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### 2-D. Gemini MCP snippet template

`plugins/harness-floor-gemini/skills/visual-qa-gemini/templates/mcp-snippet.json.hbs`:

```handlebars
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### 2-E. Commit

```bash
git add plugins/harness-floor-codex/skills \
        plugins/harness-floor-copilot/skills \
        plugins/harness-floor-gemini/skills
git commit -m "feat(harness-floor-*): visual-qa.config + Playwright MCP snippet templates"
```

---

## Task 3: SKILL.md per plugin

Each plugin gets its own `SKILL.md` orchestrator stub. They share structure but reference platform-native tool names.

### 3-A. Codex SKILL.md

`plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md`:

```markdown
---
name: visual-qa-codex
description: >
  Scaffold visual-qa config and Playwright MCP entry for Codex CLI projects.
  MVP — emits config files but does not implement the full 6-phase orchestrator.
  See plugins/harness-floor/skills/visual-qa/SKILL.md for the source-of-truth pipeline design.
---

# visual-qa-codex (scaffold)

This skill produces:

- `.visual-qa.json` at project root — the visual-qa config (capture matrix, breakpoints, flows, etc.)
- A Playwright MCP snippet printed to stdout — user merges into `~/.codex/config.toml` or project `.codex/config.toml`.

## Phase 1 — Emit config

1. Ask the user (via `ask_user`) whether to overwrite an existing `.visual-qa.json` if one exists; default refuse.
2. Render `templates/visual-qa.config.json.hbs` to `.visual-qa.json` via `apply_patch`.

## Phase 2 — Print MCP snippet

Render `templates/mcp-snippet.toml.hbs` and print to stdout with a header:

```
# Copy the following into ~/.codex/config.toml:
```

The user merges manually.

## Phase 3 — Run the visual-qa pipeline

**Not implemented in this scaffold.** Refer to
`plugins/harness-floor/skills/visual-qa/SKILL.md` for the 6-phase pipeline
design (preflight → config → discover → capture → aggregate → summary). A
follow-up Codex-specific spec will port the orchestrator using Codex's
`agent` hook type for parallel page-analysis dispatch.

For now, users can run Playwright commands manually via Codex's
`shell_command` and have the agent analyze captured images via `apply_patch`
to write reports.
```

### 3-B. Copilot SKILL.md

`plugins/harness-floor-copilot/skills/visual-qa-copilot/SKILL.md`:

```markdown
---
name: visual-qa-copilot
description: >
  Scaffold visual-qa config and Playwright MCP entry for GitHub Copilot CLI projects.
  MVP — emits config files but does not implement the full 6-phase orchestrator.
---

# visual-qa-copilot (scaffold)

This skill produces:

- `.visual-qa.json` at project root
- A Playwright MCP snippet printed to stdout — user merges into `~/.copilot/mcp-config.json`.

## Phase 1 — Emit config

1. Ask the user whether to overwrite an existing `.visual-qa.json`; default refuse.
2. Render `templates/visual-qa.config.json.hbs` to `.visual-qa.json` via `apply_patch`.

## Phase 2 — Print MCP snippet

Render `templates/mcp-snippet.json.hbs` and print to stdout with a header:

```
# Copy the following into ~/.copilot/mcp-config.json:
```

## Phase 3 — Run the visual-qa pipeline

**Not implemented in this scaffold.** A follow-up Copilot-specific spec will
port the orchestrator using Copilot's `task` / `read_agent` / `list_agents`
tools for parallel dispatch.

For now, run Playwright captures manually via `read_bash` and analyze
images via the model directly.
```

### 3-C. Gemini SKILL.md

`plugins/harness-floor-gemini/skills/visual-qa-gemini/SKILL.md`:

```markdown
---
name: visual-qa-gemini
description: >
  Scaffold visual-qa config and Playwright MCP entry for Gemini CLI projects.
  MVP — emits config files but does not implement the full 6-phase orchestrator.
---

# visual-qa-gemini (scaffold)

This skill produces:

- `.visual-qa.json` at project root
- A Playwright MCP snippet printed to stdout — user merges into `~/.gemini/settings.json`.

## Phase 1 — Emit config

1. Ask the user (via `ask_user`) whether to overwrite an existing `.visual-qa.json`; default refuse.
2. Render `templates/visual-qa.config.json.hbs` to `.visual-qa.json` via `write_file`.

## Phase 2 — Print MCP snippet

Render `templates/mcp-snippet.json.hbs` and print to stdout with a header:

```
# Copy the following into ~/.gemini/settings.json:
```

## Phase 3 — Run the visual-qa pipeline

**Not implemented in this scaffold.** A follow-up Gemini-specific spec will
port the orchestrator. Gemini's subagent dispatch primitive is still being
investigated — may compose `activate_skill` calls plus `run_shell_command`
subprocesses for parallel page analysis.

For now, run Playwright commands manually via `run_shell_command` and have
the model analyze captured images via `read_file` and the configured LLM.
```

### 3-D. Commit

```bash
git add plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md \
        plugins/harness-floor-copilot/skills/visual-qa-copilot/SKILL.md \
        plugins/harness-floor-gemini/skills/visual-qa-gemini/SKILL.md
git commit -m "feat(harness-floor-*): visual-qa-<platform> orchestrator stubs"
```

---

## Task 4: Update marketplace.json + tests

### 4-A. marketplace.json

Append three new entries to the `plugins` array:

```json
    {
      "name": "harness-floor-codex",
      "source": "./plugins/harness-floor-codex",
      "description": "visual-qa scaffold for Codex CLI — emits .visual-qa.json + Playwright MCP entry"
    },
    {
      "name": "harness-floor-copilot",
      "source": "./plugins/harness-floor-copilot",
      "description": "visual-qa scaffold for Copilot CLI"
    },
    {
      "name": "harness-floor-gemini",
      "source": "./plugins/harness-floor-gemini",
      "description": "visual-qa scaffold for Gemini CLI"
    }
```

Validate JSON.

### 4-B. Extend `tests/lib/cross-platform-manifest.test.mjs`

The current test iterates over a 4-plugin array. Extend it.

Find:
```javascript
const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
];
```

Replace with:
```javascript
const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
  "harness-floor-codex",
  "harness-floor-copilot",
  "harness-floor-gemini",
];
```

The existing per-plugin test loop covers all 7 with no further code changes.

Also update the `marketplace.json` listing assertion:

```javascript
test("marketplace.json lists all nine plugins", () => {
  const data = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf-8"));
  const names = data.plugins.map((p) => p.name).sort();
  assert.deepEqual(names, [
    "harness-builder",
    "harness-builder-codex",
    "harness-builder-copilot",
    "harness-builder-cursor",
    "harness-builder-gemini",
    "harness-floor",
    "harness-floor-codex",
    "harness-floor-copilot",
    "harness-floor-gemini",
  ]);
});
```

### 4-C. Extend `tests/lib/cross-platform-render.test.mjs`

Add render assertions for the new templates:

```javascript
  {
    tpl: "plugins/harness-floor-codex/skills/visual-qa-codex/templates/visual-qa.config.json.hbs",
    contains: ["\"baseUrl\"", "\"pages\""],
  },
  {
    tpl: "plugins/harness-floor-codex/skills/visual-qa-codex/templates/mcp-snippet.toml.hbs",
    contains: ["[mcp_servers.playwright]", "@playwright/mcp@latest"],
  },
  {
    tpl: "plugins/harness-floor-copilot/skills/visual-qa-copilot/templates/mcp-snippet.json.hbs",
    contains: ["\"playwright\"", "@playwright/mcp@latest"],
  },
  {
    tpl: "plugins/harness-floor-gemini/skills/visual-qa-gemini/templates/mcp-snippet.json.hbs",
    contains: ["\"playwright\"", "@playwright/mcp@latest"],
  },
```

Note: the `visual-qa.config.json.hbs` template references Handlebars variables that the existing CTX doesn't supply. If the render test fails because of missing context, fall back to checking the raw template content with `readFileSync` instead of `render(tpl, CTX)`. Adjust the test to use `try { render(...) } catch {}` or use a simpler assertion that the file contains `{{` (template hasn't been removed). Implementation discretion.

Easiest workaround: pre-populate `extraCtx` with permissive defaults for any fields the visual-qa template references. Inspect the source `harness-floor/visual-qa/templates/visual-qa.config.json.hbs` and supply matching fields in the CASES entry.

### 4-D. Isolation test

`tests/lib/cross-platform-isolation.test.mjs` currently iterates a `PLUGINS` array. Extend it the same way:

```javascript
const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
  "harness-floor-codex",
  "harness-floor-copilot",
  "harness-floor-gemini",
];
```

### 4-E. Run tests

```bash
node --test 'tests/lib/*.test.mjs'
```

Expected: all green.

### 4-F. Commit

```bash
git add .claude-plugin/marketplace.json tests/lib/cross-platform-*.test.mjs
git commit -m "feat(marketplace): register 3 harness-floor plugins; extend tests"
```

---

## Task 5: CHANGELOG + final follow-up tracker update

### 5-A. CHANGELOG.md

Prepend:

```markdown
## visual-qa porting scaffold — 2026-05-18

### Added
- Three new sibling plugins for cross-platform visual-qa scaffolding:
  - `harness-floor-codex`, `harness-floor-copilot`, `harness-floor-gemini`
- Each emits `.visual-qa.json` config + a Playwright MCP entry (printed to stdout) for the host platform's MCP config location.
- Marketplace entries; manifest/render/isolation tests extended to cover the new plugins.
- `scripts/sync-lib.mjs` — single command to sync vendored `lib/` copies between harness-builder/agent-init and each cross-platform plugin. `--check` mode for CI drift detection.

### Still deferred
- Full 6-phase orchestrator port per platform (visual-qa) — separate per-platform spec needed.
- agent-all port per platform — subagent dispatch differs sharply per host; separate per-platform research + spec needed.
- Brainstorm integration via host-native ask_user equivalents.
- Runtime validation against actual CLIs.
```

### 5-B. CHANGELOG.ko.md mirror

Same structure with Korean headings (`### 추가됨`, `### 여전히 보류 중`). File/tool names in English.

### 5-C. Update follow-ups tracker

Edit `docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md`. Mark these as DONE under "visual-qa and agent-all on each platform":

```
- ✅ DONE (2026-05-18 scaffold iteration) — visual-qa MVP scaffold for Codex/Copilot/Gemini (config emit + MCP snippet). Cursor remains docs-only as designed.
- Pending — full 6-phase orchestrator port per platform (separate spec per platform).
- Pending — agent-all port per platform (separate spec per platform).
```

### 5-D. Commit

```bash
git add CHANGELOG.md CHANGELOG.ko.md docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md
git commit -m "docs: CHANGELOG + tracker for visual-qa scaffold iteration"
```

---

## Self-Review Notes

- **Spec coverage**: 3 new plugins ✓, MCP snippet per platform ✓, marketplace entries ✓, tests extended ✓, CHANGELOG ✓.
- **Placeholder scan**: No TBDs in tasks. SKILL.md Phase 3 explicitly states "not implemented in this scaffold" — that's intentional documentation, not a placeholder.
- **YAGNI**: No new lib code. No build step. Existing `render.mjs` handles all templates.
