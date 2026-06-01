> 🇰🇷 한국어: [CHANGELOG.ko.md](CHANGELOG.ko.md)

# Changelog

All notable changes to this project. Date-stamped tags exist for each release candidate.

## Unreleased

- Added `harness-debug-codex`, a Codex CLI port of `/debug` with the `debug-codex` skill contract, `run /debug` public entrypoint, structured error parsing, hypothesis state persistence, and superpowers fallback.
- Added deterministic Phase 4 gate planning for Claude/Codex `/agent-all`: `buildGatePlan`, coordinator-first `orchestrator` dispatch, `ORCHESTRATION_AUDIT`, and release-audited Codex mirror parity.
- Embedded the role gate matrix directly in Claude and Codex orchestrator personas so dispatch planning and final handoff both select the required reviewer gates before relying on root memory alone.
- Threaded classifier gate reasons and per-dispatch pass criteria into Claude/Codex Phase 4 docs and Codex sequential review prompts, including explicit `ORCHESTRATION_AUDIT` output contracts for coordinator gates.
- Added release-fixture coverage for the terminal Claude project bootstrap path, proving `install-platform.sh --platform=claude` produces both operational and `--lite` scaffolds, runs the post-install doctor, and leaves HOME unpatched.
- Hardened Codex release fixtures so operational/default-heavy and `--lite` installs must prove post-install doctor execution and success, with release-audit coverage for the smoke contract.
- Added release-fixture coverage for Codex `install-platform.sh --theme=builder|floor|thrift`, proving each single-theme install writes only its expected project-local artifacts, keeps global Codex config untouched, and preserves floor sequential helper/runtime and thrift no-instrument evidence.
- Registered the Codex debug port in the marketplace, Codex plugin install group, `install-platform.sh --platform=codex --theme=all|debug`, post-install doctor, release fixture smoke, release audit, release smoke, and public verification docs. Current suite: 1755/1755 passing; fast release smoke: 424/424 passing.
- Made Claude/Codex terminal operational bootstrap auto-refresh only approved foundations (`superpowers`, `context-mode`) when `claude` is available, with `--update-foundations` strict mode and `--no-update-foundations` opt-out.
- Hardened foundation auto-refresh so default Claude/Codex bootstrap continues in degraded foundation mode if the approved update fails; strict failure remains opt-in through `--update-foundations`.
- Changed `/agent-init` default to operational/heavy scaffold with `/agent-init --lite` as the minimal path.
- Added task ledger scaffolding, sentinel merge policy, Claude hard policy artifacts, Codex command-policy artifacts, Gemini soft rules, and changed-file reviewer classifier.
- Added foundation detection/update guidance for superpowers and context-mode.
- Updated release docs to reflect current Codex command-hook schema and prompt-level/sequential Codex floor workflows.

## QA team vs Verification team — 2026-05-22  (`harness-floor` v0.5.0)

Formal split of the two review concerns the harness used to conflate as "reviewer".

### Added

- **QA team persona (`qa.md`)** is now explicitly the **user-side** auditor. Treats `{{persona}}` as the user; outputs acceptance scenarios + defect reports. Audit token: `QA_AUDIT: passed | failed | skipped`.
- **Verification team** (`tester.md` + `reviewer.md`) is now explicitly the **tech-stack / spec-compliance** auditor. Audit token: `VERIFICATION_AUDIT` (existing).
- **`floor-policy` hook handles QA dispatches.** Description prefix `QA Review Task <N>: <title>` routes to the user-side directive (en/ko both shipped) + `QA_AUDIT` token validation at PostToolUse. Existing `Review Task` prefix still routes to the Verification directive — backward compatible.
- **`.agent-all.json` `policy.qaAudit`** flag (default `true`) — opt-out for projects without a user persona (libs, CLIs without UI). Phase 4 Gate skips QA dispatch when `false`.
- **Phase 4 two-team gate.** Wave passes iff `VERIFICATION_AUDIT ∈ {passed, skipped}` AND `QA_AUDIT ∈ {passed, skipped}`. Tech success ≠ user-flow success: a passing technical audit alongside a failing QA audit fails the wave; the QA defect report becomes input to the next iteration's plan.

### Libs (new)

- `lib/policy/qa-audit-validator.mjs` — parallel to `reviewer-audit-validator`. Same `{ ok, reason }` shape.

### Persona templates updated

- `agents/qa.md.hbs` — header rewritten to "QA team (user-side)" + audit-token section.
- `agents/tester.md.hbs` — header rewritten to "Verification team (tech-stack side)" + audit-token section.
- `agents/reviewer.md.hbs` — header rewritten to "Verification team (spec / quality side)" + audit-token section.

