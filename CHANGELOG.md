> 🇰🇷 한국어: [CHANGELOG.ko.md](CHANGELOG.ko.md)

# Changelog

All notable changes to this project. Date-stamped tags exist for each release candidate.

## [Unreleased]
- Theme B (`harness-thrift`) — context-mode aggressive integration, prompt cache, summariser hooks — design pending.

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
