# visual-qa-cursor — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `1fd58ba`
(initial scaffold) and `e8d9494` (6-phase orchestrator prompt-template port)
**Purpose:** Decompose the remaining implementation work to graduate
`visual-qa-cursor` from prompt-template + page-subagent scaffold to a
fully installable, awaiter-tracked visual-QA pipeline on Cursor.

## Why this spec is small relative to siblings

The 6-phase pipeline already exists as phase docs + a single
`@visual-qa-page` background subagent template. Cursor's planner does the
parallel dispatch implicitly via `is_background: true`. The remaining work
is the same shape as `agent-all-cursor`:

1. Make the kit installable (extend `bin/init.mjs`).
2. Add minimum-viable Node helpers the coordinator must invoke deterministically
   (config-load + matrix-build + diff vs prior + report render).
3. Document/test the awaiter limitation honestly (no programmatic detection
   of background-chat completion).

Total estimate: **3 days** (matches the per-platform decomposition pattern —
visual-qa-cursor is structurally smaller than visual-qa-{codex,copilot,gemini}
for the same reason agent-all-cursor is).

## What the scaffold currently provides

Shipped in commits `1fd58ba` and `e8d9494`:

- `plugins/harness-floor-cursor/skills/visual-qa-cursor/SKILL.md` — front
  matter, usage, flags, pipeline table, primitive map.
- `phases/0-preflight.md` through `phases/5-summary.md` — six phase docs.
- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed.
- `templates/mcp-snippet.json.hbs` — `.cursor/mcp.json` Playwright entry.
- `templates/agents/visual-qa-page.md.hbs` — per-page capture+analyze
  background subagent (`is_background: true`).
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt.
- `templates/report.md.hbs` — human-readable report.
- `references/porting-notes.md` — Cursor-specific limitations + future work.

`bin/init.mjs` exists in `harness-floor-cursor/bin/` and renders the
visual-qa template files, but does not yet copy lib modules or seed
agent files. No lib modules in `skills/visual-qa-cursor/` yet.

## What needs to be implemented

### 1. Lib modules (`skills/visual-qa-cursor/lib/`)

Four Node modules that the coordinator invokes via `read_bash`:

- `lib/config-loader.mjs` — vendored from
  `plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs`, zero diff.
- `lib/matrix-builder.mjs` — vendored from source-of-truth, zero diff.
- `lib/cost-estimator.mjs` — vendored, zero diff.
- `lib/diff-runs.mjs` — vendored, zero diff.
- `lib/state-rw.mjs` — **new.** Atomic read/write for `.visual-qa-state.json`
  (write tmp + rename). Same pattern as agent-all-cursor's `state-rw.mjs`.
- `lib/report-renderer.mjs` — **new.** Renders `report.md.hbs` against
  aggregated `report.json`. Pulled into a lib so the same renderer can run
  from the coordinator's `read_bash` and from unit tests.
- `lib/page-result-collector.mjs` — **new (best-effort).** Polls
  `<slug-dir>/<page>/_result.json` files written by per-page subagents.
  Used by Phase 4 to detect "all pages done" without user confirmation,
  *if* the page subagent template is updated to emit `_result.json` on
  completion. Falls back to user-confirm prompt on timeout.

### 2. `bin/init.mjs` extension

Extend existing `harness-floor-cursor/bin/init.mjs` to:

- Detect `--skill=visual-qa` (or always-install via subcommand) flag.
- Render `.visual-qa.json` template into target repo (skip if exists).
- Render `.cursor/mcp.json` snippet (merge if file exists).
- Copy `templates/agents/visual-qa-page.md.hbs` into
  `<repo>/.cursor/agents/visual-qa-page.md` (render Handlebars).
- Copy lib modules into `<repo>/.cursor/visual-qa/lib/`.
- Idempotent; respect `--force`.

### 3. `templates/agents/visual-qa-page.md.hbs` hardening

Current template (per scaffold) directs the per-page subagent to capture
screenshots, run analysis, and return JSON in chat. For programmatic
awaiter to work, the template must additionally:

- Write a `_result.json` file at `<OUTPUT_DIR>/_result.json` on completion
  (success or failure).
- Include `STATUS: completed|incomplete|failed` and `errors[]` in that file.
- The file write is the awaiter's signal — coordinator polls for it via
  `page-result-collector.mjs`.

### 4. Phase doc tightening

Each phase doc needs shell snippets:

- Phase 0: `node lib/config-loader.mjs .visual-qa.json` + MCP presence check.
- Phase 1: `node lib/matrix-builder.mjs <config-path> | node lib/cost-estimator.mjs`.
- Phase 2: state-rw read/init.
- Phase 3: explicit "wait for all `@visual-qa-page` subagents OR for
  `_result.json` to appear in every page subdir; if neither after N
  seconds, prompt user to confirm".