### Tests

Suite **1322 → 1334 passing** (+12 new: 6 QA validator, 6 hook QA path). Render-snapshot fixtures for the 3 updated persona templates × 7 stack profiles regenerated (21 snapshots).

### Spec

`docs/superpowers/specs/2026-05-22-qa-vs-verification-personas-design.md`

### Limitations

- `qa.md` is per-persona — projects without a persona declared in `/agent-init` get `{{persona}}` unresolved; QA dispatch falls back to "generic end-user perspective" prose.
- Tokens stay English. Korean directive variant just instructs the agent to emit the English token literally.
- No mid-wave abort on QA-only failure — Phase 4 still completes both reviewers before deciding. Acceptable: the existing 3-retry budget covers correction loops.
- Conflict resolution is binary. No severity-weighted blending; QA failure fails the wave outright. Future work could add `qaAuditSeverity: warn | fail` to downgrade.

## Visual-QA pairs + element-scope + multi-tier matching — 2026-05-22  (`harness-floor` v0.4.0)

Three additive capabilities for `visual-qa`. All keys are backward-compatible; existing `.visual-qa.json` files continue to work unchanged.

### Added

- **Before/after image pairs.** Each tracked element gets `before.png` (pre-action) + `after.png` (post-action) screenshots, plus `baseline.png` (symlink to the prior accepted run's `after.png`) when a baseline exists. New file layout: `docs/visual-qa/<slug>/captures/<page>/<elementId>/{before,after,baseline}.png`.
- **`comprehensive.targets` block** — `includeSelectors`, `excludeSelectors`, and `actionsPerElement` (per-selector action map) let you constrain or augment auto-discovery at element granularity. Action strings: `click`, `fill:<value>`, `blur`, `select:<index|value>`, `hover`. First-matching-key precedence; `default` is the catch-all.
- **Multi-tier element identity.** Replaces fragile `selector + DOM-path` matching with a 3-tier fallback chain:
  1. `data-vqa-id="..."` explicit attribute (rock-solid, instrumented)
  2. Semantic fingerprint — `{role, accessibleName, nearestHeading, textSnippet[:60]}` (survives wrapper/reorder refactors)
  3. Path hash (legacy fallback, preserves existing baselines)

  Each capture's `confidence` is surfaced in `report.md` and `report.html` so drift toward tier-3 is visible.
- **`report.html` self-contained viewer.** Inline CSS + JS, no external assets. Per-element cards with before/after thumbnails, click-to-fullscreen lightbox, arrow-key navigation between `before` / `after` / `baseline`. Configurable via `report.html` (default `true`).
- **`report.md` 2-column pair table.** Each verdict now gets a `Before / After` table inline, plus a second `Baseline / Current` row when a baseline exists. Configurable via `report.mdSideBySide` (default `true`).

### Libs (new)

- `lib/element-identity.mjs` — `computeElementIdentity(descriptor)`, `matchBaseline()`, `implicitRole()`. Pure Node.
- `lib/targets-filter.mjs` — `resolveTarget(elementCheck, targets)`, `parseAction(str)`. Pure Node.
- `lib/report-html.mjs` — `renderHtml(reportData)`. Self-contained HTML; entity-encodes user fields against XSS.

### Phase docs

- `phases/3-capture.md` gains a "Element identity + capture pairs" addendum describing the 7-step per-element flow (filter → identity → before → action → after → baseline → state-write).
- `phases/4-aggregate.md` step 11 documents the new `report.html` generation alongside `report.md`'s pair-table addition.

### Tests

Suite **1292 → 1322 passing** (+30 new):
- 10 in `element-identity.test.mjs` — tier precedence, fallback, implicit roles, baseline matching with degraded flag.
- 10 in `targets-filter.test.mjs` — exclude/include precedence, action lookup, parseAction's colon variants.
- 10 in `report-html.test.mjs` — doctype, per-card structure, verdict counts, confidence badges, XSS escaping, empty state.

### Known limitations (also in README "Known limitations")

- Semantic fingerprint can collide on duplicate labels ("Save" buttons under the same heading) — add `data-vqa-id` for high-value elements.
- Action vocabulary is single-step in v1. Multi-step scenarios deferred to a future `scenarios` field.
- `report.html` fullscreen API needs Safari ≥ 16 / Chrome ≥ 71 — falls back to non-modal full-page on older browsers.
- Storage growth ~2× per captured page (before + after). `comprehensive.cache.gitDiffScope` still skips unchanged pages, limiting the multiplier's reach.
- Baseline symlink falls back to copy on Windows / non-symlink filesystems.

### Out of scope (future work)

- `scenarios` multi-step DSL (login flows, wizard steps)
- Playwright `trace.zip` per capture (deferred for storage reasons)
- Record-and-replay UI
- LLM-assisted baseline rematch when tier-3 falls back

## `update.sh` refreshes marketplace cache — 2026-05-22  (`harness-floor` v0.3.3)

### Fixed

- **`update.sh` now calls `claude plugin marketplace update agent-skill` before reinstalling.** Without this, `uninstall + install` still hits the stale marketplace cache and re-installs the same commit. Symptom: `gitCommitSha` not advancing across releases despite "successfully installed" output. Verified: after this fix, all 5 essentials converge to HEAD's merge commit in one `update.sh` run.

## `scripts/update.sh` fix — 2026-05-22  (`harness-floor` v0.3.2)

### Fixed

- **`scripts/update.sh` now actually picks up new commits.** Previously, the script delegated to `install-all.sh` → `claude plugin install`, but `claude plugin install` is idempotent — it skips when a plugin is already at any version. So users running `update.sh` after a release saw "Installed: 5" but no actual update.
- Fix: `update.sh` now uninstalls then re-installs each agent-skill plugin that was already present. Pristine installs still flow through `install-all.sh` for the remainder.

### Verified

- After this fix, running `bash scripts/update.sh` against a clone on `main` moves `installed_plugins.json` `gitCommitSha` to the latest commit. Confirmed locally — `harness-floor` SHA went `2a27d75` (v0.3.0 merge) → `050100f` (v0.3.1 merge).

## Decision-surfacing i18n (en / ko) — 2026-05-22  (`harness-floor` v0.3.1)

### Added

- **`.agent-all.json` `language` field** — `"auto"` (default), `"en"`, or `"ko"`. `auto` reads `$LANG` / `$LC_ALL` / `$LC_MESSAGES` and resolves to `ko` for Korean locales, else `en`. Exported as `resolveLanguage(value)` from `config-loader.mjs`.
- **Localized renderer** — `renderToAskUserQuestion(decision, { taskTitle, language })` swaps prefixes (`Context:` / `Reasoning for recommendation:` / `(Recommended)`) per language. `en` and `ko` ship in v0.3.1; unknown languages fall back to `en`.
- **Korean scoping-pass addendum** — `lib/decisions/addendum.ko.md` ships alongside the English one. `floor-policy-hook.mjs` selects per project's `.agent-all.json` `language` (or `AGENT_ALL_LANGUAGE` env override for tests).
- **Localized verification + reviewer-audit directives** — same dual-version pattern; machine-parsed tokens (`STATUS: DONE`, `verification_passed`, `VERIFICATION_AUDIT: passed|failed|skipped`) stay English-only by design.

### Tests

Suite **1280 → 1292 passing** (+12 new tests for i18n: renderer prefix table, language config validation, `resolveLanguage` auto-detection, hook addendum selection per language).

### Notes

- The `language: "auto"` default does the right thing on most Korean dev environments without configuration. Set to `"en"` explicitly if you want English regardless of locale.
- Machine-parsed tokens remain English-only — `VERIFICATION_AUDIT:` etc. are stable contracts; the Korean directive text just asks the subagent to emit those exact English tokens.

## Decision-surfacing + policy-hook enforcement — 2026-05-21

### Added

- **Decision-surfacing protocol.** `/agent-all` Phase 3 splits into **3a scoping → 3b ask → 3c implement**. Implementer subagents do a read-only scoping pass, return architectural / spec-ambiguity decisions as a JSON payload `{options[2-4], recommended_index, reasoning}`, main asks user via `AskUserQuestion` (1/2/3 panel with recommendation flagged), then re-dispatches with answers baked in. Non-TTY mode auto-picks recommended and logs to `.agent-all-state.json` + `docs/agent-all/iter-<N>/decisions.md`.
- **Single `floor-policy` hook** (PreToolUse + PostToolUse on `Task`) auto-injects the scoping addendum + verification directive on dispatch and validates `verification_passed` / `VERIFICATION_AUDIT: passed|failed|skipped` tokens on return. Single file with internal router — overhead negligible when not a Task call.
- **`.agent-all.json` `policy` opt-out** — flags `decisionSurfacing`, `verification`, `reviewerAudit`, all defaulting `true`. Added to `DEFAULTS` so the existing deep-merge handles overrides naturally.
- **Per-platform parity** — Cursor (`.cursor/rules/decision-protocol.mdc`, soft), Copilot CLI (`.github/agent-all/decision-protocol.md`, hard via `.github/hooks/`), Codex (`[[hooks.agent]]` snippet to stdout for manual merge, hard), Gemini (`.gemini/agent-all-decision-protocol.md`, soft), VS Code Copilot (reads `.github/copilot-instructions.md`, soft).
- **Spec + plan:** `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`, `docs/superpowers/plans/2026-05-21-decision-surfacing-and-policy-hooks.md`.

### Changed

- Phase 3 dispatch documentation restructured into 3a/3b/3c sub-phases (`plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`).
- README "Main-thread isolation" table reflects new phase-3 token shape (3a/3c subagents + 3b sequential ask).
- `.agent-all-state.json` initial shape gains `decisions: {}` key (populated by Phase 3b).
- Added "Known limitations" section to README (English + Korean) covering soft enforcement on Cursor/Gemini/VS Code, non-TTY auto-pick caveat, `description`-based routing, and per-task scoping cost (~+15-20%).

### Fixed

- AskUserQuestion `header` 12-char limit: `lib/decisions/renderer.mjs` now truncates via `slice(0, 12)`. Plan-side bug surfaced by implementer subagent in Task 2.

### Tests

Suite **1246 → 1279 passing** (+33 new tests across `decisions/`, `policy/`, scenarios, config-loader policy, plus regression coverage).

### Plan deviations

- Task 11 reused existing `loadConfig(path)` API instead of introducing `loadAgentAllConfig(dir)`. Same effect, no API duplication.
- Task 13 (`sync-lib.mjs` vendoring of `decisions/` + `policy/` libs) deferred. Soft prompt-only ports don't require vendored runtime libs; hard-enforce ports reference the canonical hook script directly. Future work if cross-platform runtime parity becomes required.

## [Unreleased]
- `harness-thrift` v2 summariser using Claude Code programmatic compact
  API (once surfaced) — currently v1 advisory.
- Live CC + per-platform CLI verification per
  `2026-05-18-cli-runtime-verification-checklist.md` and
  `2026-05-18-hook-precedence-integration.md`.
- Anthropic SDK / OpenAI SDK / Vertex SDK actual API hookups (currently
  mock toolCallers used in tests).

## README overall improvement — 2026-05-19

Coordinated polish pass making the `--qa` story the README's headline
instead of a bolted-on section.

- **Opening tagline + command list** now lead with
  `/agent-all "..." --loop --qa` as the canonical featured command,
  and the one-line summaries promise "tests AND UI both pass" rather
  than just tests. `/visual-qa` description gains a sentence on
  `declared` vs `comprehensive` modes (was missing in the command
  reference).
- **Pillar #3 rewritten** from "three pieces compose" (generic) to
  "one-flag end-to-end verification" (concrete) — the actual selling
  point of the recent work.
- **New "Common workflows" headline**: "Ship a UI feature end-to-end
  (the killer flow)" — `npm run dev` + `--loop --qa` two-liner.
- **Self-sustaining workflows section consolidated** (lines 250-393
  → 264-372). Merged "Recipe" subsection into "The composable trio"
  (was duplicating the same /thrift + /goal + /agent-all snippet),
  tightened "How this differs from Ralph Loop" by 60% without losing
  the substance, removed the duplicate "step-by-step" prose (the
  `--qa` walkthrough already covers it).
- **Stale numbers** swept: 1019 → 1246 in 6 places (badge, status
  table, going-deeper, contributing checklist, README.ko.md).
- **Math error fixed**: "below 4" → "below 5" in the
  installed-plugins check (the recommended set is 5: builder + floor
  + thrift + explore + debug).
- README.ko.md fully synced.

Net result: 712 → 690 lines despite adding the --qa story; no fewer
sections, just less overlap. Tests still 1246/1246.

## Loop / visual-qa hardening + README clarity pass — 2026-05-19

Closing real gaps uncovered while documenting the comprehensive-mode
rollout. Each is a thing that would have made `/agent-all --loop --qa`
silently misbehave on a fresh project.

### Fixed — Phase 6 visual-qa invocation was hand-waved

Phase 6 docs referenced a `dispatchVisualQASubagent()` placeholder
that didn't exist. Replaced with a concrete `Task`-tool invocation
pattern on all 5 platforms (Claude Code native + cursor / copilot /
codex / gemini), each spelled out in the platform's native dispatch
primitive (`Task` / cursor background agent / `task` tool /
`agent` hook / `gemini chat` subprocess). Each iteration now uses
a fresh `--slug=loop-iter-<N> --force` combo so iters don't clobber
each other's slug dirs while Phase 2's `priorRunPath` discovery
still finds the previous iter as the baseline.

### Fixed — `--qa` autoscaffold writes config without checking dev server

Most common "it didn't work" failure mode: user runs `--loop --qa`,
visual-qa Phase 0 health-checks `baseUrl`, fails with no obvious
explanation. Now Phase 0 of `/agent-all` probes the autoscaffold's
`baseUrl` with `curl --max-time 3` *before* writing the config or
proceeding, and prompts the user to confirm if unreachable
(`--yes` mode aborts with a clear "dev server unreachable" message).

### Changed — `--qa` autoscaffold first-run policy: `auto-pass` → `report`

Subtle hazard: `auto-pass` means iter 1 always writes whatever it
captured as the new baseline. If iter 1 has broken UI, that broken
UI becomes the reference — iter 2 wouldn't catch the issues because
they match the baseline. New default `report` still passes the loop
on iter 1 (so users can start from zero) but enumerates every issue
in the report so the next iter has the context to fix them.

### Added — README troubleshooting + step-by-step `--qa` walkthrough

Five common failure modes (dev server down, missing Playwright MCP,
infinite loop on flaky tests, cost runaway on iter 2, baseline
lock-in, autoscaffold vs existing config) now have a "what / why /
fix" table. The loop+qa section was restructured into:
prerequisites → step-by-step → flag reference → troubleshooting.
Korean README synced. Tests badge updated 1019 → 1246.

## Comprehensive visual-qa + `/agent-all --qa` E2E gate — 2026-05-19

### Added — `/agent-all "..." --loop --qa` one-flag E2E verification

`--qa` is a new shortcut that wires loop completion to a real
end-to-end check, not just "did the tests pass". It expands to:

```
--break-condition='{"type":"composite","steps":[
  {"type":"test-auto"},
  {"type":"visual-qa","mode":"comprehensive"}
]}'
```

Tests run first as a cheap gate; visual-qa (comprehensive mode) runs
as the final E2E. Loop only breaks when both pass. `.visual-qa.json`
is auto-scaffolded with sane defaults if missing, so a fresh project
can run `/agent-all "build X" --loop --qa` with zero pre-setup.

Five-platform parity: Claude Code native + cursor / copilot / codex /
gemini all support `--qa`. Phase 0 of agent-all wires the shortcut at
highest priority — above CLI override, above interactive prompt, above
saved config.

### Added — visual-qa comprehensive mode

`.visual-qa.json` grows a `mode` field (default `declared`, back-compat).
When set to `comprehensive`, visual-qa stops requiring a hand-written
selector list and instead discovers everything automatically:

- **Crawl** from `baseUrl` with BFS, scope.include / scope.exclude
  globs, depth cap, maxPages cap. Same-origin only. (`lib/crawler.mjs`)
- **DOM walk** each crawled page for interactive elements — button,
  link, input, select, textarea, [role=tab|menuitem|switch|checkbox],
  [data-testid], [data-qa-id]. Stable selector preference:
  data-testid > data-qa-id > id > stable CSS path. Never class-based
  (Tailwind / CSS-in-JS unstable). (`lib/dom-walker.mjs`)
- **Shallow click** each non-input element. Captures the 1-step result
  state then reverts via re-navigation. Dialog-triggering clicks are
  caught; revert failures escalate to blocker severity.
  (`lib/shallow-clicker.mjs`)
- **DOM-hash cache** stores SHA-256 of the normalised DOM serialisation
  plus relevant computed styles, keyed against the prior LLM verdict.
  Components whose hash hasn't changed skip the LLM call entirely.
  30-day TTL eviction. (`lib/dom-hash.mjs`)
- **Git-diff scoping** — framework auto-detect (Next App Router /
  Pages / Remix) maps changed files to affected routes; falls back to
  "rebuild everything" for shared-component changes and "skip
  everything" for docs/tests-only diffs. (`lib/git-diff-scoper.mjs`)
- **Verdict** — issue set keyed by (page, component, category,
  message-hash) diffed against the baseline (prior accepted run). New
  critical/major (configurable) or any severity-bump regression fails
  the loop; severity drops count as fixes. First run with no baseline
  defaults to auto-pass + write baseline. (`lib/verdict.mjs`)

### Added — Phase doc updates

- Phase 1 (`config-mode`) branches on mode. Comprehensive runs crawler
  → DOM walker → git-diff filter → matrix.
- Phase 2 (`discover`) loads + evicts the DOM-hash cache in
  comprehensive mode.
- Phase 3 (`capture`) checks the DOM-hash cache before every LLM call;
  invokes shallow-click expander when `interactions.click` is true.
- Phase 4 (`aggregate`) computes the verdict, writes `verdict.json`,
  persists the DOM-hash cache.
- Phase 5 (`summary`) exit code is `verdict.pass ? 0 : 1` in
  comprehensive mode; declared-mode exit semantics unchanged.

### Added — 6 new libs, vendored byte-for-byte across 4 sibling plugins

Source-of-truth at `plugins/harness-floor/skills/visual-qa/lib/`;
copies in cursor/copilot/codex/gemini visual-qa-* skills. Sync test
catches drift.

### Tests

- 38 unit (crawler scope/depth/dedup/globs/errors, DOM walker
  classification + selector preference, config mode branch + autoscaffold)
- 9 unit (shallow-clicker normal path, skip-by-kind, dialog catch,
  throw containment, revert escalation)
- 28 unit (DOM-hash stability + I/O + TTL, git-diff framework
  auto-detect + route mapping)
- 12 unit (verdict diff algorithm + first-run policies)
- 27 doc-level (--qa flag contract across 5 platforms)
- 13 doc-level (visual-qa comprehensive mode mention across 5 platforms)
- 24 cross-platform sync (6 libs × 4 sibling platforms byte-identical)
- 4 integration (crawler → walker → clicker → cache → verdict pipeline
  composes coherently)

Total: **+155 tests, suite 1091 → 1246 passing.**

### Spec

`docs/superpowers/specs/2026-05-19-visual-qa-comprehensive-design.md`
records the brainstormed design decisions (discovery strategy,
interaction depth, cost strategy, verdict semantics, staging plan).

## Interactive break-condition resolution for `/agent-all --loop` — 2026-05-19

### Added — Phase 0 interactive prompt + four break-condition preset types

Previously `breakCondition` was a static shell string in `.agent-all.json`,
forcing users to hand-craft it before running `/agent-all --loop`. That
made the most useful "what does done look like" decision a config-file
chore, with no in-the-flow choice between test commands, visual QA, or a
composite gate.

New behavior, all five platforms (Claude Code native + cursor / copilot /
codex / gemini):

- **Phase 0 break-condition resolution.** When `--loop` is set, the
  coordinator prompts the user to pick one of four presets:
  - `test-auto` — auto-detect the stack (npm / pytest / cargo / go / …)
    and use its standard test command.
  - `visual-qa` — dispatch the `visual-qa` skill as a subagent each
    iteration. Optional `spec` path supported.
  - `custom shell` — free-form one-liner (the original behavior).
  - `composite` — sequential AND of the above. Short-circuits on first
    failure so a cheap lint/type check can gate a slow visual-qa.
  After picking, the user is asked whether to save the choice to
  `.agent-all.json`.
- **`--break-condition=<spec>` CLI flag.** Non-interactive override.
  Accepts a JSON object (e.g. `'{"type":"visual-qa"}'`) or a plain shell
  string (treated as `{"type":"shell","cmd":<string>}`).
- **`--reconfigure` CLI flag.** Force the interactive prompt even when
  `.agent-all.json` already has a non-default value.
- **Non-interactive fallback.** `--yes`, non-TTY invocations, or an
  already-customised `.agent-all.json` silently reuse the existing
  config — no surprise prompt in CI.

### Added — `lib/break-resolver.mjs` (source-of-truth)

New shared lib in `plugins/harness-floor/skills/agent-all/lib/`, vendored
byte-identical to each of the four platform siblings:

- `normalizeBreakCondition(input)` — accepts a string or `{type, ...}`
  object; returns a canonical normalised spec or `null` for invalid.
- `detectStackTestCommand(cwd)` — file-based stack sniffing
  (package.json → npm test, pyproject.toml → pytest, Cargo.toml → cargo
  test, go.mod → go test, plus Gemfile / composer.json / pom.xml /
  build.gradle).
- `buildShellCommand(spec, {cwd})` — resolves to a single runnable shell
  line for shell / test-auto / pure composite specs; returns `null`
  whenever a visual-qa step is involved (those need a non-shell runner).
- `needsVisualQARunner(spec)` — true when the spec or any nested step is
  `visual-qa`.
- `isDefaultOrMissing(spec)` — used by Phase 0 to decide whether to
  prompt.
- `PRESET_CATALOGUE` — four entries (`test-auto`, `visual-qa`, `custom`,
  `composite`) with `key`, `label`, `description`, and `build(opts)` for
  the prompt UI.

### Added — Phase 6 spec routing

`phases/6-loop.md` no longer assumes `breakCondition` is a shell string.
At iteration start it normalises the spec and routes per `spec.type`:

- `shell` / `test-auto` / pure `composite` → built into a single shell
  line, run via the platform's shell primitive (`spawnSync sh -c` /
  `read_bash` / `shell_command` / `run_shell_command`).
