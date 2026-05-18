# visual-qa-gemini — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `ea3155a`
(initial scaffold) and `e8d9494` (6-phase orchestrator port; subprocess
prototype `b0e5d6b`)
**Purpose:** Decompose the remaining implementation work to graduate
`visual-qa-gemini` from scaffold to a functional visual-QA pipeline on Gemini
CLI, using subprocess-based per-page dispatch.

## Why visual-qa-gemini is the heaviest visual-qa port

Same root cause as `agent-all-gemini`: Gemini has no native subagent
dispatch primitive. Per-page fan-out forks one `gemini chat` subprocess per
page, each driving its own Playwright MCP server (or sharing one — TBD per
research question 5 below).

The visual-qa specific complications on top of the agent-all-gemini
machinery:

1. **MCP session contention.** Multiple subprocesses opening separate
   Playwright MCP servers can collide on the browser instance or fork
   N browsers (memory blow-up).
2. **Screenshot disk pressure.** Each subprocess writes screenshots to
   `<slug-dir>/<page>/`. Large matrices fill disk fast; tmp GC doesn't help
   because slug-dir is preserved across runs.
3. **`--output-json` payload must carry per-page status JSON.** The same
   flag uncertainty as agent-all-gemini.

Total estimate: **1.5 weeks**.

## What the scaffold currently provides

Shipped in commits `ea3155a`, `e8d9494`, and `b0e5d6b`:

- `plugins/harness-floor-gemini/skills/visual-qa-gemini/SKILL.md` — usage,
  Gemini-specific flags, pipeline table, primitive map.
- `phases/0-preflight.md` through `phases/5-summary.md` — six phase docs.
- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed.
- `templates/mcp-snippet.json.hbs` — `~/.gemini/settings.json` Playwright
  entry.
- `templates/page-prompt.md.hbs` — per-page subagent prompt.
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt.
- `templates/report.md.hbs` — human-readable report.
- `references/porting-notes.md` — subprocess strategy + open questions.
- `bin/spawn-page-subagent.mjs` (174 LoC) — **prototype** per-page
  subprocess dispatcher. Sibling to agent-all-gemini's `spawn-wave.mjs`.
  Needs hardening + tests.
- `gemini-extension.json` — Gemini plugin manifest (visual-qa skill
  registered).

`bin/init.mjs` exists; does not yet install full visual-qa kit. Lib modules
not yet written.

## What needs to be implemented

### 1. Lib modules

