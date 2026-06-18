---
name: visual-qa
description: Use when a scaffolded project needs browser screenshot capture, visual regression review, UI state coverage, or Playwright-backed visual QA evidence.
---

# /visual-qa

Drives the visual QA pipeline for the current project. Reads `.visual-qa.json`, captures the matrix via Playwright MCP, analyses each image with the configured LLM, and produces `.agent-skill/reports/visual-qa/<date-slug>/report.md` by default.

## Modes

`.visual-qa.json` declares the mode in its top-level `mode` field. Default is `declared` (back-compat).

- **`declared`** (the original): you list pages, components, selectors, and states in the config. Cost is controlled by what you put in the file.
- **`comprehensive`**: the orchestrator auto-discovers pages by crawling from `baseUrl` (BFS within `comprehensive.scope.include`, respecting `exclude` globs and depth/maxPages caps), walks each page's DOM for interactive elements (button / link / input / select / textarea / [role=*] / [data-testid] / [data-qa-id]), and optionally shallow-clicks each non-input element to capture the 1-step result state. Cost is controlled by `comprehensive.cache` — `gitDiffScope` skips pages unaffected by the iteration's git diff, and `domHashCache` reuses prior LLM verdicts for components whose DOM hasn't changed. Verdict is computed by comparing the issue set vs the baseline (prior accepted run); first run with no baseline defaults to auto-pass + write baseline. Exit code 0 on pass, 1 on fail. This mode is what `/agent-all --loop --qa` uses.

  **v0.4+ additions** (see `docs/superpowers/specs/2026-05-22-visual-qa-pairs-and-element-scope-design.md`):
  - `comprehensive.targets.{includeSelectors,excludeSelectors,actionsPerElement}` — constrain or augment auto-discovery at element granularity.
  - `comprehensive.pairs.{captureBeforeAfter,diffBaseline}` — capture paired screenshots (default both `true`).
  - `comprehensive.matching` — 3-tier element identity (`data-vqa-id` → semantic fingerprint → DOM-path hash). Surfaces `confidence` per element in the report.
  - `report.{html,mdSideBySide}` — render a self-contained `report.html` lightbox viewer alongside `report.md`'s 2-column pair tables.

## Flags

- `--resume` — skip phases already complete per `.visual-qa-state.json`.
- `--force` — wipe today's slug directory and re-run from scratch.
- `--yes` — skip the Phase 1 confirmation prompt.
- `--budget=<USD>` — abort mid-run if accumulated estimated cost exceeds this.
- `--skip-health` — skip Phase 0 baseUrl health check.
- `--slug=<custom>` — override the auto-generated date slug.

## Pipeline

The skill runs 6 phases strictly in order. Each phase has its own file under `phases/`; Read it on demand.

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + Playwright MCP + health checks |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, get user confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | page-level fan-out: capture + analyze per page |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | console summary + exit code |

## Rules

1. **You orchestrate; phases are the source of truth.** Read each phase file before running it.
2. **State lives in `.visual-qa-state.json`.** Shape: `{ "phases": [{phase, completedAt}], "slug": "...", "matrix": {...}, "estCostUSD": N, "perPageStatus": {...} }`. `--resume` resumes after `max(phases[*].phase)`.
3. **Parallel only in Phase 3.** Invoke `superpowers:dispatching-parallel-agents` before fan-out.
4. **One subagent per page; that subagent IS the analyzer.** Dispatch with the configured `analysis.model`. The page-subagent reads its own captured `.png` files via the Read tool and emits the JSON+markdown analysis itself.
5. **context-mode for any non-trivial inspection.** Use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` for shell work.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path, env)` → `{ok, config | errors}`
- `lib/matrix-builder.mjs` — `buildMatrix(config)` → flat work-list
- `lib/diff-runs.mjs` — `diffRuns(current, prior)` → `{new, resolved, unchanged}`. Also `issueKey(issue)`.
- `lib/cost-estimator.mjs` — `estimateCost(matrix, model)` → USD. Also `MODEL_PRICES`.

## On error

- `.visual-qa.json` missing → abort + suggest `/agent-init --visual-qa`.
- Playwright MCP not available → abort + suggest plugin install.
- baseUrl down → ask user to continue (or abort in non-interactive).
- Matrix > 5000 captures + no `--yes` → require explicit confirm.
- `--budget` exceeded → abort gracefully, save partial report.
- 3+ analysis errors in one page → that page marked incomplete, others continue, exit code 2.
- Auth flow fails → page-subagent BLOCKED.

## When done

Print summary, set exit code: 0 = clean, 1 = critical issues, 2 = partial completion.