- `visual-qa` → dispatch the `visual-qa-<platform>` skill as a subagent;
  never run via shell. Treat thrown errors as exit 1 — visual-qa must
  explicitly report success.
- `composite` containing visual-qa → run each step in order, short-circuit
  on first non-zero exit.

`config-loader.mjs` validation extended to accept either form; vendored
copies in cursor + copilot synced to match.

### Added — 27 + 45 tests

- `tests/lib/break-resolver.test.mjs` (27 tests) — covers normalisation,
  stack detection, shell-command build, composite short-circuit
  reasoning, and the preset catalogue contract.
- `tests/lib/agent-all-loop-interactive.test.mjs` (45 tests) — doc-level
  contracts across all five platforms: Phase 0 documents the four
  presets + non-interactive fallback + save-confirmation + break-resolver
  lib reference; Phase 6 routes on `spec.type`, dispatches a subagent
  for visual-qa (never `sh -c`), and short-circuits composites; SKILL.md
  documents `--break-condition` + `--reconfigure`.

Total suite: **1019 → 1091 passing**.

## Verification safety net + release-grade README polish — 2026-05-19

### Added — two-layer verification safety net for `/agent-all --loop`

The previous loop semantics relied on `breakCondition` + `--max-iter` +
`--max-cost`. Broken code could still pass through if an implementer
subagent claimed STATUS: completed without actually verifying. Closed
this gap with mandatory directives in Phase 3 + Phase 4 docs:

