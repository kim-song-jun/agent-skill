> 🇰🇷 한국어: [CHANGELOG.ko.md](CHANGELOG.ko.md)

# Changelog

All notable changes to this project. Date-stamped tags exist for each release candidate.

## [Unreleased]
- `harness-thrift` v2 summariser using Claude Code programmatic compact
  API (once surfaced) — currently v1 advisory.
- Live CC + per-platform CLI verification per
  `2026-05-18-cli-runtime-verification-checklist.md` and
  `2026-05-18-hook-precedence-integration.md`.
- Anthropic SDK / OpenAI SDK / Vertex SDK actual API hookups (currently
  mock toolCallers used in tests).

## README — sharpen `/goal` + Ralph Loop differentiation — 2026-05-18

### Changed

The previous "Loop semantics — harness vs Ralph Loop" subsection
implied harness was Ralph-with-features. Replaced with "How this is
different from `/goal` and Ralph Loop" — frames the harness as a
**different category** (orchestrator that loops, not a loop with
orchestration), with explicit:

- **Comparison table** showing what each tool actually *solves* +
  what it *knows about*:
  - `/goal` solves "don't stop until X"; knows nothing about work
  - Ralph Loop solves "re-run on interval"; stateless
  - `/agent-all --loop` solves "drive a complete dev workflow to
    verified end state within cost bounds"; knows phases, plan,
    agents, what was tried, cost, where it failed
- **Explicit framing**: harness pulls the "good idea" from each
  (keep-alive from `/goal`, auto-retry from Ralph) and adds structural
  pieces neither has — multi-phase awareness, stateful retries (next
  iteration sees previous failure), wave-granularity cost cap,
  resume-from-failure, phase-aware break-condition
- **`/goal` and Ralph reframed as complements, not alternatives** —
  `/goal` keeps the session alive so `--loop` can run for hours;
  Ralph wrapping a one-shot only makes sense for wall-clock periodicity

This addresses the feedback that the prior writeup made harness look
like "another option in the same category" when it's actually a
different category that absorbs the best parts of both.

## README — agent-first value prop + self-sustaining workflows — 2026-05-18

### Added & Changed

- **Top-of-README value prop rewritten** to lead with the actual
  strengths: "Agent-first workflows that run themselves."
  Three numbered pillars now explicit:
  1. **Project-first scaffolding** — `/agent-init` works on any git
     repo, detects stack, picks the right test command.
  2. **Agent-first execution** — `/agent-all` runs brainstorm → plan
     → implement → review → PR as ONE pipeline (you approve the plan;
     it drives itself).
  3. **Self-sustaining loops** — `--loop` + `--max-iter` + `--max-cost`
     + `breakCondition` + Claude Code's `/goal` enable unattended
     overnight runs.

- **New "Self-sustaining workflows" section** (placed after "Pick a
  theme", before "Stack examples"). Documents:
  - Components table: `--loop`, `--max-iter`, `--max-cost`,
    `breakCondition`, `/goal`, `/thrift`
  - Concrete "unattended overnight feature ship" recipe combining
    `/thrift` + `/goal` + `/agent-all --loop`
  - Step-by-step explanation of what happens under the hood
  - Harness `--loop` vs Ralph Loop comparison with criteria for when
    to use which

- **"Adjacent tools" subsection trimmed** to a cross-ref pointing back
  to "Self-sustaining workflows" (eliminates duplication).

This addresses three feedback points: (1) the value prop wasn't selling
what makes this different, (2) `/goal` and Ralph Loop integration
wasn't visible, (3) "auto-bootstrap per project" strength wasn't called
out as a numbered pillar.

## README — ecosystem context section — 2026-05-18

### Added

New section in both READMEs: **"How this fits with the rest of the
Claude ecosystem"**. Explains the layering between agent-skill (this
repo), `superpowers`, and `context-mode`:

- ASCII diagram showing agent-skill composes ON TOP of superpowers
  (wraps its skills) and context-mode (uses its tools).
- Table of every `superpowers:*` skill the harness invokes + which
  command uses it (brainstorming, writing-plans, dispatching-parallel-
  agents, subagent-driven-development, systematic-debugging, TDD,
  verification-before-completion, requesting-code-review).
- Table of every `context-mode` tool (`ctx_execute`,
  `ctx_execute_file`, `ctx_batch_execute`, `ctx_search`,
  `ctx_fetch_and_index`, `ctx_stats`) with use cases.
