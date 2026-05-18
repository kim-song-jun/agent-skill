# Cross-platform plugins follow-up — hook/MCP emission + Cursor renderer

**Date:** 2026-05-18
**Status:** Draft — second iteration of cross-platform plugin family
**Scope:** Address the implementable items in `2026-05-18-cross-platform-plugins-followups.md`. Defer visual-qa / agent-all porting to a separate spec (decomposed at the end of this document).

## Problem

After the 2026-05-18 MVP, four cross-platform plugins (`harness-builder-{codex,copilot,gemini,cursor}`) ship with **memory file + role files only**. Each `SKILL.md` orchestrator explicitly defers hook + MCP wiring and brainstorm integration. Today the artifacts emitted by the plugins are incomplete relative to what `harness-builder/agent-init` emits for Claude Code (which includes `settings.local.json` with hooks and MCP servers).

In addition, Cursor's plugin ships only `bin/install.sh` which copies unrendered `.hbs` files. Users must hand-substitute Handlebars variables. The follow-up tracker explicitly calls for replacing this with a Node-based renderer that takes a JSON context and writes rendered output.

## Goal

Bring each of the four cross-platform plugins to **near-parity with `agent-init`** for the emit-time artifacts, within the constraint that we can't run each host CLI to validate behavior. Specifically:

1. Codex, Copilot, and Gemini plugins each emit a stub hook + MCP config artifact, alongside the existing memory + role files.
2. Cursor's plugin gains a Node-based automated renderer that takes a ctx JSON, renders all `.hbs` templates, and writes them to the target project.
3. New tests cover the additional templates and the new Cursor renderer.
4. CHANGELOG documents the changes; the follow-up tracker is updated to mark the items closed.

## Non-goals (deferred to future)