**Phase 3 (Dispatch) — implementer directive (5 platforms):**

> Before reporting `STATUS: completed`, invoke `superpowers:verification-before-completion`
> to run the project's test command. Do not mark a task complete if
> verification fails — report `STATUS: blocked, REASON: verification failed`
> instead.
>
> For tasks adding new behavior (feature work, not hotfixes), invoke
> `superpowers:test-driven-development` to write tests before
> implementation. Recommended, not strictly enforced.

**Phase 4 (Gate) — reviewer directive (5 platforms):**

> When evaluating the wave's diff, explicitly verify that each implementer
> ran `superpowers:verification-before-completion` and the verification
> passed. If skipped OR failed, escalate as a `critical` issue regardless
> of code quality verdict — this blocks the wave at Phase 4.

Two-layer net: implementers verify; reviewers audit that verification
actually happened. Combined with hard caps and breakCondition, broken
code can't sneak into a PR even on long unattended `--loop` runs.

Updated phase docs in all 5 platforms:
- `plugins/harness-floor/skills/agent-all/phases/{3-dispatch,4-gate}.md`
- `plugins/harness-floor-{cursor,copilot,codex,gemini}/skills/agent-all-<p>/phases/{3-dispatch,4-gate}.md`

20 new tests (`tests/lib/agent-all-verification-directive.test.mjs`)
checking all 10 files mention the directive + flag TDD as recommendation
not enforcement + name the two-layer safety net.

