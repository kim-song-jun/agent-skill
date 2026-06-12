# Theme D — `harness-explore` design

**Date:** 2026-05-18
**Status:** Design only — no implementation in this iteration
**Author:** kimsongjun
**Purpose:** Define the fourth pillar plugin in the harness family —
exploration-focused. Where `harness-builder` installs scaffolding,
`harness-floor` runs cost-unrestricted multi-agent pipelines, and
`harness-thrift` optimises long sessions for cost, `harness-explore`
maps the codebase up front, caches the map for the rest of the
session, and answers structural "where is X" / "what depends on X"
queries against the cache rather than re-grepping.

## 1. Background

The harness family currently sits at three themes:

| Theme | Plugin | Posture |
|---|---|---|
| A | `harness-builder` (+ 4 platform siblings) | Bootstrap scaffolding (one-shot, low cost) |
| B | `harness-thrift` | Cost-conscious long-session optimisation (low cost, sustainable runtime) |
| C | `harness-floor` (+ 4 platform siblings) | Cost-unrestricted multi-agent pipelines (high cost, high quality) |
| **D** | **`harness-explore`** (new) | **Exploration-focused — codebase mapping, dependency graph, "where is X" queries, parallel-dispatch reader pattern** |

Theme A is install-time work. Theme B optimises sustained sessions for
cost. Theme C burns budget for quality. Theme D is **front-loaded
discovery work**: before a session can be cost-managed (B) or
quality-managed (C), the model has to know the codebase. Theme D builds
and caches that knowledge.

References:
- `docs/superpowers/specs/2026-05-18-harness-thrift-design.md` — same
  family aesthetic; mirror its phase + lib layout.
- `docs/superpowers/specs/2026-05-17-agent-all-design.md` — phase
  pipeline pattern; loop-evaluator-style structure.
- `plugins/harness-floor/skills/visual-qa/SKILL.md` — pipeline-style
  skill with explicit `phases/` directory.
- `plugins/harness-floor/skills/agent-all/SKILL.md` — orchestrator-style
  skill that delegates to `superpowers:*` primitives.

## 2. Problem

When starting work on an unfamiliar repo (or returning to a familiar
but large one), the model spends 10–30 turns finding the right file:

1. **Tactical search dominates.** `grep`, `find`, the `Explore`
   subagent — all answer "where is the string `X`?" or "what's in this
   directory?" They don't answer "what is this codebase shaped like?"
2. **Per-turn re-discovery.** A 4-hour session may invoke `ls` and
   `grep` against the same directory dozens of times. Each invocation
   re-fetches the same structural facts and dumps them back into
   context.
3. **No cache survives turns.** Even within a session, what the model
   learns in turn 5 about the directory layout has to be re-derived in
   turn 25 because the context summariser has compacted it away.
4. **Dependency graph is invisible.** "What imports `auth/session.ts`?"
   requires a full-tree grep every time. There's no skill that builds
   and caches the import graph once.
5. **Subagent dispatch under-used for reads.** `superpowers:dispatching-parallel-agents`
   exists, but no skill uses it for the bulk-read pattern (one subagent
   per top-level directory, each returning a structured summary). The
   pattern is left to ad-hoc orchestration per session.

Net effect: a 2-hour exploration phase to "get the lay of the land"
that should take ~10 minutes (one parallel scan + one cached map),
costing 3–5x the tokens it needs to.

`harness-explore` addresses this by building a structured map up
front, caching it for the rest of the session, and exposing query
slash commands that hit the cache rather than the filesystem.

## 3. Goals

1. **Build a structured codebase map in <2 min** for repos up to
   ~100K lines, via parallel subagent fan-out (one subagent per
   top-level directory).
2. **Cache the map keyed by git HEAD SHA.** Reuse across turns within
   a session, and across sessions if HEAD hasn't moved. Invalidate
   automatically when HEAD changes.
3. **Answer "where is X" queries against the cache** without
   re-grepping the filesystem. Composes against the cached map +
   dependency graph; fallback to grep only if cache miss.
4. **Build a dependency graph** (imports / exports) for typed
   languages (TypeScript, Python, Rust, Go for v1).
5. **Output two artefacts per scan:**
   - `docs/explore/<sha>-map.md` — human-readable map (committable).
   - `.explore-cache/<sha>.json` — machine-readable cache
     (.gitignored).
