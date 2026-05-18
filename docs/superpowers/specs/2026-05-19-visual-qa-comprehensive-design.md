# Comprehensive visual-qa + `/agent-all --qa` end-to-end gate — design

**Date**: 2026-05-19
**Author**: brainstormed in-session with user
**Status**: approved, ready for implementation
**Korean translation**: `2026-05-19-visual-qa-comprehensive-design.ko.md` (sibling)

## Goals

1. Make `visual-qa` cover **all** components / buttons / screens / interactions on
   a project automatically — no manual declaration of selectors required.
2. Wire `visual-qa` into `/agent-all --loop` as the **final E2E verification
   gate**, so the loop only breaks when tests AND visual-qa both pass.
3. Keep cost bounded for repeated loop iterations through git-diff scoping
   and DOM-hash cache reuse.
4. Single-flag UX: `/agent-all "build X" --loop --qa` is the entire setup.

## Non-goals

- Multi-step deep flows beyond shallow (1-click) interaction depth. Users
  who want full user journeys still configure `flows` in `.visual-qa.json`
  (existing `declared` mode).
- Cross-browser matrix (chrome-only via Playwright MCP).
- Performance / lighthouse scoring (visual + functional only).
- Accessibility audits beyond what the existing LLM prompt already does.

## Architecture

### Option A (chosen): unified `visual-qa` skill with mode branch

`.visual-qa.json` grows a `mode` field:

```jsonc
{
  "mode": "comprehensive",            // or "declared" — defaults to "declared" for back-compat
  "baseUrl": "http://localhost:3000",

  // Existing "declared" mode fields still work when mode=declared.
  "breakpoints": [...],
  "pages":       [...],
  "flows":       [...],

  // New comprehensive-mode-only section.
  "comprehensive": {
    "scope":        { "include": ["/"], "exclude": [], "maxPages": 100, "depth": 3 },
    "interactions": { "click": true, "depth": 1 },
    "cache":        { "gitDiffScope": true, "domHashCache": true },
    "verdict":      { "mode": "vs-baseline", "failOn": ["critical", "major"], "firstRun": "auto-pass" }
  },

  "analysis": {...},
  "output":   {...}
}
```

**Rationale for unified over split skill**:

- One concept (`/visual-qa`) for users to discover.
- Cross-platform port cost stays 1× (4 sibling plugins instead of 8).
- `mode=declared` users see zero behavioural change.

### `/agent-all --qa` shortcut

`--qa` is a non-persistent shortcut equivalent to:

```
--break-condition='{"type":"composite","steps":[{"type":"test-auto"},{"type":"visual-qa","mode":"comprehensive"}]}'
```

Plus the side-effect: if `.visual-qa.json` doesn't exist, scaffold it
with sane defaults (`baseUrl=http://localhost:3000`, `scope.include=['/']`,
`maxPages=50`, `depth=3`) before Phase 1 runs.

**Why composite (test → visual-qa) rather than visual-qa alone**: tests
are cheap and short-circuit-failing them avoids running a hundred LLM
calls on a tree that still has unit-test failures. Visual-qa is the
last line, not the first.

## New lib modules (source-of-truth in `plugins/harness-floor/skills/visual-qa/lib/`)

| File | Inputs | Outputs | Notes |
|---|---|---|---|
| `crawler.mjs` | `{baseUrl, scope:{include,exclude,maxPages,depth}}` + browser handle | `[{path, title}]` | BFS from each `scope.include` root. Same-origin links only. Dedup by canonical path. Cap by `maxPages`. |
| `dom-walker.mjs` | `{pageUrl, scope}` + browser handle | `[{selector, kind, states[]}]` | Evaluate in-page `querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], input:not([type=hidden]), select, textarea, [data-testid], [data-qa-id]')`. Derive selector preferring `data-testid > data-qa-id > id > stable CSS path`. |
| `shallow-clicker.mjs` | `{page, clickables}` + browser handle | per-clickable post-click screenshot paths | For each: snapshot URL, click, wait for `networkidle` (timeout 3s) and animation settle, screenshot, navigate back to snapshot URL. Skip elements whose click triggers `beforeunload` confirms. |
| `dom-hash.mjs` | `{component-DOM-string}` and cache file path | hash string; `read()/write()` of cache | SHA-256 of serialised DOM subtree + relevant computed styles (`background`, `color`, `font-size`, `border`, `display`). Cache schema `{[hash]: {priorAnalysis: {...}, lastSeen: <iso>}}`. |
| `git-diff-scoper.mjs` | `{range, cwd}` | `{scope: "all"\|"some", paths: [...]}` | Framework auto-detect: Next.js `pages/`/`app/`, Vite/CRA `src/routes/`, Remix `app/routes/`. Anything outside detected route dirs but under `src/` → `scope: "all"`. Only doc/test/CI changes → `scope: "none"`. |
| `verdict.mjs` | `{thisRunAnalyses, baselineAnalyses, failOn}` | `{pass: bool, newCritical, newMajor, regressed}` | Issue key = `(page, component, category, message-hash)`. Diff sets. `pass = (newCritical.length === 0 && (failOn excludes "major" || newMajor.length === 0))`. |

Existing libs unchanged (validated, not modified): `config-loader`, `cost-estimator`, `matrix-builder` (declared mode), `report-renderer`, `state-rw`, `analysis-extractor`.

`config-loader` validation extends to:
- `mode` must be `"declared"` or `"comprehensive"` (default `"declared"`).
- When `mode === "comprehensive"`, `comprehensive.scope.include` must be non-empty array.

## Phase changes