- Step-by-step walkthrough of `/agent-all "Add OAuth"` showing exactly
  which superpowers skill and which context-mode tool fires at each phase.
- Graceful-degradation note: harness commands work without either
  plugin installed (skip phases or no-op hooks); both are recommended.
- Install commands for both: `superpowers@claude-plugins-official` and
  `context-mode@context-mode`.

This addresses a gap users hit when they install agent-skill but don't
know what `superpowers:brainstorming` means or why the harness keeps
referring to it.

## README — user-friendly rewrite — 2026-05-18

### Changed

Both READMEs rewritten with a friendlier voice:
- **Above-the-fold value prop** in plain language: "One marketplace,
  five slash commands, every AI coding tool." No jargon.
- **60-second install** + single-command update path up top.
- **Per-command sections** (`/agent-init` / `/agent-all` / `/visual-qa`
  / `/thrift` / `/explore` / `/debug`) each show what the command does
  in 2-3 sentences plus the most useful flags. No phase tables, no
  internal lib references in the user-facing path.
- **Common workflows** section with concrete copy-paste recipes
  (new project, onboarding, flaky test, pre-launch, long debugging).
- **"Going deeper"** section at the bottom links to architecture /
  specs / changelog for users who want the technical details — kept
  out of the way for the 90% who don't.

Cut from the user-facing path (still in docs/ for those who need it):
- Phase-by-phase walkthroughs of every command
- Architecture trees + per-plugin layout
- Composition patterns / Codex rescue / cross-platform deep dive

Length: README.md ~290 lines (was ~530), README.ko.md mirrors.

## README + plugin-update documentation — 2026-05-18

### Updated

- `README.md` and `README.ko.md` fully rewritten to reflect the current
  17-plugin / 5-theme state (was stuck at the 2-plugin / 3-theme version
  with thrift listed as "RESERVED").
- Added a dedicated **"Updating plugins"** section covering all hosts:
  - Claude Code: `/plugin update <name>@agent-skill`,
    `/plugin update --marketplace agent-skill`, `/plugin update --all`,
    `/plugin marketplace update agent-skill`
  - Codex CLI: `codex plugins update [<name>]`
  - GitHub Copilot CLI: `gh copilot plugins update [<name>]`
  - Gemini CLI: `gemini extensions update [<name>]`
  - Cursor: re-run `bin/install.mjs --force` (renderer-style; idempotent
    via `thrift-` / `floor-` sentinel)
  - Clean-install path: uninstall + remove marketplace + re-add
  - Per-plugin uninstall: `node plugins/<p>/bin/install.mjs --uninstall`
- Added a dedicated **"Cross-platform support"** matrix showing which
  themes ship on which hosts at what fidelity (✅ / scaffold / port deferred).
- Added a dedicated **"The 5 themes"** section with the A/B/C/D/E
  positioning table.
- Updated command reference to include `/thrift`, `/explore`, `/debug`.
- Added onboarding + flaky-test debugging examples.
- Updated "Versioning" section to reflect the iteration timeline
  (41 → 7 → 5 → 4 → 1 → 2 commits across five sub-iterations).

## 6 new plugins + per-platform implementations — 2026-05-18 (commit 0aa3cea)

10 parallel agents shipped 6 new marketplace plugins + filled in the
agent-all + visual-qa implementations across all 4 existing platform
plugins. Marketplace now lists 17 plugins (was 11).

### New plugins (6)

- `harness-thrift-cursor` (v0.1.0) — Theme B port for Cursor. Single
  `.cursor/rules/thrift.mdc` rule + advisory-only audit; no programmatic
  hooks. 5 phases (no Phase 4 cache prime). 24 tests.
- `harness-thrift-copilot` (v0.1.0) — Theme B port for Copilot CLI.
  `.github/hooks/*.json` patcher, `store_memory` bridge with file
  fallback, OpenAI rate table. 6 phases. 32 tests.
- `harness-thrift-codex` (v0.1.0) — Theme B port for Codex CLI.
  TOML-aware `~/.codex/config.toml` patcher with sentinel comment
  bracketing, OpenAI rate table with 0.5× cache multiplier. 6 phases.
  24 tests.
- `harness-thrift-gemini` (v0.1.0) — Theme B port for Gemini CLI
  (heaviest port). `~/.gemini/settings.json` user-scope patcher, Vertex
  AI rate table with separate cacheRead/cacheWrite/storage-hour terms,
  min-token gate, free-tier short-circuit ROI evaluator. 5 phases.
  30 tests.