6. **Reuse `superpowers:dispatching-parallel-agents`** for the Phase 1
   fan-out, mirroring how `agent-all` reuses
   `superpowers:subagent-driven-development`.

## 4. Non-goals

- **Not an LSP / IDE replacement.** No "go to definition", no rename
  refactoring. Read-only structural map.
- **Not a code search index.** For substring search, use ripgrep. For
  symbol search, use ctags. `harness-explore` builds a map *over* those
  tools, not a replacement for them.
- **Not a refactoring tool.** Read-only. The cache is consumed by
  other skills (or the user) but `harness-explore` never writes code.
- **Not a documentation generator.** The map.md is a map (directory
  topology, dep graph summary, key symbols), not API docs. Use a docs
  generator for the latter.
- **Not a vector DB / RAG layer.** Heuristic + AST-based; no
  embeddings in v1.
- **Not Claude-Code-specific in design.** Per-platform ports are
  expected to follow the same decomposition as `agent-all` and
  `visual-qa` (see §11).

## 5. Architecture

### 5.1 Package layout

```
plugins/harness-explore/
├── plugin.json
├── README.md
├── skills/
│   └── explore/                              # User-facing: /explore
│       ├── SKILL.md
│       ├── phases/
│       │   ├── 0-preflight.md                # git + size check + cache lookup
│       │   ├── 1-fanout.md                   # parallel dispatch per top-level dir
│       │   ├── 2-aggregate.md                # merge per-dir results into master map
│       │   ├── 3-deps.md                     # dep graph extraction (typed langs)
│       │   └── 4-render.md                   # map.md + cache.json
│       ├── lib/
│       │   ├── tree-walker.mjs               # directory + file enumeration
│       │   ├── dependency-extractor.mjs      # AST-based import/export per language
│       │   ├── cache-store.mjs               # load/save .explore-cache/<sha>.json
│       │   ├── query-engine.mjs              # /explore where|deps query resolver
│       │   └── dir-subagent-prompt.mjs       # builds per-dir prompt for fan-out
│       ├── templates/
│       │   ├── dir-summary-prompt.md.hbs     # what each subagent is asked
│       │   ├── map.md.hbs                    # final human-readable map
│       │   └── query-prompt.md.hbs           # query slash-command wrapper
│       └── references/
│           ├── language-support.md           # which langs supported, where
│           └── cache-schema.md
└── commands/
    ├── explore.md                            # /explore (full scan)
    ├── explore-where.md                      # /explore where <symbol>
    └── explore-deps.md                       # /explore deps <file>
```

The skill is **pipeline-style** (mirrors `visual-qa`) for the scan,
and **orchestrator-style** (mirrors `agent-all`) for the query
commands.

### 5.2 `plugin.json`

```json
{
  "name": "harness-explore",
  "version": "0.1.0",
  "description": "Theme D — exploration-focused codebase mapping. Parallel subagent scan, git-SHA-keyed cache, structural query slash commands.",
  "skills": ["skills/explore"],
  "commands": ["commands/explore.md", "commands/explore-where.md", "commands/explore-deps.md"]
}
```

### 5.3 Pipeline overview

| Phase | Name | Skippable? | Delegates to |
|-------|------|------------|--------------|
| 0 | Preflight | No | git + cache lookup |
| 1 | Fan-out | Skip if cache hit | `superpowers:dispatching-parallel-agents` |
| 2 | Aggregate | Skip if cache hit | local |
| 3 | Dep graph | Skip if no typed langs OR cache hit | `lib/dependency-extractor.mjs` |
| 4 | Render | Always (writes cache + map) | local |

### 5.4 Slash commands

| Command | Purpose |
|---------|---------|
| `/explore` | Run full scan (phases 0–4). Cache-aware. |
| `/explore where <symbol>` | Query: which files define/export `<symbol>`. Hits cache. |
| `/explore deps <file>` | Query: what does `<file>` import, what imports it. Hits cache. |

Query commands assume `/explore` has run; if no cache exists for the
current SHA they prompt the user (or run `/explore` automatically when
`--auto-scan` flag is set in `.explore.json`).

## 6. Component detail

### 6.1 Phase 0 — Preflight

1. Confirm `pwd` is a git repo. Abort: `not a git repo; harness-explore
   requires git for SHA-keyed caching`.
2. Capture HEAD SHA via `git rev-parse HEAD`. If detached HEAD or no
   commits: use `WIP-<timestamp>` as the cache key, warn.