- Phase 4: `node lib/diff-runs.mjs <current.json> <prior.json>`.
- Phase 5: `node lib/report-renderer.mjs <report.json>` → `report.md`.

### 5. Optional `visual-qa-coordinator.md.hbs` agent template

The SKILL.md hints at a future coordinator agent. Adding it would let users
invoke `@visual-qa-coordinator run /visual-qa` instead of walking through
phases manually. Reuses Cursor's planner the same way `agent-all-coordinator`
does. Out of scope for the 3-day budget but documented as Phase-2 follow-up.

## File-by-file work breakdown

### `skills/visual-qa-cursor/lib/config-loader.mjs`

Vendored from `plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs`.
Identical: `REQUIRED_TOP`, `validate`, `resolveEnv`, `loadConfig`. ~65 LoC.

### `skills/visual-qa-cursor/lib/matrix-builder.mjs`

Vendored. `buildMatrix(config) → matrix[]` with `kind: page|component|flow_step`
entries. ~25 LoC.

### `skills/visual-qa-cursor/lib/cost-estimator.mjs`

Vendored. `MODEL_PRICES` + `estimateCost(matrix, model)`. ~15 LoC.

### `skills/visual-qa-cursor/lib/diff-runs.mjs`

Vendored. `issueKey(issue)` SHA1-based; `diffRuns(current, prior) → {new,
resolved, unchanged}`. ~25 LoC.

### `skills/visual-qa-cursor/lib/state-rw.mjs` (new)

```js
export function readState(slugDir) // returns {} if missing
export function writeState(slugDir, state) // atomic temp+rename
```

~30 LoC.

### `skills/visual-qa-cursor/lib/report-renderer.mjs` (new)

```js
export function renderReport(reportJson, templatePath = "templates/report.md.hbs")
// returns markdown string. Coordinator writes via read_bash redirect.
```

Uses the same Handlebars-ish substitution helpers shipped in
`harness-floor-cursor/bin/lib/render.mjs`. ~40 LoC.

### `skills/visual-qa-cursor/lib/page-result-collector.mjs` (new)

```js
export async function awaitAllPages({ slugDir, pageNames, timeoutMs = 600000, intervalMs = 5000 })
// polls slugDir/<page>/_result.json for each name.
// Returns { settled: [...names], pending: [...names] } at timeout.
```

No Claude Code equivalent — Claude orchestrator's `Task` returns
synchronously. ~80 LoC.

### `templates/agents/visual-qa-page.md.hbs` (edit existing)

Add `_result.json` write step to the per-page workflow. The subagent must
write `{ page, status, captures, analyses, errors }` to
`<OUTPUT_DIR>/_result.json` on completion. ~10 lines added.

### `bin/init.mjs` extension

`installVisualQa(opts)` mirroring agent-all install pattern:
- Render `.visual-qa.json`, `.cursor/mcp.json` snippet.
- Render `.cursor/agents/visual-qa-page.md`.
- Copy lib modules into `<repo>/.cursor/visual-qa/lib/`.

~80 LoC.

### Phase doc tightening

Add "Shell helpers" sections to phases 0, 1, 2, 3, 4, 5. ~10 lines × 6 = ~60.

## Test plan

### Unit tests

1. `tests/lib/cursor-visual-qa-config-loader.test.mjs` — vendored sync.
2. `tests/lib/cursor-visual-qa-matrix-builder.test.mjs` — vendored sync.
3. `tests/lib/cursor-visual-qa-cost-estimator.test.mjs` — vendored sync.
4. `tests/lib/cursor-visual-qa-diff-runs.test.mjs` — vendored sync.
5. `tests/lib/cursor-visual-qa-state-rw.test.mjs` — round-trip;
   interrupted write doesn't corrupt.
6. `tests/lib/cursor-visual-qa-report-renderer.test.mjs` — fixture
   `report.json` → fixed `report.md` output.
7. `tests/lib/cursor-visual-qa-page-result-collector.test.mjs` — pre-
   populate `_result.json` files in a tmpdir; verify resolution. Verify
   timeout returns pending list.

### Integration tests

8. `tests/integration/cursor-visual-qa-install.test.mjs` — invoke
   `installVisualQa({repoDir, force})` into tmpdir; verify all files
   appear at expected paths; idempotency.
9. `tests/integration/cursor-visual-qa-templates-render.test.mjs` — render
   each `.hbs` with fixed ctx; snapshot match.

### Manual checklist

- [ ] Install kit into a real Cursor workspace.
- [ ] Verify `.cursor/mcp.json` Playwright entry; restart Cursor; confirm
      Playwright MCP tools appear.