- `harness-explore` (v0.1.0) — Theme D (new). Codebase exploration
  with 5-phase pipeline: preflight → fan-out → aggregate → deps →
  render. Parallel-dispatch tree walker, dependency graph extraction
  (TS/Python/Rust/Go regex), cache keyed by `git rev-parse HEAD`,
  `/explore where` + `/explore deps` queries. 46 tests.
- `harness-debug` (v0.1.0) — Theme E (new). 6-phase debugging workflow:
  preflight → reproduce → isolate → hypothesize → verify → summarise.
  WRAPS `superpowers:systematic-debugging`. 10-format error parser,
  ddmin + git-bisect lib, hypothesis tracker, repro suggester. 66 tests.

### Per-platform implementations (existing 4 plugins extended)

- agent-all-cursor + visual-qa-cursor (55 new tests) — vendored lib +
  plan-parser, state-rw, page-result-collector, report-renderer.
- agent-all-copilot + visual-qa-copilot (126 new tests) — dispatch-task,
  await-wave, memory-bridge, cost-tracker + visual-qa siblings.
  bin/install-hooks.mjs registers subagentStop.
- agent-all-codex + visual-qa-codex (99 new tests) — dispatch-strategy,
  codex-agent-dispatch/wait, sequential-dispatch.
  bin/install-hook.mjs merges TOML into ~/.codex/config.toml.
- agent-all-gemini + visual-qa-gemini (39 new tests) — subprocess-fleet,
  result-collector, tmp-gc, cost-accumulator (3-path).

### Infrastructure

- `marketplace.json`: 17 plugins (added 6).
- `tests/lib/cross-platform-{manifest,isolation}.test.mjs`: extended.
- `scripts/sync-lib.mjs`: `VENDORED_RENDER_ONLY` now covers 11 plugin
  `bin/lib/` dirs (19 vendored `render.mjs` files tracked).

### Result

981/981 tests pass (was 427, +554). Working tree clean.

### Still deferred

- Live CC + per-platform CLI verification (sandbox unavailable).
- Anthropic/OpenAI/Vertex SDK actual API hookups.
- Token counting accuracy improvements where CLIs don't expose tokens.

## sub-project specs + host invokers + thrift installer — 2026-05-18

### Specs (12 new — all design-only)

- `2026-05-18-agent-all-{codex,copilot,cursor,gemini}-impl-spec.md` (4 files)
  — per-platform implementation plans for the agent-all-scaffold ports.
  Each enumerates the lib modules + hook scripts + tests to write,
  effort breakdown summing to the per-platform estimate (Cursor 3d,
  Copilot 1w, Codex 1w, Gemini 1.5w), open questions, acceptance criteria.
- `2026-05-18-visual-qa-{codex,copilot,cursor,gemini}-impl-spec.md` (4 files)
  — same shape for the visual-qa 6-phase orchestrator ports.
- `2026-05-18-harness-thrift-per-platform-decomposition.md` — 4-port
  decomposition for Theme B (Cursor ~5d, Copilot ~1.5w, Codex ~1.5w,
  Gemini ~2w). Key decisions: independent rate-table copies (not
  inheritance), Cursor port collapses to a single `.mdc` rule, ordering
  Cursor → Copilot → Codex → Gemini.
- `2026-05-18-harness-explore-design.md` — new plugin design.
  Codebase-mapping skill, 5 phases, parallel-dispatch reader pattern,
  cached map keyed by `git rev-parse HEAD`, `/explore where` + `/explore deps`
  slash commands. ~3 weeks total.
- `2026-05-18-harness-debug-design.md` — new plugin design.
  Reproduce → isolate → hypothesize → verify workflow with `.debug-state.json`
  checkpointing, structured error parsing (10 formats), bisection lib,
  WRAPS `superpowers:systematic-debugging` rather than replacing.
  ~3 weeks total.
- `2026-05-18-hook-precedence-integration.md` — protocol spec for
  harness-floor + harness-thrift + context-mode hook coexistence.
  Event-by-event firing order matrix, sentinel-based registration
  contract, settings-precedence policy, migration plan for existing
  hook-registering plugins.

### Implementations

- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/lib/host-invoker.mjs`
  — 4 production host invoker wrappers for the ask-user-adapter contract.
  Cursor: chat I/O (stdout + readline) wrapper.
  Copilot/Codex: `ask_user`-tool wrapper; Codex also stubs the
  `exec_command`/FZF TTY path.
  Gemini: free-text `ask_user` wrapper with response-shape normalization.
- `plugins/harness-thrift/bin/install.mjs` — automated install renderer
  for the /thrift skill. Walks template hooks, copies lib into
  `<target>/.claude/hooks/lib/`, rewrites import paths post-render,
  applies `patchSettings`. Flags: `--ctx`, `--force`, `--dry-run`,
  `--no-instrument`. Bundles `bin/lib/render.mjs` vendored from
  harness-builder via `scripts/sync-lib.mjs`.
- `plugins/harness-thrift/skills/thrift/lib/anthropic-summariser.mjs`
  — `anthropicSummariseFn({apiKey, model, sdkPath, sdkLoader})` factory
  for the `--use-haiku` summariser path. Dynamic SDK import with clean
  "Install @anthropic-ai/sdk" error; `sdkLoader` injection makes it
  testable without the actual SDK.

### Tests

- `tests/lib/ask-user-host-invoker.test.mjs` — 20 tests across 4
  platforms.
- `tests/lib/thrift-install.test.mjs` — 8 tests.
- `tests/lib/thrift-anthropic-summariser.test.mjs` — 9 tests.
- `scripts/sync-lib.mjs` extended: `plugins/harness-thrift/bin/lib`
  added to VENDORED_RENDER_ONLY (13 vendored files total).

### Result

427/427 tests pass (was 390, +37). Working tree clean. 12 new specs +
6 new implementation files + tests.

### Still deferred

- Implementation of the 9 per-platform impl specs.
- Implementation of `harness-explore` (~3w) and `harness-debug` (~3w).
- Live CC verification per hook precedence integration spec.
- v2 thrift summariser using programmatic compact API.

## harness-thrift v0.1 — 2026-05-18

Theme B implementation landed. New plugin `harness-thrift` (11th in
marketplace) ships cost-conscious long-session optimisation per the
design spec.

### Added — research-notes (sandbox-bound spikes)

- `docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`
  — decision: v1 ships advisory summariser (file + Notification);
  programmatic compact deferred to v2 pending CC plugin API.
- `docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md`
  — decision: thrift PreToolUse(Bash) is telemetry-only (context-mode-
  router stays authoritative); `.claude/settings.local.json` patched
  append-only with `thrift-` sentinel for safe revert.

### Added — plugin

- `plugins/harness-thrift/` (v0.1.0). Skill `/thrift` with 6 phases:
  - Phase 0 — preflight (context-mode detect, existing hooks scan)
  - Phase 1 — config (seed/load `.thrift.json`)
  - Phase 2 — instrument (append-only `.claude/settings.local.json` patch)
  - Phase 3 — summariser (v1 advisory: file + Notification nudge)
  - Phase 4 — cache-prime (disabled by default; ROI gate)
  - Phase 5 — audit (end-of-session report)

### Added — lib modules

- `lib/config-loader.mjs` — schema-validated `.thrift.json` parser with
  field-level error reporting; built-in DEFAULTS fallback.
- `lib/threshold-evaluator.mjs` — `shouldFireSummariser({turns, tokens})`;
  `estimateTokensFromBytes()` heuristic (3 bytes/token mixed default).
- `lib/cost-estimator.mjs` — rate table for opus-4.7/sonnet-4.6/haiku-4.5;
  `estimate()` + `estimateSession()` with per-model breakdown +
  baseline-vs-actual savings ratio.
- `lib/metrics-collector.mjs` — `.thrift-state.json` reader/writer with
  atomic rename; `recordTurn/Summariser/Coercion/CachePrime/Phase`.
  Corrupt state file → fresh + `.bak.<ts>` backup.
- `lib/audit-renderer.mjs` — builds context for the report template;
  cache hit rate, savings %, per-model breakdown.
- `lib/settings-patcher.mjs` — append-only `.claude/settings.local.json`
  patcher with `thrift-` sentinel revert; refuses to touch unparseable
  files; idempotent (skips already-registered).
- `lib/summariser.mjs` — v1 advisory summariser; preserves last N turns
  verbatim + extracts `docs/superpowers/specs|plans|research-notes/*`
  paths as pinned refs. `heuristicSummariseFn()` fallback for
  dependency-free operation.
- `lib/cache-prime.mjs` — `computeCohortKey()` (session / branch /
  combined); `schedulePrime()` interval scheduler with error-resilience
  + cancellation; `evaluateCachePrimeROI()` gate (skip when session <15
  min or no expected pauses).

### Added — templates

- `templates/thrift.config.json.hbs` — `.thrift.json` seed
- `templates/audit-report.md.hbs` — Markdown audit report
- `templates/hooks/thrift-pretool-bash-telemetry.mjs.hbs`
- `templates/hooks/thrift-pretool-read-coerce.mjs.hbs`
- `templates/hooks/thrift-posttool-summariser-trigger.mjs.hbs`
- `templates/hooks/thrift-sessionstart-cache-prime.mjs.hbs`
- `templates/hooks/thrift-sessionend-audit.mjs.hbs`

### Tests

- `tests/lib/thrift-core.test.mjs` (17 tests) — config-loader,
  threshold-evaluator, cost-estimator
- `tests/lib/thrift-audit.test.mjs` (12 tests) — metrics-collector +
  audit-renderer + end-to-end report render
- `tests/lib/thrift-instrument.test.mjs` (8 tests) — settings-patcher
  append-only / unpatch sentinel / dry-run / unparseable refuse
- `tests/lib/thrift-summariser.test.mjs` (8 tests) — summarise contract,
  spec-path preservation, heuristicSummariseFn first-sentence extraction
- `tests/lib/thrift-cache.test.mjs` (13 tests) — cohort key, ROI gate,
  schedulePrime timing + cancellation + error resilience

### Marketplace

11th plugin registered. cross-platform-{manifest,isolation} tests
expanded; "marketplace.json lists all eleven plugins" assertion.

### Result

390/390 tests pass (was 330, +60). Working tree clean. All 7 sub-tasks
from the design spec complete (within sandbox limits).

### Still deferred

- Live CC verification of hook firing order + Notification payload.
- v2 programmatic compact (replace advisory v1) once CC API surfaces.
- Anthropic SDK integration for `--use-haiku` summariser path (currently
  heuristic fallback).
- Per-platform Theme B ports (Codex/Copilot/Gemini/Cursor) —
  decomposition spec deferred.

## cross-platform install + dispatch + adapter implementation — 2026-05-18

### Added

- `plugins/harness-floor-{cursor,copilot,codex,gemini}/bin/init.mjs`
  — install renderers for each platform. Walks plugin's installable
  templates, writes them to a target project with overwrite protection,
  prints platform-specific config snippets (Cursor: `.cursor/mcp.json`,
  Copilot: `~/.copilot/mcp-config.json`, Codex: `~/.codex/config.toml`
  with `[[hooks.agent]]` matchers, Gemini: `~/.gemini/settings.json`
  mcpServers).
  Flags: `--ctx`, `--force`, `--only=visual-qa|agent-all`.
- `plugins/harness-floor-gemini/bin/spawn-wave.mjs` — Phase 3 wave
  dispatcher for `/agent-all-gemini`. Spawns N parallel `gemini chat`
  subprocesses per wave; awaits via tmp-file polling; aggregates.
- `plugins/harness-floor-gemini/bin/spawn-page-subagent.mjs` — Phase 3
  page dispatcher for `/visual-qa-gemini`. Same pattern; honors
  `--max-parallel` for chunked dispatch.
  Both spawn libs support `--dry-run` and `--gemini-bin` substitution.
- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/lib/ask-user-adapter.mjs`
  — implementations of the structured Q&A adapter from the design spec.
  Each exports `askUserStructured({stage, prompt, choices, multi,
  freeFormFallback, invoker})` with the same contract across all 4
  platforms.

### Specs

- `docs/superpowers/specs/2026-05-18-harness-thrift-design.md` — full
  design for Theme B `harness-thrift` plugin (6 sub-projects, ~3 weeks).
- `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`
  refreshed with bin/init.mjs + spawn-wave/page + ask-user-adapter
  verification steps; updated acceptance criteria.

### Tests

- `tests/lib/harness-floor-init.test.mjs` (16 tests)
- `tests/lib/gemini-spawn.test.mjs` (8 tests)
- `tests/lib/ask-user-adapter.test.mjs` (26 tests)
- `scripts/sync-lib.mjs` extended for `harness-floor-*/bin/lib/` render.mjs

### Result

330/330 tests pass (was 280, +50). Working tree clean.

### Still deferred

- Live CLI verification of all bin/init.mjs outputs.
- Subprocess dispatcher run with real `gemini` binary (sandbox lacks it).
- Each platform's `ask_user` response-shape confirmation.
- `harness-thrift` implementation per its design spec (~3 weeks).

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