3. Size check: count files via `git ls-files | wc -l`. Categorise:
   - `<5K files` → "small", proceed.
   - `5K–25K files` → "medium", proceed but warn projected time
     (~30–90 s).
   - `>25K files` → "large", require `--yes` or interactive confirm;
     suggest `.explore-ignore` patterns.
4. Cache lookup: read `.explore-cache/<sha>.json`. If present and
   schema-valid: **short-circuit to Phase 4** with `cacheHit: true`.
5. If `--force` flag set: delete cache for this SHA and continue.
6. Load `.explore.json` if present; merge with built-in defaults.
7. Push `{phase: 0, completedAt, sha, sizeCategory}` to
   `.explore-state.json`.

### 6.2 Phase 1 — Fan-out

1. Enumerate top-level directories via `lib/tree-walker.mjs#topLevelDirs(root, ignore)`.
   Filter against `.explore-ignore` + built-in defaults
   (`node_modules`, `.git`, `target`, `dist`, `build`, `.next`,
   `__pycache__`, etc.).
2. Invoke `Skill` with `superpowers:dispatching-parallel-agents` to
   prime the parallel-dispatch pattern.
3. For each top-level dir: dispatch a subagent with the prompt
   rendered from `templates/dir-summary-prompt.md.hbs`. The subagent
   reads its assigned subtree (using its own Read + Glob tools) and
   returns a structured JSON summary:

```json
{
  "dir": "src/auth",
  "fileCount": 47,
  "languages": {"ts": 41, "json": 3, "md": 3},
  "entries": [
    {"path": "src/auth/session.ts", "kind": "module", "exports": ["createSession", "destroySession"], "lines": 142},
    {"path": "src/auth/oauth/", "kind": "subdir", "fileCount": 12, "summary": "OAuth flows for Google + GitHub"}
  ],
  "purpose": "Authentication primitives — sessions, OAuth, JWT.",
  "publicEntryPoints": ["src/auth/index.ts"],
  "notableConventions": ["uses async/await throughout", "no callback-style"]
}
```

4. Subagents run in parallel up to `concurrency` (default `min(8, topLevelDirCount)`).
5. Collect all per-dir results into `.explore-state.json`.
6. On any subagent failure (timeout, dir unreadable): mark dir
   `incomplete`, continue. If >25% incomplete: abort Phase 1 with
   exit code 2.