- `lib/config-loader.mjs` — vendored, zero diff.
- `lib/matrix-builder.mjs` — vendored, zero diff.
- `lib/cost-estimator.mjs` — vendored, zero diff.
- `lib/diff-runs.mjs` — vendored, zero diff.
- `lib/state-atomic.mjs` — **new.** `write_file` + `run_shell_command: mv`
  (same as agent-all-gemini's).
- `lib/report-renderer.mjs` — **new.** Same as siblings'.
- `lib/ipc-tmp.mjs` — **new.** Per-page tmp dir layout for IPC. Shared
  shape with agent-all-gemini's `ipc-tmp.mjs` — consider extracting to a
  plugin-level shared lib.
- `lib/cost-tracker.mjs` — **new.** Per-page cost aggregation from
  `--output-json` payloads or transcript-length estimate.
- `lib/page-result-parser.mjs` — **new.** Reads `_result.json` written by
  each subprocess; handles SyntaxError → `{ status: "failed" }`; handles
  missing-file → `{ status: "failed", errors: ["no result"] }`.

### 2. Harden existing `bin/spawn-page-subagent.mjs`

Current: 174 LoC prototype. Add:

- `--output-json` flag fallback with stdout sentinel parsing.
- `--skill-roster` flag syntax verification (porting-notes question 2).
- Timeout-kill + SIGKILL escalation.
- Per-page tmp file isolation via `ipc-tmp.mjs`.
- Cost extraction via `cost-tracker.mjs`.
- Subprocess result parsing via `page-result-parser.mjs`.
- MCP server connection strategy (per-subprocess vs shared) — see open
  question 5.

Post-hardening: ~270 LoC.

### 3. Concurrent subprocess pool

Visual-qa matrices can have 10+ pages. Spawning 10 parallel `gemini chat`
subprocesses may exceed Gemini API rate limits and definitely exceeds
Playwright MCP single-browser capacity. Need a pool with `--max-subprocesses=N`
cap. Implement in `bin/spawn-page-subagent.mjs`:

- Queue all pages.
- Maintain N concurrent subprocesses at a time.
- As one finishes, dequeue and spawn the next.
- Default `N=4` for visual-qa (lower than agent-all's 8 because of
  Playwright memory pressure).

### 4. Tmp + slug-dir GC

- Tmp dir GC: same hook as agent-all-gemini, registered in
  `~/.gemini/settings.json` Stop hook. Shared installer.
- Slug-dir size cap: optional `--max-slug-size-mb=<N>` flag; if exceeded
  during Phase 3, abort with cleanup instructions. Default off; users opt
  in for CI runs.

### 5. `bin/init.mjs` extension

Extend existing `harness-floor-gemini/bin/init.mjs`:

- Render `.visual-qa.json`, MCP snippet (merge into `settings.json`).
- Copy libs into `<repo>/.gemini/visual-qa/lib/`.
- Render `gemini-extension.json` visual-qa skill registration (likely
  already there from scaffold).
- Optional `--with-gc-hook` flag.

### 6. Phase doc tightening

Each phase doc gains shell snippets:

- Phase 0: config-loader + `gemini --version` + MCP probe + tmp-dir
  creation.
- Phase 1: matrix-builder + cost-estimator.
- Phase 2: state-atomic init + find prior run.
- Phase 3: `node .gemini/visual-qa/bin/spawn-page-subagent.mjs
  --pages <path> --tmp ... --max-subprocesses 4`.
- Phase 4: diff-runs; write report.json via `write_file`.
- Phase 5: report-renderer → report.md; tmp GC.

## File-by-file work breakdown

### Vendored libs

- `skills/visual-qa-gemini/lib/config-loader.mjs` — ~65 LoC, zero diff.
- `skills/visual-qa-gemini/lib/matrix-builder.mjs` — ~25 LoC, zero diff.
- `skills/visual-qa-gemini/lib/cost-estimator.mjs` — ~15 LoC, zero diff.
- `skills/visual-qa-gemini/lib/diff-runs.mjs` — ~25 LoC, zero diff.

### `skills/visual-qa-gemini/lib/state-atomic.mjs` (new)

Same as agent-all-gemini's. ~40 LoC.

### `skills/visual-qa-gemini/lib/report-renderer.mjs` (new)

~40 LoC.

### `skills/visual-qa-gemini/lib/ipc-tmp.mjs` (new)

```js
export function tmpDirForPage(rootTmp, pageId)
export function tmpFileForPage(rootTmp, pageId)
export function ensureTmpDir(path)
export function gcTmp(rootTmp, olderThanMs)
```

Difference from agent-all-gemini's `ipc-tmp.mjs`: indexed by `pageId`
instead of `wave-<i>/task-<id>`. Same overall pattern. ~80 LoC.

### `skills/visual-qa-gemini/lib/cost-tracker.mjs` (new)

Same shape as agent-all-gemini's. ~90 LoC.

### `skills/visual-qa-gemini/lib/page-result-parser.mjs` (new)

```js
export function parsePageResultFile(jsonPath)
// JSON.parse with error handling; missing-file handling.
```

~50 LoC. Critical for partial-failure behaviour — same as agent-all-gemini's
`subprocess-result-parser.mjs`.

### `bin/spawn-page-subagent.mjs` (existing; hardening)

Current 174 LoC prototype. Add:
- `--output-json` fallback (~30 LoC).
- Timeout-kill (~20 LoC).
- Pool with `--max-subprocesses` cap (~30 LoC).
- Integration with ipc-tmp + cost-tracker + page-result-parser (~30 LoC).
- MCP server connection mode (per-subprocess vs shared — TBD; ~20 LoC).

Post-hardening: ~300 LoC.

### `bin/install-gc-hook.mjs` (shared with agent-all-gemini if applicable)

~80 LoC if not already shipped.

### `bin/init.mjs` extension

`installVisualQa(opts)` — render config, MCP, libs, extension entry,
optional GC hook. ~100 LoC.

### Phase doc tightening

Shell snippets in 6 phases. ~10 lines × 6 = ~60.

## Test plan

### Unit tests

1. `tests/lib/gemini-visual-qa-config-loader.test.mjs` — vendored sync.
2. `tests/lib/gemini-visual-qa-matrix-builder.test.mjs` — vendored sync.
3. `tests/lib/gemini-visual-qa-cost-estimator.test.mjs` — vendored sync.
4. `tests/lib/gemini-visual-qa-diff-runs.test.mjs` — vendored sync.
5. `tests/lib/gemini-visual-qa-state-atomic.test.mjs` — atomic round-trip.
6. `tests/lib/gemini-visual-qa-report-renderer.test.mjs` — fixture →
   golden.
7. `tests/lib/gemini-visual-qa-ipc-tmp.test.mjs` — per-page paths; GC.
8. `tests/lib/gemini-visual-qa-cost-tracker.test.mjs` — two-path; budget
   check.
9. `tests/lib/gemini-visual-qa-page-result-parser.test.mjs` — valid;
   corrupt; missing; partial-write.

### Integration tests

10. `tests/integration/gemini-spawn-page-subagent.test.mjs` — drive
    `bin/spawn-page-subagent.mjs` with a stub `gemini` binary (shell
    script). Verify:
    - parallel dispatch up to `--max-subprocesses`
    - timeout-kill
    - corrupt-output handling
    - cost extraction
    - pool dequeue behaviour (queue 10 pages, cap at 4, observe rolling).
11. `tests/integration/gemini-visual-qa-install.test.mjs` — install into
    tmpdir.
12. `tests/integration/gemini-visual-qa-gc-hook-install.test.mjs` — hook
    install + merge.

### Stress tests

13. `tests/stress/gemini-visual-qa-races.test.mjs` — 8 stub subprocesses
    each writing to its own page tmp file. 100 iters; zero collisions.
14. `tests/stress/gemini-visual-qa-mcp-contention.test.mjs` — 4 parallel
    subprocesses each opening a Playwright MCP server (or sharing); verify
    no browser-context collisions or zombie processes.

### Manual checklist

- [ ] Confirm `gemini chat --output-json` flag against live Gemini CLI.
- [ ] Confirm `--skill-roster <dir>` syntax.
- [ ] End-to-end on a 3-page `.visual-qa.json`; observe parallel subprocesses;
      verify report generated.
- [ ] Disk-pressure check: 5-page × 5-breakpoint matrix; verify slug dir
      stays within bounds; verify tmp dir cleaned in Phase 5.
- [ ] Diff vs prior run.
- [ ] MCP server connection: confirm per-subprocess browser instances
      don't fork N browsers (or if they do, document memory budget).
- [ ] Rate-limit smoke: spawn 8 parallel subprocesses against rate-limited
      account; verify graceful degradation.

## Effort estimate breakdown

Target: **1.5 weeks (~7-8 working days)**.

| Slice | Work | Hours |
|---|---|---|
| Live Gemini flag verification (shared) | 0 hr if agent-all-gemini spec ran first; else 6 | 0–6 |
| Lib vendoring (4 files) | Copy + sync tests | 2 |
| `state-atomic.mjs` | New | 3 |
| `report-renderer.mjs` | New | 3 |
| `ipc-tmp.mjs` | Per-page layout | 4 |
| `cost-tracker.mjs` | Two-path | 4 |
| `page-result-parser.mjs` | Edge cases | 4 |
| `bin/spawn-page-subagent.mjs` hardening | Pool + timeout + integration | 10 |
| `bin/install-gc-hook.mjs` | 0 if shared; else 4 | 0–4 |
| `bin/init.mjs` extension | Renderer | 4 |
| Phase doc tightening | Shell snippets × 6 | 3 |
| Unit tests (9 files) | All lib coverage | 6 |
| Integration tests (3 files) | spawn, install, hook | 5 |
| Stress tests (2 files) | Races + MCP contention | 6 |
| Manual checklist + buffer | Flag confirm + E2E + disk + MCP | 7 |
| **Total (shared spike + hook)** | | **61 hr ≈ 1.5 weeks** |
| **Total (fresh spike + hook)** | | **71 hr ≈ 1.5+ weeks** |

## Open questions

1. **`gemini chat --output-json` flag.** Same as agent-all-gemini. **Shared
   spike with agent-all-gemini.**

2. **`gemini chat --skill-roster <dir>` syntax.** Same as agent-all-gemini.

3. **Per-subprocess token cost.** Same fallback heuristic. Acceptable for
   MVP.

4. **Concurrent subprocess rate limits.** Visual-qa-specific impact:
   typical matrices have more parallelizable units than agent-all. Default
   `--max-subprocesses=4` (lower than agent-all's 8) accounts for both
   API rate limits AND Playwright memory pressure. **User-tunable via
   config.**

5. **MCP server: per-subprocess vs shared.** Critical decision. Two
   options:
   - **Per-subprocess:** each `gemini chat` subprocess starts its own
     Playwright MCP server. Pro: full isolation. Con: N browsers in
     memory; ~200 MB each; OOM risk past 4 concurrent.
   - **Shared:** one Playwright MCP server in the parent session; all
     subprocesses connect to it. Pro: single browser. Con: page context
     collisions (cookies, navigation state). Needs explicit per-page
     `browser_context` allocation.
   **Recommend: per-subprocess with `--max-subprocesses=4` default,
   stress-tested.** Reconsider if memory blows up.

6. **Tmp file races.** Per-page tmp file isolation should prevent
   collisions; stress test (13) is the proof.

7. **Disk pressure on slug-dir.** Phase 5 GC only touches tmp dir;
   slug-dir is preserved. `--max-slug-size-mb` cap exists but is opt-in.
   Should we set a sane default for CI mode? **Document; leave default
   off.**

8. **Subprocess inherits parent env.** Including any in-progress
   `gemini chat` context. Need to verify subprocesses start clean
   sessions, not picking up parent's running prompt.

9. **`Stop` hook for GC fires every Gemini exit.** Same as agent-all-gemini.
   GC handler no-ops when no per-run tmp dir exists.

10. **`bin/spawn-page-subagent.mjs` vs `bin/spawn-wave.mjs` overlap.**
    Both prototypes share patterns. Extract a shared
    `bin/lib/subprocess-runner.mjs`? **Yes, after both stabilise.**

11. **MCP entry in `~/.gemini/settings.json` vs workspace
    `.gemini/settings.json`.** User-level vs project-level. Preflight
    must check both. `bin/init.mjs` defaults to project-level for
    portability.

## Acceptance criteria

- [ ] `node plugins/harness-floor-gemini/bin/init.mjs --skill=visual-qa
      --target=<dir>` installs config, MCP, libs, gemini-extension entry.
- [ ] `node plugins/harness-floor-gemini/bin/install-gc-hook.mjs` merges
      the Stop hook; idempotent.
- [ ] `node bin/spawn-page-subagent.mjs --dry-run --pages <fixture>`
      emits per-page command lines without executing.
- [ ] Pool dispatch caps at `--max-subprocesses`; queue dequeues correctly
      (integration test 10).
- [ ] Stress tests 13 + 14 pass: 100 iters zero races; 4 concurrent MCP
      sessions stable.
- [ ] All 9 unit tests + 3 integration tests + 2 stress tests pass.
- [ ] `bin/spawn-page-subagent.mjs` handles: parallel pool, timeout-kill,
      corrupt JSON, missing tmp file, cost extraction.
- [ ] Vendored libs match source-of-truth byte-for-byte.
- [ ] Live Gemini E2E: 3-page `.visual-qa.json`; subprocesses spawned;
      report.md generated; tmp cleaned.
- [ ] `references/porting-notes.md` updated with `--output-json` /
      `--skill-roster` confirmation, MCP-mode decision, observed memory
      footprint.
- [ ] No changes to `plugins/harness-floor/skills/visual-qa/`.
- [ ] CHANGELOG entry under a `Gemini visual-qa graduation` heading.
