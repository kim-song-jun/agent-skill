> 🇰🇷 한국어: [CHANGELOG.ko.md](CHANGELOG.ko.md)

# Changelog

All notable changes to this project. Date-stamped tags exist for each release candidate.

## [Unreleased]
- Theme B (`harness-thrift`) — context-mode aggressive integration, prompt cache, summariser hooks — design pending.

## cross-platform full-pipeline porting (scaffold) — 2026-05-18

### Added — agent-all per-platform ports (4 sub-projects)

Per the agent-all porting decomposition spec, ships scaffold-only ports
of the 7-phase /agent-all pipeline across 4 platforms with platform-
specific dispatch primitives:

- `harness-floor-cursor/skills/agent-all-cursor/` — prompt template
  approach (3d estimate). Cursor delegates via description-matching;
  ships `.cursor/rules/agent-all.mdc` + 3 subagent files
  (`is_background: true` for parallel).
- `harness-floor-copilot/skills/agent-all-copilot/` — uses Copilot's
  `task` tool for parallel wave dispatch (1w estimate). Awaiter prefers
  `subagentStop` hook, falls back to `list_agents` polling. Plan persists
  to `store_memory(scope=repository)`.
- `harness-floor-codex/skills/agent-all-codex/` — dual dispatch: `agent`
  hook (preferred) OR sequential `.codex/skills/<role>/SKILL.md` (fallback,
  auto-detected at preflight; 1w estimate). Ships
  `codex-hooks-snippet.toml.hbs` for `[[hooks.agent]]` matcher.
- `harness-floor-gemini/skills/agent-all-gemini/` — subprocess-based
  dispatch via `run_shell_command("gemini chat ... &")` (1.5w estimate,
  heaviest because Gemini has no native subagent primitive). Config
  adds `dispatch.{subprocessTimeout, maxSubprocesses, subprocessTmpDir}`.

All 4 ports preserve the 7-phase contract (preflight → intent → plan →
dispatch → gate → PR → loop). Each ships SKILL.md + 7 phase docs +
templates + references/porting-notes.md documenting platform-specific
limits and open research questions.

### Added — visual-qa per-platform ports (4 plugins graduated)

Graduates all 4 cross-platform `visual-qa-<platform>` plugins from
scaffold-only (config + MCP snippet) to full 6-phase pipeline (Phase 3
fan-out uses platform-native primitive):

- Cursor: `@visual-qa-page` subagent with `is_background: true`
- Copilot: `task()` per page + `subagentStop`/polling awaiter
- Codex: `[[hooks.agent]]` matcher OR sequential `.codex/skills/visual-qa-page`
- Gemini: parallel `gemini chat` subprocess spawn with PID waiter

Per platform adds 6 phase files + page-prompt + analysis-prompt + report
templates + porting-notes. Codex also gets `codex-hooks-snippet.toml.hbs`.

### Added — design specs

- `docs/superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md`
  — design for unifying brainstorming Q&A across Claude Code AskUserQuestion,
  Cursor chat, Copilot/Codex/Gemini ask_user. ~10d implementation effort
  estimated; deferred to per-platform sessions.
- `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`
  — handoff doc for runtime checks that require live CLI access (sandbox
  cannot install Codex/Copilot/Gemini/Cursor). Enumerates per-plugin
  verification matrix + acceptance criteria.

### Added — Cursor visual-qa scaffold baseline

New `harness-floor-cursor` plugin (was missing from the original 3-plugin
scaffold). Completes the 4-platform matrix. Adds 10th plugin to marketplace.

### Tests

- `tests/lib/agent-all-{cursor,copilot,codex,gemini}.test.mjs` —
  per-platform structure validation (8 tests each × 4 = 32 tests)
- `tests/lib/visual-qa-cross-platform.test.mjs` — graduation + phase
  contract validation (6 tests × 4 platforms = 24 tests)
- `tests/lib/cross-platform-render.test.mjs` — extended with 13 new
  template render cases (4 agent-all + 7 visual-qa)
- `tests/lib/cross-platform-{manifest,isolation}.test.mjs` — registers
  harness-floor-cursor (8th entry)
- 280/280 tests pass (was 203, +77)

### Still deferred

- Implementation of subprocess machinery (Gemini), `agent` hook research
  (Codex), `task` tool concurrency probe (Copilot), background-chat
  awaiter (Cursor) — all require live CLI access; see runtime checklist.
- `bin/init.mjs` renderers per cross-platform `harness-floor-*` plugin
  for automated install (current scaffolds are docs-only for some).
- `ask-user-adapter` implementations per platform — design spec exists;
  implementation is ~10d follow-up.
- End-to-end agent-all + visual-qa runs on actual CLIs — per the runtime
  checklist's acceptance criteria.

## visual-qa porting scaffold — 2026-05-18

### Added
- Three new sibling plugins for cross-platform visual-qa scaffolding:
  - `harness-floor-codex`, `harness-floor-copilot`, `harness-floor-gemini`
- Each emits `.visual-qa.json` config + a Playwright MCP entry (printed to stdout) for the host platform's MCP config location.
- Marketplace entries; manifest/render/isolation tests extended to cover the new plugins.
- `scripts/sync-lib.mjs` — single command to sync vendored `lib/` copies between harness-builder/agent-init and each cross-platform plugin. `--check` mode for CI drift detection.

### Still deferred
- Full 6-phase orchestrator port per platform (visual-qa) — separate per-platform spec needed.
- agent-all port per platform — subagent dispatch differs sharply per host; per-platform research + spec needed. See `docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md`.
- Brainstorm integration via host-native ask_user equivalents.
- Runtime validation against actual CLIs.