**Subagent prompt budget:** each subagent is asked to spend ≤ ~4K
output tokens. The dir-summary prompt explicitly constrains depth
(e.g., "summarize subdirectories deeper than 3 levels rather than
enumerating").

### 6.3 Phase 2 — Aggregate

1. Merge per-dir results into a single map object:

```json
{
  "sha": "abc123...",
  "generatedAt": "2026-05-18T12:34:56Z",
  "root": "/Users/.../repo",
  "totalFiles": 1247,
  "totalLines": 84321,
  "languages": {"ts": 612, "py": 142, "md": 89, ...},
  "dirs": [/* per-dir summaries */],
  "publicEntryPoints": [/* aggregated */],
  "topLevelLanguageBreakdown": {...}
}
```

2. Compute roll-ups: total line count, per-language breakdown, list
   of all `publicEntryPoints` across the tree.
3. Validate that every top-level dir has either a summary or an
   `incomplete` marker.
4. Stash aggregated map in `.explore-state.json` as `map` field
   (not yet written to disk — Phase 4 does that).

### 6.4 Phase 3 — Dep graph extraction

Runs only for files in supported typed languages. **v1 supports:**
TypeScript / TSX, Python, Rust, Go.

1. For each supported file under the map's `dirs`, invoke
   `lib/dependency-extractor.mjs#extract(path, language)`. Per
   language:
   - **TypeScript:** parse `import` / `export` statements via a tiny
     regex-based scanner (good enough for v1; AST upgrade is a v2
     followup).
   - **Python:** scan top-level `import X` / `from X import Y`.
   - **Rust:** scan `use` declarations at module roots.
   - **Go:** scan `import (...)` blocks.
2. Resolve relative imports to absolute file paths (using
   `tsconfig.json` paths if present for TS).
3. Build two indexes:
   - `imports[file]` = list of files this file imports.
   - `importedBy[file]` = inverse — files that import this file.
4. Attach both indexes to the map under `depGraph`.
5. If no supported files found: skip Phase 3, mark
   `depGraph: { skipped: "no-typed-languages" }`.

**Performance budget:** dep graph extraction must complete in ≤ 30 s
for repos up to 50K supported files. Use streaming reads + bounded
worker pool (e.g., `os.cpus().length`).

### 6.5 Phase 4 — Render

1. Write machine-readable cache: `.explore-cache/<sha>.json`. Schema
   per §7.
2. Render `templates/map.md.hbs` with the aggregated map. Write to
   `docs/explore/<sha>-map.md`. Map sections:
   - Overview (totals, language breakdown)
   - Top-level directories (one section each — purpose, file count,
     notable entries)
   - Public entry points (consolidated list)
   - Dependency graph summary (most-imported files, orphan files)
   - Generated-at + how to refresh
3. Print one-line summary to console:
   `Map built: 1247 files, 84K lines, 8 top-level dirs, dep graph: 612 TS files. docs/explore/abc123-map.md`
4. Push `{phase: 4, completedAt}` to state.
5. Add `.explore-cache/` and `.explore-state.json` to `.gitignore` if
   missing (idempotent).

### 6.6 Lib detail

#### `lib/tree-walker.mjs`
- `topLevelDirs(root, ignorePatterns)` → `string[]`
- `walk(dir, ignorePatterns, maxDepth)` → file iterator (lazy).
- `applyIgnore(paths, patterns)` → filtered list. Honours
  `.gitignore` + `.explore-ignore`.

#### `lib/dependency-extractor.mjs`
- `extract(filePath, language)` → `{imports: string[], exports: string[]}`
- `resolveRelative(importPath, fromFile, tsconfigPaths?)` → absolute path
- Per-language scanners: `scanTypeScript`, `scanPython`, `scanRust`, `scanGo`.

#### `lib/cache-store.mjs`
- `load(sha, cacheDir)` → `{ok, map | reason}`. Validates schema
  version; treats version mismatch as cache miss.
- `save(sha, map, cacheDir)` → writes atomically (`<sha>.json.tmp` →
  rename).
- `invalidate(sha, cacheDir)` → deletes file. Used by `--force`.
- `list(cacheDir)` → `string[]` of cached SHAs. Used by an optional
  `/explore gc` to drop entries older than N days or for SHAs no
  longer reachable from `git log`.

#### `lib/query-engine.mjs`
- `where(map, symbol)` → `[{file, kind, line?, context}]`. Scans
  `entries[*].exports` for exact match, then `entries[*].symbols`
  (if present), then falls back to ripgrep.
- `deps(map, file)` → `{imports: [...], importedBy: [...]}`. Pure
  cache lookup. If file not in map: error
  `not in cached map; run /explore --force?`.
- `summarize(map)` → short-form structural summary suitable for
  injecting into a system prompt (token-bounded).

#### `lib/dir-subagent-prompt.mjs`
- `render(dir, root, options)` → string. Renders the
  `dir-summary-prompt.md.hbs` template with per-dir context (path,
  glob hints, output token budget, ignore patterns).

## 7. `.explore-cache/<sha>.json` schema

```json
{
  "schemaVersion": "1.0.0",
  "sha": "abc123def456...",
  "generatedAt": "2026-05-18T12:34:56Z",
  "root": "/abs/path/to/repo",
  "totalFiles": 1247,
  "totalLines": 84321,
  "sizeCategory": "small" | "medium" | "large",
  "languages": {
    "ts": 612,
    "py": 142,
    "md": 89,
    "json": 47,
    "other": 357
  },
  "ignorePatterns": [".git", "node_modules", ".explore-ignore-loaded:true"],
  "dirs": [
    {
      "dir": "src/auth",
      "fileCount": 47,
      "totalLines": 3412,
      "languages": {"ts": 41, "json": 3, "md": 3},
      "purpose": "Authentication primitives — sessions, OAuth, JWT.",
      "publicEntryPoints": ["src/auth/index.ts"],
      "notableConventions": ["async/await throughout"],
      "entries": [
        {
          "path": "src/auth/session.ts",
          "kind": "module",
          "lines": 142,
          "exports": ["createSession", "destroySession", "Session"],
          "symbols": [
            {"name": "createSession", "kind": "function", "line": 12},
            {"name": "Session", "kind": "interface", "line": 4}
          ]
        }
      ],
      "incomplete": false
    }
  ],
  "depGraph": {
    "schemaVersion": "1.0.0",
    "supportedLanguages": ["ts", "py", "rs", "go"],
    "imports": {
      "src/auth/session.ts": ["src/db/index.ts", "src/util/time.ts"]
    },
    "importedBy": {
      "src/auth/session.ts": ["src/api/login.ts", "src/middleware/auth.ts"]
    },
    "orphans": ["src/legacy/old-helper.ts"],
    "skipped": false
  },
  "stateAtGeneration": {
    "branch": "main",
    "uncommittedChanges": false
  }
}
```

Notes:
- `schemaVersion` is consulted by `cache-store.load`; a mismatch is
  treated as cache miss (forces re-scan).
- `entries[*].symbols` is best-effort; not all languages produce it
  in v1 (only TS + Py have symbol extraction; Rust/Go are
  imports-only in v1).
- `depGraph.orphans` = files that no other file imports and that are
  not entry points. Useful for dead-code investigation.

## 8. Query API

### 8.1 `/explore where <symbol>`

Pipeline:

1. Load cache for current SHA via `cache-store.load`.
2. If cache miss: prompt user → "no cache for SHA `abc123`; run
   `/explore` first? [Y/n]" (or auto-run if `.explore.json`
   `query.autoScan = true`).