| Phase | Today | After |
|---|---|---|
| 0 — preflight | git + Playwright MCP + health check | unchanged |
| 1 — config + matrix | load + `buildMatrix(config)` | mode branch. comprehensive → `crawler` → `dom-walker` per page → `git-diff-scoper` filter → matrix. declared → unchanged. Cost-estimate same code. |
| 2 — discover | find prior run, create slug dir | + load `dom-hashes.json` from prior run into in-memory cache. |
| 3 — capture | per-page subagent captures + analyses | comprehensive: subagent also runs `shallow-clicker` per page; for each component, check `dom-hash` against cache and reuse prior analysis when matched. |
| 4 — aggregate | diff vs prior, write `report.json`/`report.md` | + run `verdict.mjs` for comprehensive mode; write `verdict.json`. |
| 5 — summary | console summary + exit code | exit code = `verdict.pass ? 0 : 1`. First run with no baseline → write current as baseline, exit 0. |

## `/agent-all --qa` integration

Phase 0 of agent-all (CC native + 4 siblings) recognises `--qa`:

1. Build composite spec: `{type:"composite", steps:[{type:"test-auto"}, {type:"visual-qa", mode:"comprehensive"}]}`.
2. Inject as `config.loop.breakCondition` (in-memory, not persisted).
3. Skip the interactive break-condition prompt entirely.
4. If `.visual-qa.json` is missing, write the auto-scaffold template then proceed.
5. Echo `Break-condition: composite [test-auto → visual-qa comprehensive] (--qa shortcut).`

Phase 6 of agent-all already routes `visual-qa` composite steps to the visual-qa skill subagent — no change there. The visual-qa skill itself respects its `mode` config.

## Error handling

- **Crawler error** (network, timeout): record the page as `unreachable` in matrix, continue with the rest. Phase 4 surfaces unreachable pages as `major` issues.
- **DOM-walker error** (no interactive elements): not an error — page-level screenshot still captured, components array is empty.
- **Shallow-click error** (navigation away with no return path, or unhandled dialog): catch, log to capture errors, screenshot the current state, do not abort the page subagent.
- **Cache miss vs corruption**: hash mismatch is fine (re-analyse). Cache file unreadable → start fresh, do not abort.
- **Baseline missing**: first-run behaviour, exit 0, write baseline.
- **`--qa` with `.visual-qa.json` already in `declared` mode**: surface a clear warning ("you have mode=declared but used --qa; using comprehensive for this run only") and proceed with comprehensive.

## Testing strategy

| Layer | Coverage |
|---|---|
| Unit | crawler scope/depth/dedup, dom-walker selector preference order, shallow-clicker revert, dom-hash stability under whitespace + computed-style noise, git-diff-scoper framework detection, verdict diff algorithm (incl. first-run path). Each lib gets a dedicated `.test.mjs` in `tests/lib/`. ≥40 unit tests total. |
| Doc-level contract | All 5 platforms × visual-qa Phase 1/3/4 docs mention mode branch + comprehensive section. All 5 platforms × agent-all SKILL.md documents `--qa`. ≥25 contract tests. |
| Simple integration | One fixture project under `tests/fixtures/comprehensive-mode/` with two HTML pages and a stub Playwright handle. End-to-end run produces a report.json + verdict.json with the expected pass verdict. |
| Cross-platform sync | Each new lib byte-identically vendored to 4 siblings; sync test catches drift. |

Total addition target: **+150 tests**, taking suite from 1091 → ~1240 passing.

## Implementation staging

The work decomposes into six commits, each independently testable:

| Stage | Commit content | Risk |
|---|---|---|
| **2-1** | `/agent-all --qa` flag + composite shortcut + `.visual-qa.json` auto-scaffold. Tests at the agent-all layer. | Low. Tiny code change, big UX win. Ships independently. |
| **2-2** | `crawler.mjs` + `dom-walker.mjs` + Phase 1 mode branch + config-loader validation. Comprehensive mode works without caching or click flows. | Medium. Phase 1 changes — must keep declared mode working. |
| **2-3** | `shallow-clicker.mjs` + Phase 3 integration. | Medium. Subagent prompt changes. |
| **2-4** | `dom-hash.mjs` + `git-diff-scoper.mjs` + Phase 2 cache load + Phase 3 cache lookup. | Low — additive, fallback path is "no cache hit". |
| **2-5** | `verdict.mjs` + Phase 4/5 integration + exit code semantics + first-run baseline. | Medium. Changes the meaning of visual-qa exit code. |
| **2-6** | Vendor 6 new libs to 4 platform siblings. Update each platform's visual-qa-* phase docs. Cross-platform sync test. One integration test with stubbed Playwright. | Low — mechanical. |

Each stage is its own commit. Tests must pass before the next stage starts.

## Rollback story

- `mode` defaults to `declared`. Users without the new section see no change.
- `--qa` flag is purely additive. Without it, agent-all behaves exactly as today (interactive prompt or saved `breakCondition`).
- Each commit is independently revertable in reverse order without leaving the suite in a broken state.

## Open questions resolved during brainstorming

- **Discovery**: Crawl + DOM walk (chosen over Storybook / test-spec / hybrid).
- **Interaction depth**: Shallow (1-click). Deep flows stay in `declared` mode.
- **Cost**: Layered — git-diff scope + DOM-hash cache.
- **Verdict**: No new critical/major vs baseline. First run = auto-pass + write baseline.
- **Loop integration**: `--qa` flag in agent-all maps to composite preset.
- **Auto-scaffold**: write sane defaults when `.visual-qa.json` is missing.
- **Route-map fallback**: framework auto-detect + `src/` catch-all.
