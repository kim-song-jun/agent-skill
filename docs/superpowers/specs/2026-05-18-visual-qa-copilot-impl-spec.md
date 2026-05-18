# visual-qa-copilot — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `ecb86cb`
(initial scaffold) and `e8d9494` (6-phase orchestrator port)
**Purpose:** Decompose the remaining implementation work to graduate
`visual-qa-copilot` from scaffold to a functional visual-QA pipeline on
GitHub Copilot CLI, using Copilot's `task` tool for parallel per-page dispatch.

## Why Copilot is the second-cleanest visual-qa port

Same reason as `agent-all-copilot`: Copilot CLI v0.0.380+ ships a
purpose-built `task` tool that maps cleanly onto Claude Code's `Task`.
Visual-qa's parallel fan-out per page is a one-`task`-per-page invocation
with `subagentStop` (or `list_agents` polling) for the awaiter.

The complications are the same as agent-all-copilot:

1. Awaiter (hook vs poll, with auto-fall-back).
2. Cost tracking via `read_agent` if `costUSD` is exposed.

Total estimate: **1 week** (mirrors the agent-all-copilot estimate; visual-qa
is slightly less complex than agent-all because the per-page subagent
template is simpler than the per-task implementer, but cost-tracking +
awaiter work duplicates).

## What the scaffold currently provides

Shipped in commits `ecb86cb` and `e8d9494`:

- `plugins/harness-floor-copilot/skills/visual-qa-copilot/SKILL.md` —
  description, usage, flags, pipeline table, Copilot primitive map.
- `phases/0-preflight.md` through `phases/5-summary.md` — six phase docs.
- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed.
- `templates/mcp-snippet.json.hbs` — `~/.copilot/mcp-config.json` Playwright
  entry.
- `templates/page-prompt.md.hbs` — per-page subagent prompt template
  (consumed by `task({prompt, context})`).
- `templates/analysis-prompt.md.hbs` — per-image LLM analysis prompt.
- `templates/report.md.hbs` — human-readable report.
- `references/porting-notes.md` — graduation notes + known unknowns.

`bin/init.mjs` exists; does not yet install the visual-qa kit fully. No
lib modules in `skills/visual-qa-copilot/` yet.

## What needs to be implemented

### 1. Lib modules

- `lib/config-loader.mjs` — vendored, zero diff.
- `lib/matrix-builder.mjs` — vendored, zero diff.
- `lib/cost-estimator.mjs` — vendored, zero diff.
- `lib/diff-runs.mjs` — vendored, zero diff.
- `lib/state-rw.mjs` — **new.** Same atomic write pattern as
  visual-qa-cursor's state-rw.
- `lib/report-renderer.mjs` — **new.** Same as cursor's.
- `lib/dispatch-page-task.mjs` — **new.** Wraps the per-page `task({prompt,
  context})` invocation. Returns `{agentId, ok, error?}`. Coordinator can
  call directly through Copilot's tool surface; this lib formats the
  prompt + context deterministically.
- `lib/await-pages.mjs` — **new.** Variant of agent-all-copilot's
  `await-wave.mjs` specialized for visual-qa's per-page model:
  - hook mode: tail `~/.copilot/visual-qa/inbox.jsonl` (written by
    `subagentStop` hook dispatcher).
  - poll mode: `list_agents` every 2s.
  - auto-select at runtime.
- `lib/cost-tracker.mjs` — **new.** Same as agent-all-copilot but
  aggregated per-page instead of per-wave.
- `lib/memory-bridge.mjs` — **new.** Wraps `store_memory` for matrix +
  intermediate page results. Falls back to file.

### 2. Hook installer (`bin/install-hooks.mjs`)

Registers `subagentStop` into `~/.copilot/hooks.json`. The dispatcher
writes payloads to `<repo>/.copilot/visual-qa/inbox.jsonl`. **Same
installer as agent-all-copilot** — extract to a shared helper if both
specs go in flight together; otherwise ship two scripts that each merge
their inbox path.

### 3. `bin/init.mjs` extension

Extend existing `harness-floor-copilot/bin/init.mjs` to:

- Render `.visual-qa.json` template into `<repo>/.visual-qa.json` (skip if
  exists).
- Render MCP snippet into `~/.copilot/mcp-config.json` (merge) OR
  workspace `.mcp.json` (preferred for portability).
- Copy lib modules into `<repo>/.copilot/visual-qa/lib/`.
- Append visual-qa section to `.github/copilot-instructions.md`.
- Optional `--with-hook` flag invokes `install-hooks.mjs`.

### 4. Phase doc tightening

Each phase doc gains shell snippets:

- Phase 0: `node .copilot/visual-qa/lib/config-loader.mjs .visual-qa.json`;
  probe for `task` tool availability + `subagentStop` hook presence; MCP
  presence check.