3. Call `query-engine.where(map, symbol)`:
   - Pass 1: exact match in any `entries[*].exports`.
   - Pass 2: exact match in any `entries[*].symbols[*].name`.
   - Pass 3: fuzzy match (Levenshtein ≤ 2) in same fields.
   - Pass 4: ripgrep fallback for the symbol literal (bounded; show
     up to 20 hits).
4. Render result via `templates/query-prompt.md.hbs`:

```
Symbol `createSession` — 1 definition, 4 references.

Definition:
  src/auth/session.ts:12  function createSession(userId: string): Session

Imported by (4):
  src/api/login.ts
  src/middleware/auth.ts
  src/test/auth/session.test.ts
  src/cli/seed-user.ts
```

### 8.2 `/explore deps <file>`

Pipeline:

1. Load cache. (Same miss-handling as §8.1.)
2. Normalise `<file>` to absolute repo-relative path.
3. Call `query-engine.deps(map, file)`:
   - `imports[file]` → "what this file depends on"
   - `importedBy[file]` → "what depends on this file"
4. Render via `templates/query-prompt.md.hbs`:

```
File `src/auth/session.ts` — depends on 2, used by 4.

Imports:
  src/db/index.ts
  src/util/time.ts

Imported by:
  src/api/login.ts
  src/middleware/auth.ts
  ...
```

Both commands are O(1) cache lookups after the initial scan.

## 9. Error handling

| Scenario | Behaviour |
|----------|-----------|
| Not in a git repo | Phase 0 abort + `git init` suggestion |
| Detached HEAD | Use `WIP-<timestamp>` cache key; warn cache won't persist across HEAD moves |
| Repo > 25K files, no `--yes` | Phase 0 require interactive confirm + suggest `.explore-ignore` |
| `.explore-cache/<sha>.json` schema version mismatch | Treat as miss; re-scan |
| Subagent timeout in Phase 1 | Mark dir `incomplete: true`, continue. If > 25% incomplete: Phase 1 abort exit 2 |
| Dep extractor fails on a single file | Skip that file, continue; log to state |
| `/explore where` with no cache | Prompt to run `/explore`; or auto-run if config opts in |
| `/explore deps <file>` for file not in map | Suggest `--force` rescan (file may be new since last scan) |
| `.explore.json` malformed | Use built-in defaults, warn |
| User runs `/explore` mid-scan in same session | Detect via state file lock; ask to wait or `--force` |
| `git ls-files` empty | Treat as empty repo; write empty map; warn |

## 10. Testing strategy

### 10.1 Lib unit tests (`tests/explore/lib/`)

| Module | Tests |
|--------|-------|
| `tree-walker.mjs` | 6 tests: top-level dir enumeration; ignore patterns; max-depth respect; symlink handling; empty dir; gitignore loading |
| `dependency-extractor.mjs` | 12 tests: 3 per language × 4 languages — basic import, relative-path resolution, malformed-source graceful fail |
| `cache-store.mjs` | 7 tests: round-trip save/load; schema-version mismatch; atomic write (interrupted); list; invalidate; missing dir auto-create; concurrent write |
| `query-engine.mjs` | 8 tests: exact where; symbol-only where; fuzzy where; rg-fallback where; deps imports; deps importedBy; deps unknown file; summarize token bound |
| `dir-subagent-prompt.mjs` | 3 tests: template render; ignore-pattern injection; token-budget placeholder |