- [ ] Run `@visual-qa-page` against a single page; confirm `_result.json`
      written.
- [ ] Full pipeline manual walk-through (phases 0–5) with a 2-page
      `.visual-qa.json`.
- [ ] Diff vs prior run: re-run, verify Phase 4 reports unchanged + new
      sections correctly.

## Effort estimate breakdown

Target: **3 days** (matches Cursor's overall lighter-weight pattern; see
`agent-all-cursor` spec for the same shape).

| Slice | Work | Hours |
|---|---|---|
| Lib vendoring (4 files) | Copy + sync tests | 2 |
| `state-rw.mjs` | New | 2 |
| `report-renderer.mjs` | New | 3 |
| `page-result-collector.mjs` | New; polling + timeout | 3 |
| Template hardening | `_result.json` write step | 1 |
| `bin/init.mjs` extension | `installVisualQa` + idempotency | 4 |
| Phase doc tightening | Shell snippets × 6 | 3 |
| Unit tests (7 files) | All lib coverage | 4 |
| Integration tests (2 files) | Install + render | 2 |
| Manual checklist + buffer | Real Cursor smoke test | 4 |
| **Total** | | **28 hr ≈ 3-4 days** |

(Slight overage vs the strict 3-day target — `page-result-collector` is the
swing-cost, depends on whether `_result.json` polling holds up under
real-world Cursor background-agent behaviour. Budget allows a 4-day slip
without spilling into the next sprint.)

## Open questions

1. **Background-chat completion detection.** Cursor doesn't expose an API
   for "this background chat ended". Our workaround is per-page
   `_result.json` write + poll. Risk: if the subagent crashes before the
   write, the coordinator hangs at timeout. Mitigation: timeout → prompt
   user. **Document the limitation; revisit if `cursor-cli` GA adds a
   transcript-listener.**

2. **MCP tool name path.** Per `references/porting-notes.md` (line 26),
   Cursor's MCP tool names are `mcp__playwright__browser_*`, not Claude
   Code's `mcp__plugin_playwright_playwright__browser_*`. Need to
   confirm the exact name against a live Cursor install — naming may have
   drifted with newer Playwright MCP releases.

3. **`.cursor/mcp.json` merge semantics.** If the user already has other
   MCP servers configured, the installer must merge, not overwrite. JSON
   merge isn't always lossless (key order, comments). Mitigation: emit
   snippet for manual paste if the file exists and has other entries;
   only auto-merge when the file is empty/new.

4. **Cost cap on Cursor.** Cursor doesn't surface per-turn cost. Same
   limitation as agent-all-cursor. Phase 1's cost estimation runs once
   pre-flight via `cost-estimator.mjs`; we abort if estimate >
   `--budget`, but we can't enforce mid-run. **Acceptable for MVP.**

5. **Report-renderer template engine.** We reuse the simple Handlebars-ish
   substitution in `bin/lib/render.mjs`. If a user wants conditionals or
   loops more complex than that engine supports, they edit `report.md.hbs`
   and accept the limitations. **Documented; not a blocker.**

6. **`page-result-collector` poll interval.** Default 5s. Tight enough
   for fast feedback, loose enough not to thrash. Long captures (auth flow
   + 10 components × 5 breakpoints) can exceed 10 minutes; default
   timeout of 10 minutes (600000ms) may need to be config-driven.

7. **Cursor agent file discovery path.** `.cursor/agents/visual-qa-page.md`
   needs to be in a path Cursor scans. We assume the workspace root. If
   Cursor adds nested-workspace agent scoping (per recent changelog
   chatter), the installer needs to know where. **Confirm at install
   time.**

## Acceptance criteria

- [ ] `node plugins/harness-floor-cursor/bin/init.mjs --skill=visual-qa
      --target=<dir>` installs config, MCP snippet, agent file, libs.
- [ ] Re-running without `--force` reports zero overwrites.
- [ ] Vendored libs (`config-loader`, `matrix-builder`, `cost-estimator`,
      `diff-runs`) match source-of-truth byte-for-byte.
- [ ] `lib/page-result-collector.mjs` resolves correctly when pre-populated
      `_result.json` files exist; times out cleanly otherwise.
- [ ] `lib/report-renderer.mjs` renders a fixture report deterministically.
- [ ] All 7 unit tests + 2 integration tests pass under `npm test`.
- [ ] Manual smoke test: 2-page `.visual-qa.json`, full pipeline, real
      Cursor workspace; report.md generated.
- [ ] `references/porting-notes.md` updated with confirmed MCP tool name
      path and any `cursor-cli` transcript-listener findings.
- [ ] No changes to `plugins/harness-floor/skills/visual-qa/`.
- [ ] CHANGELOG entry under a `Cursor visual-qa graduation` heading.