- Phase 1: `node lib/matrix-builder.mjs` + `node lib/cost-estimator.mjs`;
  mirror matrix to `store_memory(key="visual-qa/matrix")`.
- Phase 2: state-rw init; find prior run.
- Phase 3: per-page `task({prompt: <rendered page-prompt>, context: ...})`;
  awaiter via `lib/await-pages.mjs`.
- Phase 4: `node lib/diff-runs.mjs <current> <prior>`; write `report.json`.
- Phase 5: `node lib/report-renderer.mjs report.json` → `report.md`; summary.

## File-by-file work breakdown

### Vendored libs

- `skills/visual-qa-copilot/lib/config-loader.mjs` — ~65 LoC, zero diff.
- `skills/visual-qa-copilot/lib/matrix-builder.mjs` — ~25 LoC, zero diff.
- `skills/visual-qa-copilot/lib/cost-estimator.mjs` — ~15 LoC, zero diff.
- `skills/visual-qa-copilot/lib/diff-runs.mjs` — ~25 LoC, zero diff.

### `skills/visual-qa-copilot/lib/state-rw.mjs` (new)

Same shape as visual-qa-cursor's `state-rw.mjs`. ~30 LoC.

### `skills/visual-qa-copilot/lib/report-renderer.mjs` (new)

Same as cursor's. ~40 LoC.

### `skills/visual-qa-copilot/lib/dispatch-page-task.mjs` (new)

```js
export function buildPageTaskCall({ page, config, slugDir, analysisPromptTemplate })
// returns { prompt: <rendered page-prompt.md>, context: { page, slugDir, baseUrl, breakpoints, components, auth } }
export function parsePageTaskResult(agentOutput)
// extracts { page, captures, analyses, status, errors }.
```

Difference from agent-all-copilot's `dispatch-task.mjs`: prompt template
is page-prompt, not implementer-task. Same overall shape. ~80 LoC.

### `skills/visual-qa-copilot/lib/await-pages.mjs` (new)

```js
export async function awaitPagesHook(agentIds, inboxPath, timeoutMs)
export async function awaitPagesPoll(agentIds, listAgentsFn, intervalMs, timeoutMs)
export async function awaitPages({ agentIds, strategy = "auto", inboxPath, listAgentsFn })
```

Identical to agent-all-copilot's `await-wave.mjs`. Consider extracting
into a shared `lib/await-copilot-agents.mjs` once both ports stabilise.
~140 LoC.

### `skills/visual-qa-copilot/lib/cost-tracker.mjs` (new)

Same as agent-all-copilot but indexes by `pageName` instead of `taskId`.
~90 LoC.

### `skills/visual-qa-copilot/lib/memory-bridge.mjs` (new)

Wraps `store_memory` / `recall_memory`. Used for matrix sharing across
parallel page tasks (each task can `recall_memory("visual-qa/matrix")`
instead of re-parsing the config). ~60 LoC.

### `bin/install-hooks.mjs` (new — or shared with agent-all-copilot)

Merges `subagentStop` into `~/.copilot/hooks.json` with dispatcher
writing to `<repo>/.copilot/visual-qa/inbox.jsonl`. ~100 LoC.

### `bin/init.mjs` extension

`installVisualQa(opts)` — render config + MCP + libs + instructions.md
append + optional hook install. ~100 LoC.

### Phase doc tightening

Shell snippets in 6 phases. ~10 lines × 6 = ~60.

## Test plan

### Unit tests

1. `tests/lib/copilot-visual-qa-config-loader.test.mjs` — vendored sync.
2. `tests/lib/copilot-visual-qa-matrix-builder.test.mjs` — vendored sync.
3. `tests/lib/copilot-visual-qa-cost-estimator.test.mjs` — vendored sync.
4. `tests/lib/copilot-visual-qa-diff-runs.test.mjs` — vendored sync.
5. `tests/lib/copilot-visual-qa-state-rw.test.mjs` — atomic round-trip.
6. `tests/lib/copilot-visual-qa-report-renderer.test.mjs` — fixture →
   golden.
7. `tests/lib/copilot-visual-qa-dispatch-page-task.test.mjs` —
   `buildPageTaskCall` shape; `parsePageTaskResult` edge cases.
8. `tests/lib/copilot-visual-qa-await-pages.test.mjs` — hook + poll
   modes; timeout.
9. `tests/lib/copilot-visual-qa-cost-tracker.test.mjs` — JSON path +
   estimate path.
10. `tests/lib/copilot-visual-qa-memory-bridge.test.mjs` — store/recall
    + file fallback.

### Integration tests

11. `tests/integration/copilot-visual-qa-install.test.mjs` — install into
    tmpdir.
12. `tests/integration/copilot-visual-qa-hook-install.test.mjs` — hook
    merge.