### 10.2 Template snapshot tests

`map.md.hbs` + `dir-summary-prompt.md.hbs` + `query-prompt.md.hbs` ×
3 fixtures each (small mock repo, medium mock repo, dep-graph-rich
mock repo) = 9 snapshots.

### 10.3 Scenario integration (`tests/explore/scenarios/`)

Mock filesystems via temp dirs. 6 scenarios:
1. Small TS-only repo (5 dirs, 30 files) → full scan + dep graph
   completes <5 s; cache hit on second run instant.
2. Mixed-language repo (TS + Py + Rust) → all 3 dep extractors fire;
   inter-language imports correctly skipped.
3. Repo with `.explore-ignore` → ignored dirs excluded from scan,
   verified in cache.
4. `git checkout` to different SHA → cache miss; fresh scan written
   under new SHA key; old cache preserved.
5. Subagent failure simulation (one dir's mock subagent throws) →
   that dir marked incomplete, others complete, exit code 2.
6. `/explore where <symbol>` and `/explore deps <file>` against a
   pre-built cache fixture → correct results in <100 ms.

### 10.4 Manual E2E checklist (`tests/explore/manual-checklist.md`)

10 items: real-repo scan timing; `--force` flow; detached HEAD
warning; large repo size confirmation; cache survives terminal
restart; query commands work without re-scan; `.gitignore` patch
correctness; dep graph round-trip on a recent commit; subagent
parallelism observed; map.md readability.

### 10.5 Out of scope

- Real LLM subagent dispatch (scenario tests use stubs).
- Cross-platform path semantics beyond Unix (Windows = follow-up).
- AST-based extraction (regex-based for v1).

## 11. Decomposition into sub-projects

| Sub-project | Scope | Estimate |
|---|---|---|
| `explore-core` | plugin shell, `tree-walker`, `cache-store`, Phase 0 preflight, `.gitignore` patching, `.explore.json` loader | 3 days |
| `explore-fanout` | Phase 1 parallel dispatch, `dir-subagent-prompt`, `dir-summary-prompt.md.hbs`, Phase 2 aggregate | 4 days |
| `explore-deps` | `dependency-extractor` for 4 languages, Phase 3 graph build, `depGraph` schema integration | 5 days |
| `explore-query` | `query-engine` (where + deps + summarize), `/explore where`, `/explore deps` slash commands, `query-prompt.md.hbs` | 3 days |
| `explore-render` | `map.md.hbs` template, Phase 4 render + write, console summary, cache write atomicity | 2 days |
| Tests + manual checklist | Lib unit suite, scenario fixtures, manual E2E doc | 3 days |

**Total: ~3 weeks.**

Recommended order:
1. `explore-core` (everything depends on cache + tree-walker).
2. `explore-render` (gives a useful artefact even with stubbed
   Phase 1).
3. `explore-fanout` (the heart of the speed claim).
4. `explore-deps` (largest single sub-project; isolate to its own
   week).
5. `explore-query` (final UX layer once cache is reliable).
6. Tests + checklist (continuous; finalise at end).

## 12. Per-platform port considerations

The same per-platform decomposition that applies to `agent-all`
(`docs/superpowers/specs/2026-05-18-agent-all-porting-decomposition.md`)
and `visual-qa`
(`docs/superpowers/specs/2026-05-18-visual-qa-porting-design.md`) will
apply to `harness-explore`. Brief notes:

- **`harness-explore-codex`** — Codex has its own subagent model;
  Phase 1 fan-out needs platform-equivalent of
  `superpowers:dispatching-parallel-agents`.
- **`harness-explore-copilot`** — Copilot's `store_memory` could
  serve as an alternative cache layer; cache-store would have a
  pluggable backend.
- **`harness-explore-gemini`** — Gemini's long context window may
  make the in-conversation map summary feasible without a separate
  cache file; consider a `cacheBackend: "inline"` mode.
- **`harness-explore-cursor`** — Cursor's built-in indexing overlaps
  some of this; explore could become "augmentation over Cursor's
  index" rather than a from-scratch scan.

**Recommendation:** ship Claude-Code-only Theme D first (validate the
parallel-dispatch reader pattern actually delivers the 2-min target),
THEN decompose ports. Defer the per-platform spec to a follow-up
once Theme D core has been measured in real use.

## 13. Open questions

1. **Subagent token budget vs map fidelity.** Asking each per-dir
   subagent for ≤4K output tokens may be too tight for very large
   dirs (e.g., a `src/components/` with 200+ files). Should we
   auto-split such dirs into multiple subagents (one per immediate
   subdirectory)? Or compress per-file detail more aggressively?

2. **Cache invalidation on partial git ops.** If the user runs
   `/explore` then makes uncommitted edits (no SHA change), the
   cache stays valid by key but stale by content. Options: (a) include
   `git status --porcelain` hash in the cache key, (b) add a
   `--allow-stale` flag with a banner, (c) auto-rescan touched dirs
   only. Recommendation TBD.

3. **Dep graph for dynamic imports / barrel re-exports.** TypeScript
   `export * from "./foo"` and dynamic `import()` calls won't be
   captured by a regex scanner. Acceptable for v1, or block on AST
   upgrade?

4. **Cross-package boundaries in monorepos.** Should the map treat
   each workspace package as its own scan unit and stitch results,
   or treat the monorepo as one tree with package-level grouping?
   Affects Phase 1 fan-out granularity.

5. **Map.md churn in source control.** Committing `docs/explore/<sha>-map.md`
   per SHA could explode the repo history. Alternatives: keep only
   the latest under `docs/explore/CURRENT-map.md` + symlink to SHA
   in cache; or `.gitignore` the map directory entirely and let the
   user opt into committing.

6. **Interaction with `harness-thrift`.** The Phase 1 fan-out is
   token-heavy (one subagent per top-level dir, each consuming up to
   ~4K out). For a "thrifty" session, is the fan-out's cost justified
   by the downstream savings? Need a measured comparison.

7. **`Glob` tool overlap with `tree-walker`.** Claude Code's built-in
   `Glob` could replace `tree-walker.mjs` for the enumeration step.
   Trade-off: in-process speed (own walker) vs zero-dependency surface
   (Glob tool). v1 leans toward own walker; revisit after first
   benchmark.

## 14. Recommended next sessions

1. **Spike: measure parallel-dispatch reader pattern.** ~1 day. Run a
   hand-rolled fan-out on a 50K-line repo with 8 parallel subagents.
   Measure wallclock + output token total. Outcome: confirm the
   "<2 min for 100K LOC" goal is achievable, or revise.

2. **Spike: dep-graph extractor accuracy.** ~2 days. Build a
   throwaway TS extractor; run against 3 real OSS TS repos; compare
   to `tsc --listFiles` ground truth. Decide regex vs AST for v1.

3. **Implement `explore-core` + `explore-render`.** ~5 days combined.
   Deliver a working scan that uses a stub fan-out (sequential reads
   for now) so the cache + map artefacts are real and reviewable.

4. **Implement `explore-fanout`.** ~4 days. Wire to
   `superpowers:dispatching-parallel-agents`; validate against the
   spike's wallclock target.

5. **Implement `explore-deps`.** ~5 days. Start with TS only; add
   Python, Rust, Go in sequence.

6. **Implement `explore-query`.** ~3 days. Both slash commands +
   query-engine.

7. **Per-platform porting spec.** Deferred until Theme D claude-code
   ship + ≥2 weeks of real-use feedback.

## 15. Out of scope (this design iteration)

- Implementation of any sub-project.
- Per-platform Theme D ports.
- AST-based extraction (regex scanners for v1).
- Embeddings / vector index.
- Symbol extraction for Rust + Go (imports-only in v1).
- Cross-package monorepo stitching beyond simple per-package scans.
- `/explore gc` cache-eviction command (follow-up; cache disk
  footprint should be small enough to ignore for v1).
- IDE-side visualisation of the dep graph (the JSON cache is
  consumable; tooling lives outside the plugin).
- Real-time map updates on file save (snapshot model only for v1).

## 16. Marketplace entry (when implemented)

```json
{
  "name": "harness-explore",
  "source": "./plugins/harness-explore",
  "description": "Theme D — exploration-focused codebase mapping: parallel-dispatch reader, SHA-keyed cache, structural where/deps queries, dependency graph for typed languages"
}
```