- Subagent dispatch wiring inside any host platform. Each platform's primitive (Codex `agent` hook type, Copilot `task`, Gemini task tools, Cursor subagents) requires per-platform research and likely independent specs.
- visual-qa porting on each platform. Playwright MCP availability varies; each platform-specific spec needed.
- agent-all porting on each platform. Skill-tool subagent dispatch is Claude-Code-specific; per-platform redesign needed.
- Runtime validation that each emitted file actually loads correctly inside the target CLI. We rely on the format research from the previous spec and emit syntactically valid stubs.
- Brainstorm integration inside each host platform (using the platform's native `ask_user`-equivalent). Plugins currently print prompts; this is acceptable for MVP.

## Per-platform design

### Codex CLI — `harness-builder-codex`

Codex configures hooks and MCP servers in `~/.codex/config.toml` (user-level) or a project-level `.codex/config.toml` (less common). We emit a **project-level** stub at `.codex/config.toml.hbs`:

```toml
# Stub Codex config produced by /codex-init.
# Merge with your existing ~/.codex/config.toml or use as a starting point.

[hooks]
PreToolUse = [
  { matcher = "apply_patch", hooks = [{ type = "command", command = "{{hook_command_pretool}}" }] }
]
SessionStart = [
  { hooks = [{ type = "command", command = "{{hook_command_sessionstart}}" }] }
]

{{#if mcp_servers}}
{{#each mcp_servers}}
[mcp_servers.{{this.name}}]
{{#if this.command}}
command = "{{this.command}}"
args = {{this.args_json}}
{{/if}}
{{#if this.url}}
url = "{{this.url}}"
{{/if}}
{{/each}}
{{/if}}
```

The orchestrator renders this only when the user opts in (a yes/no prompt added to Phase 1). Default values for `hook_command_pretool` and `hook_command_sessionstart` are reasonable no-op echoes; users edit them.

### GitHub Copilot CLI — `harness-builder-copilot`

Copilot loads hooks from `.github/hooks/` (repo-level, version-controlled) and MCP servers from `~/.copilot/mcp-config.json` (user-level). We emit:

- `.github/hooks/preToolUse.json` (stub)
- `.github/hooks/postToolUse.json` (stub)
- `.github/hooks/agentStop.json` (stub)
- `mcp-config.json.hbs` — rendered to **CLI-printed snippet** (stdout) for the user to copy into `~/.copilot/mcp-config.json`. We do not write to the user's home directory automatically.

Hook stub example (`preToolUse.json`):

```json
{
  "hooks": [
    { "matcher": "read_bash", "command": "echo 'pre read_bash'" }
  ]
}
```

The orchestrator prompts the user before writing the hook stubs.

### Gemini CLI — `harness-builder-gemini`

Gemini configures hooks and MCP in `~/.gemini/settings.json` (user) or `.gemini/settings.json` (project). We emit a **project-level** `.gemini/settings.json.hbs`:

```json
{
  "hooks": {
    "BeforeTool": [
      { "matcher": "write_file", "command": "{{hook_command_beforetool}}" }
    ],
    "SessionStart": [
      { "command": "{{hook_command_sessionstart}}" }
    ]
  },
  "mcpServers": {
    {{#each mcp_servers}}
    "{{this.name}}": {
      {{#if this.command}}
      "command": "{{this.command}}",
      "args": {{this.args_json}}
      {{/if}}
      {{#if this.url}}
      "url": "{{this.url}}"
      {{/if}}
    }{{#unless @last}},{{/unless}}
    {{/each}}
  }
}
```

(Strict JSON — `render.mjs` mustache-subset doesn't have `@last` / `unless`, so the template flattens to a simpler form that lists servers via `services_str`-style pre-joining. The plan elaborates.)

### Cursor — `harness-builder-cursor`

Replace `bin/install.sh` with `bin/init.mjs`. The Node script:

```
Usage:
  node plugins/harness-builder-cursor/bin/init.mjs <target-project-dir> [--ctx <ctx.json>] [--force]
```

Behavior:

1. Read `<ctx.json>` (if not provided, prompt for the 5 fields via readline).
2. Run `detectProject(target)` from vendored `lib/detect-stack.mjs` to fill `stack`/`runtime`/`services`.
3. Build the ctx object.
4. Render each `.hbs` template under `templates/` via vendored `lib/render.mjs`.
5. Write the rendered output to the target:
   - `templates/rules/agent-init.mdc.hbs` → `<target>/.cursor/rules/agent-init.mdc`
   - `templates/agents/<role>.md.hbs` → `<target>/.cursor/agents/<role>.md`
6. Refuse to overwrite existing files unless `--force`.

Keep `bin/install.sh` as a thin shim that prints "use init.mjs" and exits with a non-zero code, so existing user shortcuts surface the new entry point.

## Tests

1. **Manifest test** unchanged (already covers 4 plugins).
2. **Render test** extended to cover the new `.codex/config.toml.hbs`, hook JSON stubs, and `.gemini/settings.json.hbs`. Add substring assertions for the toml/json shapes.
3. **Cursor renderer test** — a new test invokes `bin/init.mjs` against a temporary directory with a fixed ctx JSON; asserts the output files exist and contain expected substrings. Uses `mkdtempSync` + `rmSync` for cleanup.
4. **Isolation test** unchanged.

## visual-qa / agent-all porting — decomposition

These two skills require fundamentally different per-platform engineering and **cannot** ride on the memory-file rendering pattern. They are out of scope for this iteration but the decomposition below clarifies what each future spec needs.

### `visual-qa` porting

- Depends on Playwright MCP being installed and accessible to the host CLI.
- Codex CLI: confirmed MCP support (`[mcp_servers.*]` in config.toml). Possible.
- Copilot CLI: confirmed MCP support (`~/.copilot/mcp-config.json`). Possible.
- Gemini CLI: confirmed MCP support (`mcpServers` in settings.json). Possible.
- Cursor: confirmed MCP support (`.cursor/mcp.json`). But Cursor has no skill-execution surface — visual-qa would have to be a manual checklist + screenshots stored in `.cursor/rules/`.

Per-platform separate spec: each needs:
- MCP server entry for Playwright
- Adapt the visual-qa orchestrator's tool calls to the platform's native shell + LLM-evaluate pattern
- Replace `mcp__playwright__*` tool names with per-platform MCP-name convention

Estimated work: each platform port is comparable in size to the initial `harness-builder-codex` MVP. Defer to per-platform follow-ups: `harness-floor-codex`, `harness-floor-copilot`, `harness-floor-gemini` (Cursor: doc-only).

### `agent-all` porting

- Depends on subagent dispatch primitive. Claude Code uses the `Skill` + `Task` tool pattern.
- Codex CLI: has `agent` hook type — research the exact contract (`agent` is one of `command | prompt | agent` per hook handler types). Likely usable.
- Copilot CLI: has `task` / `read_agent` / `list_agents` tools — likely a fit.
- Gemini CLI: has `activate_skill` for sub-skills; subagent dispatch unclear, may need composite invocation.
- Cursor: has native subagent file format. Dispatch happens automatically based on subagent descriptions.

Per-platform separate spec needed. agent-all's wave-based dispatch + break-condition loop is harder than visual-qa because it requires sub-process coordination that varies sharply per host. Defer to per-platform follow-ups: `harness-floor-codex/agent-all-codex` and so on.

Estimated work: each platform port is **significantly larger** than visual-qa, ~2x the original `agent-all` skill size. Per-platform engineering required.

## Risks

- **TOML / JSON template emission via mustache-subset.** Our `render.mjs` doesn't support `@last` / `unless`. The Codex `.codex/config.toml.hbs` and Gemini `settings.json.hbs` templates need workarounds (pre-joined strings, simpler structure). The plan elaborates.
- **Cursor `init.mjs` runs Node from the plugin directory.** If a user installs the plugin via marketplace, the path discipline differs from running from the repo. We document the canonical invocation paths.
- **Hook stubs are no-ops.** Users must edit them to do real work. This is acceptable for MVP and noted in CHANGELOG.

## Out-of-scope tracking (carried forward)

After this iteration, the remaining follow-up items are:

- visual-qa / agent-all porting per platform (separate specs)
- Brainstorm integration via each host's `ask_user`-equivalent
- Runtime validation against actual CLIs (manual QA pass)
- Vendor-sync mechanism for the 4 copies of `lib/{render,detect-stack}.mjs`
- Antigravity revisit if Google ships a distinct product