### Manual checklist

- [ ] Live Copilot CLI install + confirm `task` tool available.
- [ ] Probe `subagentStop` payload shape via `tools.list` RPC.
- [ ] End-to-end against a real 2-page `.visual-qa.json`; verify two
      parallel `task`s appear in `list_agents`.
- [ ] Diff vs prior run: re-run; verify Phase 4 reports new/resolved/
      unchanged sections.
- [ ] Cost cap: budget below per-page cost; verify Phase 3 aborts after
      first page.

## Effort estimate breakdown

Target: **1 week**.

| Slice | Work | Hours |
|---|---|---|
| Lib vendoring (4 files) | Copy + sync tests | 2 |
| `state-rw.mjs` | New | 2 |
| `report-renderer.mjs` | New | 3 |
| `dispatch-page-task.mjs` | New | 5 |
| `await-pages.mjs` | Hook + poll + auto-select | 8 |
| `cost-tracker.mjs` | Two-path | 4 |
| `memory-bridge.mjs` | Store/recall + file fallback | 4 |
| `bin/install-hooks.mjs` | JSON merge + dispatcher | 5 |
| `bin/init.mjs` extension | Renderer | 4 |
| Phase doc tightening | Shell snippets × 6 | 3 |
| Unit tests (10 files) | All lib coverage | 6 |
| Integration tests (2 files) | Install + hook | 3 |
| Manual checklist + buffer | Live Copilot probe + E2E | 5 |
| **Total** | | **54 hr ≈ 1 week** |

## Open questions

1. **`subagentStop` payload shape.** Same as agent-all-copilot. Need a
   live `tools.list` probe; phase docs and `await-pages.mjs` assume
   `{agentId, status, output, costUSD}`. **Spike blocks finalisation.**

2. **`task` tool concurrency cap.** Same unknown. Visual-qa is more
   sensitive than agent-all because page-count can easily exceed wave
   sizes (matrix.length × pages can hit 20+ in real configs). If Copilot
   caps at 5 concurrent tasks, fan-out chunks automatically — need to
   document the chunking behaviour. **Probe at preflight.**

3. **`store_memory` scope=repository TTL.** Matrix is written once and
   read by every page task. If memory evicts between write and the first
   read, every page task fails to recall. Mitigation: every page task
   reads the matrix file as fallback (path passed in `context`).

4. **`read_agent` cost field.** Same unknown. Cost-tracker degrades to
   estimation gracefully.

5. **MCP server scope.** Each `task`-dispatched agent gets its own MCP
   connection (or shares the parent's — TBD). If shared, browser context
   collisions between parallel page tasks are possible. The page-prompt
   template currently assumes per-task isolation. **Probe with stress
   test: 4 parallel tasks all driving Playwright.**

6. **Per-page `_result.json` write.** Unlike Cursor (which we use this as
   awaiter), Copilot's `subagentStop` hook is the canonical signal. The
   page subagent doesn't need to write `_result.json` — `read_agent`
   returns the full output. Less I/O machinery than the cursor port.

7. **`.github/copilot-instructions.md` collision with agent-all.** If
   both agent-all-copilot and visual-qa-copilot are installed, both append
   sections. Need clear section markers (`<!-- agent-all -->` / `<!--
   visual-qa -->`) so re-runs replace rather than duplicate.

8. **Hook installer reuse.** If both agent-all-copilot and
   visual-qa-copilot ship their own `install-hooks.mjs`, both register
   `subagentStop` and the second one clobbers the first. Solution: one
   shared `install-hooks.mjs` at the plugin level that takes a `--inbox`
   path and supports multiple inbox registrations. **Decide before
   shipping.**

## Acceptance criteria

- [ ] `node plugins/harness-floor-copilot/bin/init.mjs --skill=visual-qa
      --target=<dir>` installs config, MCP, libs, instructions section.
- [ ] `node plugins/harness-floor-copilot/bin/install-hooks.mjs` merges
      `subagentStop` cleanly; idempotent.
- [ ] All 10 unit tests + 2 integration tests pass.
- [ ] Vendored libs match source-of-truth byte-for-byte.
- [ ] `lib/await-pages.mjs` resolves on fake inbox AND on stub `list_agents`.
- [ ] `lib/cost-tracker.mjs` per-page aggregation; budget check.
- [ ] Manual E2E: 2-page `.visual-qa.json` in a live Copilot session;
      parallel `task` dispatch; report generated.
- [ ] `references/porting-notes.md` updated with live `subagentStop`
      payload, `task` concurrency cap, `read_agent` cost field findings.
- [ ] No changes to `plugins/harness-floor/skills/visual-qa/`.
- [ ] CHANGELOG entry under a `Copilot visual-qa graduation` heading.