### Changed — README release polish

- **Status badges** added to README header (tests/plugins/themes/license)
- **NEW "Prerequisites" section** — Node ≥ 20, git, gh, marketplace
  support, target CLI installed for per-platform install. Also names
  `superpowers` + `context-mode` as strongly recommended peer plugins.
- **Pillar #2** expanded to mention the two-layer verification safety
  net (broken code can't sneak into a PR).
- **FAQ "Is /agent-all --loop safe?"** rewritten to spell out all four
  layers (hard caps, breakCondition, implementer verification, reviewer
  audit).
- **NEW "Status" table** at bottom — honest matrix of what's verified
  (tests, install renderers, marketplace, Claude Code skills) vs what
  needs live CLI verification vs what's deferred (v2 thrift, SDK
  hookups).
- **NEW "Roadmap" section** — live runtime verification, v2 thrift,
  SDK hookups, explore/debug ports, transcript-listener bridge,
  telemetry opt-in.
- **NEW "License & Contributing" footer** — MIT, PR conventions,
  pre-submit checks (node --test, sync-lib --check), repo conventions
  (no cross-plugin imports, sentinel-based hook protocol).
- Test count updated 981 → 1019 throughout.

### Result

**1019/1019 tests pass** (+20 verification-directive tests).

Both English + Korean READMEs synced. Both CHANGELOGs synced.

