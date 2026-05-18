# visual-qa-codex — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `b0a2295`
(initial scaffold) and `e8d9494` (6-phase orchestrator port)
**Purpose:** Decompose the remaining implementation work to graduate
`visual-qa-codex` from scaffold to a functional visual-QA pipeline on Codex
CLI, gated on the same `agent` hook research spike as agent-all-codex.

## Why visual-qa-codex needs two dispatch strategies

Same `agent` hook uncertainty as agent-all-codex:

- **Preferred (post-spike):** `agent` hook fires per-page; coordinator
  awaits via `codex agent wait --task-prefix visual-qa/page/`.
- **Fallback (always works):** sequential invocation of
  `.codex/skills/visual-qa-page/SKILL.md` one page at a time.

Visual-qa is less painful to ship sequential-only than agent-all is, because
typical visual-qa runs have fewer pages than agent-all has wave-tasks, so
the slowdown impact is bounded.

Total estimate: **1 week**.

## What the scaffold currently provides

Shipped in commits `b0a2295` and `e8d9494`:

- `plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md` — usage,
  flags (`--dispatch=...`), pipeline table, primitive map.
- `phases/0-preflight.md` through `phases/5-summary.md` — six phase docs.
- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed.
- `templates/mcp-snippet.toml.hbs` — `[mcp_servers.playwright]` block.
- `templates/codex-hooks-snippet.toml.hbs` — `[[hooks.agent]]` template
  (pending spike verification).
- `templates/page-prompt.md.hbs` — per-page subagent prompt.
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt.
- `templates/report.md.hbs` — human-readable report.
- `references/porting-notes.md` — graduation + research questions.

`bin/init.mjs` exists; does not yet install the visual-qa kit. Lib modules
not yet written.

## What needs to be implemented

### 1. Research spike dependency (shared with agent-all-codex)

This spec **inherits** the `agent` hook research spike from
`2026-05-18-agent-all-codex-impl-spec.md`. If that spec executes first,
this one consumes its findings directly. If they run in parallel, allocate
2 days of overlap or split the spike across both.

### 2. Lib modules