## Cross-platform follow-up — 2026-05-18

### Added
- Optional Phase 4 emit in `codex-init`, `copilot-init`, `gemini-init`:
  - Codex: `.codex/config.toml` with `[hooks]` + `[mcp_servers.*]` stubs
  - Copilot: `.github/hooks/{preToolUse,postToolUse,agentStop}.json` static stubs + `mcp-config.json` snippet printed to stdout
  - Gemini: `.gemini/settings.json` with `hooks` (BeforeTool/SessionStart) + `mcpServers` stubs
- `plugins/harness-builder-cursor/bin/init.mjs` — Node renderer that reads ctx JSON, runs `detectProject`, and writes all rendered `.cursor/rules/` and `.cursor/agents/` files. Refuses to overwrite without `--force`.
- `bin/install.sh` is now a deprecation shim that points to `init.mjs`.

### Tests
- Extended cross-platform render coverage for the three new platform-config templates.
- New `cursor-renderer.test.mjs` exercises the full end-to-end renderer against a temp directory.

### Still deferred
- visual-qa / agent-all per-platform porting (separate specs)
- Brainstorm integration via host-native `ask_user` equivalents
- Runtime validation against actual CLIs

## Cross-platform plugins — 2026-05-18

### Added
- Four new sibling plugins so users on each tool get a harness-builder equivalent inside their host:
  - `harness-builder-codex` — emits `AGENTS.md` + `.codex/skills/<role>/SKILL.md` for Codex CLI
  - `harness-builder-copilot` — emits `.github/copilot-instructions.md` + `AGENTS.md` + path-specific instruction files for GitHub Copilot CLI
  - `harness-builder-gemini` — emits `GEMINI.md` + `.gemini/skills/<role>/SKILL.md` for Gemini CLI (a.k.a. "antigravity")
  - `harness-builder-cursor` — emits `.cursor/rules/agent-init.mdc` + `.cursor/agents/<role>.md` for Cursor
- Marketplace entries for all four new plugins.
- Tests: manifest validity, render-substring snapshots, per-plugin isolation.

### Out of scope (this iteration)
- Visual-qa / agent-all parity per platform
- Hook & MCP wiring beyond stubs
- Full brainstorm integration inside each platform

## harness-builder 0.3.0 — 2026-05-18

### Added
- `detectProject(dir)` in `lib/detect-stack.mjs` returns `{ stack, runtime, services }`. Detects Docker runtime via `Dockerfile` or any `docker-compose.yml` / `compose.yaml` variant, and extracts top-level `services:` keys from compose YAML (regex parser, sorted).
- New fixtures: `docker-only`, `node-ts-docker`, `python-compose-only`, `python-requirements-only`, `dockerfile-bad-compose`.
- `CLAUDE.md` template now renders `(on docker: postgres, redis)` when runtime/services are present.

### Changed
- Phase 1 of `/agent-init` calls `detectProject` and spreads the result into the discovery context. Adds a pre-joined `services_str` for the template.

### Preserved
- `detectStack(dir)` remains as a thin back-compat wrapper returning the stack string. No callers were impacted.

## harness-builder v0.2.0 / harness-floor v0.2.0 — 2026-05-18
### Breaking
- **Renamed `/harness-init` → `/agent-init`**. Old name removed. Plugin/state names follow: `.harness-state.json` → `.agent-init-state.json` (backward-compat: old filename still gitignored).
- **`/agent-init --theme=floor` is now the DEFAULT.** Opt-out with `--theme=lite`.

### Added
- `/agent-init --theme=thrift` flag — RESERVED stub for Theme B (no behaviour yet).
- `/agent-all` skill in `harness-floor` (Theme C-2): 7-phase pipeline wrapping superpowers brainstorming + writing-plans + subagent-driven-development, with optional `--loop` (Theme C-3 ralph-pattern absorbed as flag).
- `/harness-init --theme=floor` integration (now default): seeds `.agent-all.json` alongside `.visual-qa.json` and adds Floor section to generated CLAUDE.md.
- Korean documentation siblings (`*.ko.md`).
- Cost-unrestricted defaults: `maxIter=10`, `maxCostUSD=500`, `waveSize=large`. Visual-QA confirm threshold raised 500→5000 captures.
- Render lib: nested same-type blocks now supported (balance-counter parser).
- `--theme=thrift` reserved as future Theme B entry point.

### Tags
- `harness-builder-v0.1.0-rc1` (initial release)
- `harness-floor-v0.1.0-rc1` (visual-qa initial)
- `harness-floor-v0.2.0-rc1` (visual-qa + agent-all)

## harness-floor v0.1.0 — 2026-05-17
### Added
- `/visual-qa` skill: Playwright MCP capture matrix + per-image LLM analysis + run-to-run diff. Hybrid JSON+markdown analysis output per capture.
- 3 lib modules: config-loader, matrix-builder, diff-runs, cost-estimator (all TDD).
- `/harness-init --visual-qa` flag (legacy alias post-v0.2.0) — seeds `.visual-qa.json`.
- Multi-plugin layout migration: `skills/harness-init` moved under `plugins/harness-builder/`.

## harness-builder v0.1.0 — 2026-05-17
### Added
- Initial release. `/harness-init` skill bootstraps CLAUDE.md + `.claude/agents/` + 3 hooks + plugin wiring in 5 phases.
- 4 lib modules: render (mustache-subset engine), detect-stack, plugin-scan, manifest-merge — all TDD.
- 12 templates: CLAUDE.md.hbs + 9 agent role templates + 3 hook templates + settings.local.json.hbs.
- Global hook: `context-mode-cache-heal.mjs` (SessionStart).