## Cross-platform install — fill missing builder renderers + orchestrator — 2026-05-18

### Added

Closes the cross-platform install gap. Before today, `harness-builder-codex`,
`harness-builder-copilot`, and `harness-builder-gemini` had templates +
SKILL.md but no shell-callable installer — users on those CLIs couldn't
bootstrap a project without Claude Code mediating. README had been
documenting fake commands like `gh copilot plugins install ...` that
don't exist.

**New install renderers** (3 files):
- `plugins/harness-builder-codex/bin/init.mjs` — writes `AGENTS.md` +
  `.codex/skills/{planner,dev,reviewer}/SKILL.md`; emits `config.toml`
  snippet to stdout for `~/.codex/config.toml` merge.
- `plugins/harness-builder-copilot/bin/init.mjs` — writes `AGENTS.md` +
  `.github/copilot-instructions.md` + `.github/instructions/<role>.instructions.md`
  + `.github/hooks/*.json` (3 files); emits `mcp-config.json` to stdout.
- `plugins/harness-builder-gemini/bin/init.mjs` — writes `GEMINI.md` +
  `.gemini/skills/{planner,dev,reviewer}/SKILL.md`; emits `settings.json`
  snippet to stdout.

All three follow the `harness-builder-cursor/bin/init.mjs` pattern:
`--ctx <path>`, `--force`, env-var fallbacks (`PURPOSE`/`SIZE`/etc),
`detectProject()` for stack auto-detection, refuse-without-force
protection.

