---
name: explore
description: Front-loaded codebase mapping. Parallel subagent fan-out (one per top-level dir), git-SHA-keyed cache at `.explore-cache/<sha>.json`, dependency graph for TS/Py/Rust/Go, and O(1) `/explore where <symbol>` + `/explore deps <file>` queries against the cache. Run `/explore` once per HEAD; subsequent queries hit the cache.
---

# /explore

Builds and caches a structural map of the current repository, then
answers `where` / `deps` queries against the cache rather than
re-grepping the filesystem on every turn.

## Usage

```
/explore                          # full scan (phases 0–4); cache-aware
/explore --force                  # invalidate this HEAD's cache and re-scan
/explore --yes                    # skip the large-repo confirmation prompt
/explore where <symbol>           # cache lookup: which files define/export <symbol>
/explore deps <file>              # cache lookup: what <file> imports + what imports it
```

## Flags

- `--force` — delete `.explore-cache/<sha>.json` for the current SHA and re-scan.
- `--yes` — skip the >25K-files interactive confirmation in Phase 0.
- `--no-deps` — skip Phase 3 (dep graph extraction).
- `--concurrency=<N>` — override `.explore.json` `concurrency` for fan-out.

## Pipeline

The skill runs 5 phases strictly in order. Each phase has its own file
under `phases/`; read it on demand.

| Phase | File | Purpose | Skippable on cache hit? |
|-------|------|---------|---|
| 0 | `phases/0-preflight.md` | git rev-parse + size check + cache lookup | No |
| 1 | `phases/1-fanout.md` | parallel dispatch — one subagent per top-level dir | Yes |
| 2 | `phases/2-aggregate.md` | merge per-dir JSON results into master map | Yes |
| 3 | `phases/3-deps.md` | regex import scan for TS/Py/Rust/Go → dep graph | Yes |
| 4 | `phases/4-render.md` | write cache + `docs/explore/<sha>-map.md` | Always |

On a cache hit in Phase 0, the orchestrator short-circuits to Phase 4
(which then becomes a no-op render — the artefact already exists — but
still prints the one-line summary).

## Rules

1. **You orchestrate; phases are the source of truth.** Read each
   phase file before running it.
2. **State lives in `.explore-state.json`** at project root. Shape:
   `{ "phases": [{phase, completedAt}], "sha": "...", "sizeCategory":
   "...", "perDir": {...}, "map": {...} }`.
3. **Parallel only in Phase 1.** Invoke `Skill` with
   `superpowers:dispatching-parallel-agents` before fan-out. One
   subagent per top-level directory; each returns the structured JSON
   summary defined in `templates/dir-summary-prompt.md.hbs`.
4. **The Phase 1 prompt is the contract.** The orchestrator builds it
   via `lib/dir-subagent-prompt.mjs#render(dir, root, options)`. The
   subagent's reply MUST conform to the JSON schema described in the
   prompt; the orchestrator validates and marks malformed replies as
   `incomplete`.
5. **Cache key = `git rev-parse HEAD`.** Detached HEAD or no commits
   → use `WIP-<timestamp>` and warn that cache will not persist across
   HEAD moves.
6. **`context-mode` for non-trivial shell.** Use
   `mcp__plugin_context-mode_context-mode__ctx_batch_execute` for git
   queries, `wc -l`, etc.

## Query commands (separate slash commands)

`/explore where <symbol>` and `/explore deps <file>` are O(1) cache
lookups against `.explore-cache/<sha>.json` via
`lib/query-engine.mjs`. They:

1. Resolve the current SHA.
2. Load the cache (`lib/cache-store.mjs#load`).
3. On cache miss: either prompt the user to run `/explore`, or
   auto-run if `.explore.json` `query.autoScan = true`.
4. Render the result via `templates/query-prompt.md.hbs`.

The `where` query has a 4-pass resolution: exports → symbols → fuzzy
(Levenshtein ≤ 2) → ripgrep fallback. The `deps` query is pure cache
lookup.

## Lib modules

- `lib/tree-walker.mjs` — top-level dir enumeration; `.gitignore` +
  `.explore-ignore` honoured; bounded-depth walker.
- `lib/dependency-extractor.mjs` — regex-based import/export scanner
  for TS, Python, Rust, Go. Document accuracy tradeoffs in
  `references/design-notes.md`.
- `lib/cache-store.mjs` — atomic `.explore-cache/<sha>.json` read/write;
  schema-version invalidation; `list()` for future GC.
- `lib/query-engine.mjs` — `where(map, symbol)` + `deps(map, file)`
  + `summarize(map)` (token-bounded structural summary).
- `lib/dir-subagent-prompt.mjs` — renders the per-dir scanning prompt
  for the Phase 1 parallel dispatch.

## Templates

- `templates/dir-summary-prompt.md.hbs` — what each fan-out subagent
  receives.
- `templates/map.md.hbs` — final human-readable map.
- `templates/query-prompt.md.hbs` — wrapper around the where/deps
  result rendering.

## On error

- Not in a git repo → Phase 0 abort with `git init` suggestion.
- Detached HEAD → use `WIP-<timestamp>` cache key, warn.
- Repo > 25K files without `--yes` → require interactive confirm.
- `.explore-cache/<sha>.json` schema-version mismatch → treat as miss.
- Subagent timeout / malformed reply → mark dir `incomplete`,
  continue. If >25% incomplete → Phase 1 abort exit 2.
- Dep extractor fails on a single file → skip that file, log to state.
- `/explore where` cache miss → prompt or auto-run per
  `.explore.json`.
- `/explore deps <file>` for file not in map → suggest `--force`
  rescan.

## When done (Phase 4)

Print:

```
Map built: <N> files, <K> lines, <D> top-level dirs, dep graph: <G> typed-lang files.
Cache: .explore-cache/<sha>.json
Map:   docs/explore/<sha>-map.md
```

Exit codes:
- `0` — clean scan; full coverage; all queries succeed.
- `1` — fatal preflight failure (no git, malformed config).
- `2` — partial completion (one or more dirs `incomplete`); map
  written with `incomplete: true` markers.

## References

- `docs/superpowers/specs/2026-05-18-harness-explore-design.md` — full
  design; this skill tracks it section-by-section.
- `references/design-notes.md` — implementation-specific decisions
  (regex-based scanner accuracy, subagent dispatch contract).