- `lib/config-loader.mjs` — vendored, zero diff.
- `lib/matrix-builder.mjs` — vendored, zero diff.
- `lib/cost-estimator.mjs` — vendored, zero diff.
- `lib/diff-runs.mjs` — vendored, zero diff.
- `lib/state-atomic.mjs` — **new.** `apply_patch` + `shell_command: mv`
  pattern (same as agent-all-codex's `state-atomic.mjs`).
- `lib/report-renderer.mjs` — **new.** Same as siblings'.
- `lib/dispatch-page-agent-hook.mjs` — **new (post-spike).** Wraps `agent`
  hook invocation for per-page dispatch.
- `lib/dispatch-page-sequential.mjs` — **new.** Invokes
  `.codex/skills/visual-qa-page/SKILL.md` sequentially via `Skill: visual-qa-page`
  text emission.
- `lib/await-pages.mjs` — **new.** Hook mode: `codex agent wait --task-prefix
  visual-qa/page/`. Sequential mode: no-op.
- `lib/cost-tracker.mjs` — **new.** Reads costUSD from wait response if
  available; else estimates from telemetry file or transcript length.

### 3. Hook installer (`bin/install-hook.mjs` — shared with agent-all-codex)

Merges `[[hooks.agent]]` entry into `~/.codex/config.toml`. If both
visual-qa-codex and agent-all-codex install hooks, both should use the
same matcher entry (one hook handles all `agent` invocations and routes
by `task-prefix`).

### 4. `bin/init.mjs` extension

Extend existing `harness-floor-codex/bin/init.mjs` to:

- Render `.visual-qa.json` into `<repo>/.visual-qa.json`.
- Render MCP snippet into `~/.codex/config.toml` or workspace
  `.codex/config.toml` (merge).
- Copy lib modules into `<repo>/.codex/visual-qa/lib/`.
- Seed `.codex/skills/visual-qa-page/SKILL.md` stub from
  `templates/page-prompt.md.hbs`.
- Optional `--with-hook` flag.

### 5. Phase doc tightening

Each phase doc gains shell snippets:

- Phase 0: config-loader, MCP probe, dispatch-strategy auto-detect.
- Phase 1: matrix-builder + cost-estimator; confirm prompt via `ask_user`.
- Phase 2: state-atomic init; find prior run.
- Phase 3: dispatcher selected by strategy; awaiter runs after dispatch.
- Phase 4: diff-runs; write report.json via `apply_patch`.
- Phase 5: report-renderer → report.md; print summary.

## File-by-file work breakdown

### Vendored libs

- `skills/visual-qa-codex/lib/config-loader.mjs` — ~65 LoC, zero diff.
- `skills/visual-qa-codex/lib/matrix-builder.mjs` — ~25 LoC, zero diff.
- `skills/visual-qa-codex/lib/cost-estimator.mjs` — ~15 LoC, zero diff.
- `skills/visual-qa-codex/lib/diff-runs.mjs` — ~25 LoC, zero diff.

### `skills/visual-qa-codex/lib/state-atomic.mjs` (new)

```js
export function buildPatchForState(prevJson, newJson)
// returns patch hunk apply_patch consumes, targeting <path>.tmp.
export function renameCmd(tmpPath, finalPath)
// returns the shell_command text the coordinator should issue after apply_patch.
```

Difference from Claude Code: Claude Code's `Write` is atomic at the
filesystem; Codex's `apply_patch` writes in-place. We simulate by
patching `<path>.tmp` then renaming. ~50 LoC.

### `skills/visual-qa-codex/lib/report-renderer.mjs` (new)

Same as siblings'. ~40 LoC.

### `skills/visual-qa-codex/lib/dispatch-page-agent-hook.mjs` (new, post-spike)

```js
export function buildAgentInvocation({ page, config, slugDir, pageId })
// payload shape per spike findings.
export async function dispatchPageAgent(invocation, codexBin)
// returns { taskPrefix, started }.
```

Difference from Claude Code: Claude's `Task` returns the result synchronously.
Codex's `agent` hook fires async. Awaiter is separate. ~80 LoC.

### `skills/visual-qa-codex/lib/dispatch-page-sequential.mjs` (new)

```js
export function buildSkillInvocation({ page, config, slugDir, pageId })
// returns text to emit (Skill: visual-qa-page + body).
export function parseSkillResult(skillOutput)
// extracts { page, captures, analyses, status, errors }.
```

~70 LoC.

### `skills/visual-qa-codex/lib/await-pages.mjs` (new)

```js
export async function awaitPagesHook(taskPrefix, timeoutMs, codexBin)
export async function awaitPagesSequential(/* no-op */)
export async function awaitPages({ strategy, ...args })
```

~70 LoC.

### `skills/visual-qa-codex/lib/cost-tracker.mjs` (new)

Reads from wait response or telemetry file. ~80 LoC.

### `bin/install-hook.mjs` (shared)

If agent-all-codex spec runs first, this is already in place. Otherwise
write it now. ~120 LoC.

### `bin/init.mjs` extension

`installVisualQa(opts)` — render config, MCP, libs, page-skill stub.
~100 LoC.

### Phase doc tightening

Shell snippets in 6 phases. ~10 lines × 6 = ~60.

## Test plan

### Unit tests

1. `tests/lib/codex-visual-qa-config-loader.test.mjs` — vendored sync.
2. `tests/lib/codex-visual-qa-matrix-builder.test.mjs` — vendored sync.
3. `tests/lib/codex-visual-qa-cost-estimator.test.mjs` — vendored sync.
4. `tests/lib/codex-visual-qa-diff-runs.test.mjs` — vendored sync.
5. `tests/lib/codex-visual-qa-state-atomic.test.mjs` — patch shape +
   rename command emission.
6. `tests/lib/codex-visual-qa-report-renderer.test.mjs` — fixture →
   golden.
7. `tests/lib/codex-visual-qa-dispatch-page-sequential.test.mjs` —
   `buildSkillInvocation` shape; `parseSkillResult` edge cases.
8. `tests/lib/codex-visual-qa-await-pages.test.mjs` — hook mode against
   mocked `codex agent wait`; sequential mode no-op.
9. `tests/lib/codex-visual-qa-cost-tracker.test.mjs` — both paths.

### Integration tests

10. `tests/integration/codex-visual-qa-install.test.mjs` — install into
    tmpdir; verify libs + config + MCP + page-skill stub.
11. `tests/integration/codex-visual-qa-hook-install.test.mjs` — hook
    merge (shared with agent-all-codex if applicable).

### Manual checklist

- [ ] Research spike (if not yet done): probe live Codex CLI for `agent`
      hook syntax + behaviour.
- [ ] Sequential-only E2E on a 2-page `.visual-qa.json`.
- [ ] If spike succeeds: agent-hook E2E with parallel dispatch.
- [ ] Diff vs prior run.
- [ ] MCP server: confirm Playwright tools available after
      `[mcp_servers.playwright]` install + Codex restart.

## Effort estimate breakdown

Target: **1 week**.

| Slice | Work | Hours |
|---|---|---|
| Research spike (shared) | 0 hr if agent-all-codex spec ran first; else 12 | 0–12 |
| Lib vendoring (4 files) | Copy + sync tests | 2 |
| `state-atomic.mjs` | apply_patch wrapper | 3 |
| `report-renderer.mjs` | New | 3 |
| `dispatch-page-sequential.mjs` | New | 4 |
| `dispatch-page-agent-hook.mjs` | Post-spike | 5 |
| `await-pages.mjs` | Hook + sequential modes | 4 |
| `cost-tracker.mjs` | Two-path | 4 |
| `bin/install-hook.mjs` | 0 if shared; else 5 | 0–5 |
| `bin/init.mjs` extension | Renderer + page-skill stub | 4 |
| Phase doc tightening | Shell snippets × 6 | 3 |
| Unit tests (9 files) | All lib coverage | 6 |
| Integration tests (2 files) | Install + hook | 3 |
| Manual checklist + buffer | Spike + E2E + fixes | 5 |
| **Total (spike already done)** | | **49 hr ≈ 1 week** |
| **Total (spike fresh)** | | **66 hr ≈ 1.5 weeks** |

If this spec runs **before** agent-all-codex, expect 1.5 weeks. If
**after**, expect 1 week.

## Open questions

1. **`agent` hook contract.** Same as agent-all-codex (decomposition spec
   line 24-26). Shared spike. **Blocks `dispatch-page-agent-hook.mjs`.**

2. **`codex agent wait --task-prefix` CLI shape.** Assumed; not verified.
   Same spike output.

3. **Per-agent cost via wait response.** Same unknown. Estimator fallback
   exists.

4. **TOML merge for MCP block.** `[mcp_servers.playwright]` may conflict
   with user-defined MCP servers. `bin/install-hook.mjs`'s TOML parser is
   reusable here.

5. **Sequential dispatch slug-dir collision.** When sequential, all pages
   write to the same slug dir under different `<page>/` subdirs. No
   collision risk, but ensure the dispatcher passes the right
   `OUTPUT_DIR=<slug-dir>/<page>/` to each skill invocation.

6. **MCP session reuse across sequential pages.** Sequential mode keeps
   the parent Codex session; Playwright MCP server stays connected. Each
   page must call `browser_navigate` fresh — that should reset enough
   state. Verify with manual test (auth flow cookies leaking across pages?).

7. **`bin/install-hook.mjs` sharing.** Whether shared with agent-all-codex
   or duplicated. Recommend shared with a `--matcher visual-qa|agent-all|
   both` flag. **Decide before shipping.**

8. **Page-skill stub seeding.** `.codex/skills/visual-qa-page/SKILL.md`
   stub seeded by `bin/init.mjs`. If a user has their own custom
   `visual-qa-page` skill, do we overwrite? **Skip unless `--force`.**

9. **`codex agent wait` timeout.** Default is unknown. Long visual-qa
   runs (auth flow + many breakpoints) can exceed defaults. Need to set
   explicit timeout via wait command flags.

## Acceptance criteria

- [ ] Research spike findings recorded (either in agent-all-codex spike
      file or a sibling `codex-visual-qa-hook-spike.md`).
- [ ] `node plugins/harness-floor-codex/bin/init.mjs --skill=visual-qa
      --target=<dir>` installs config, MCP, libs, page-skill stub.
- [ ] `node plugins/harness-floor-codex/bin/install-hook.mjs` merges
      `[[hooks.agent]]`; idempotent.
- [ ] All 9 unit tests + 2 integration tests pass.
- [ ] Vendored libs match source-of-truth byte-for-byte.
- [ ] Sequential dispatch E2E: 2-page `.visual-qa.json` in real Codex
      session; report generated.
- [ ] If spike confirms agent-hook viable: agent-hook E2E with parallel
      dispatch.
- [ ] `references/porting-notes.md` updated with spike findings.
- [ ] No changes to `plugins/harness-floor/skills/visual-qa/`.
- [ ] CHANGELOG entry under a `Codex visual-qa graduation` heading.