**New orchestrator script** (`scripts/install-platform.sh`):

```bash
./scripts/install-platform.sh --platform=cursor --target=...        # all 3 themes
./scripts/install-platform.sh --platform=codex --target=. --theme=floor
./scripts/install-platform.sh --platform=vscode-copilot --target=.  # aliases to copilot
```

Supported platforms: `cursor`, `copilot`, `vscode-copilot`, `codex`,
`gemini`. Supported themes: `all` (default), `builder`, `floor`, `thrift`.
Iterates the right `bin/init.mjs` + `bin/install.mjs` renderers and
prints platform-specific "what was written" summary at the end.

### Tests

- `tests/lib/harness-builder-cli-init.test.mjs` — 18 tests (6 per
  plugin × 3 plugins): usage error, non-existent target, full install +
  config snippet stdout, `--ctx` override, `--force` overwrite, env-var
  flow.
- Full suite: **999/999 tests pass** (was 981, +18).

### README updates

- "Use it on other AI tools" section rewritten with accurate one-line
  install per platform (`./scripts/install-platform.sh --platform=...`).
- Removed the fake commands (`gh copilot plugins install`,
  `codex plugins install`, `gemini extensions install`) and explicitly
  flagged them as "don't run these — they don't exist".
- New "Once installed, how do you actually use it?" table covering the
  entry point per platform (Claude Code slash command, Cursor chat
  invocation, Copilot CLI `gh copilot suggest`, VS Code Copilot Chat,
  Codex CLI, Gemini CLI).
- "What each platform receives" table showing the exact files written
  per platform — no more guessing.

## README — main-thread isolation as the real value prop — 2026-05-18

### Changed

The previous version described `/agent-all` as "runs as one pipeline"
without explaining the actual mechanism that makes long-running loops
possible. Updated both READMEs to surface the real story:

**Top-of-README pillar #2 rewritten** from "Agent-first execution" to
**"Agent-first execution that preserves your main thread"** — explicit
about WHY this scales:
- Phase 3 (Dispatch) and Phase 4 (Gate) run in **isolated subagents**
  via `superpowers:subagent-driven-development`
- Subagents' turn-by-turn output (code reads, patch attempts, failed
  test runs) never enters main conversation
- Main session sees only verdicts (`{status, commits, costUSD}`)
- That's why the same Claude Code session can keep going for hours

**Pillar #3 reframed** from "Self-sustaining loops" to **"Composable
for unattended runs"** — names the three pieces and their division of
labor (loop drives work, thrift compresses what does accumulate, goal
keeps session alive).

**"Self-sustaining workflows" section restructured**:
- New "Why this works — main-thread isolation" subsection up front,
  with a per-phase table showing exactly what enters main context vs
  what stays in isolated subagents
- New "Three pieces and how they divide the work" table making the
  loop/thrift/goal collaboration explicit ("agent-all isolates per-
  iteration; thrift compresses across iterations; goal keeps session
  alive")
- Recipe walkthrough now names which phases run where ("brainstorm
  with you in main → plan in main → dispatch implementer subagents
  in isolation")

This addresses the feedback that the prior writeup left users to
infer "why does this scale" — now it's a numbered explanation up top
with a per-phase mechanism table later.

Both English + Korean updated.

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
- **`/agent-init --theme=floor` is now the DEFAULT.** Opt out with `/agent-init --lite` (`--theme=lite` remains a compatibility alias).

### Added
- `/agent-init --theme=thrift` flag — RESERVED stub for Theme B (no behaviour yet).
- `/agent-all` skill in `harness-floor` (Theme C-2): 7-phase pipeline wrapping superpowers brainstorming + writing-plans + subagent-driven-development, with optional `--loop` (Theme C-3 ralph-pattern absorbed as flag).
- `/agent-init --theme=floor` integration (now default): seeds `.agent-all.json` alongside `.visual-qa.json` and adds Floor section to generated CLAUDE.md.
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
