# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo:
   ```
   git rev-parse --git-dir
   ```
   On non-zero exit: abort with `not a git repo; harness-explore
   requires git for SHA-keyed caching. Run \`git init\` first or change
   to a git-tracked directory.` Exit 1.

2. Capture HEAD SHA:
   ```
   git rev-parse HEAD
   ```
   - On success: `sha = <output>`.
   - On detached HEAD or no commits (`fatal: ambiguous argument 'HEAD'`):
     `sha = "WIP-<unix-timestamp>"` and warn `cache will not persist
     across HEAD moves`.

3. Size check via `git ls-files | wc -l`:
   - `<5000` → `sizeCategory = "small"`, proceed.
   - `5000 ≤ N < 25000` → `sizeCategory = "medium"`, proceed with warn
     `projected scan time ~30–90s`.
   - `≥ 25000` → `sizeCategory = "large"`:
     - If `--yes` passed: proceed with warn `projected scan time
       >90s; consider .explore-ignore`.
     - Else: ask the user `Repo has <N> tracked files (>25K). Continue?
       [y/N] (suggest adding .explore-ignore patterns first)` and wait
       for response. On `n`: abort exit 0.

4. Cache lookup via `lib/cache-store.mjs#load(sha, ".explore-cache")`:
   - If `{ok: true, map}`: set `cacheHit = true`. Short-circuit
     directly to Phase 4 — pass the loaded `map` through state.
   - If `{ok: false, reason: "not-found" | "schema-mismatch" |
     "malformed"}`: set `cacheHit = false`, proceed.

5. If `--force` is set: call `lib/cache-store.mjs#invalidate(sha,
   ".explore-cache")` to delete the SHA's cache file. Continue scan
   regardless of prior cache hit.

6. Load `.explore.json` if present (use built-in defaults if missing
   or malformed; warn on malformed). Built-in defaults:
   ```json
   {
     "concurrency": 8,
     "subagentOutputTokenBudget": 4000,
     "ignorePatterns": [".git", "node_modules", "dist", "build",
       ".next", ".turbo", "target", "__pycache__", ".venv", "venv",
       ".tox", "vendor", ".explore-cache"],
     "languages": ["ts", "tsx", "js", "jsx", "mjs", "cjs", "py",
       "rs", "go"],
     "query": { "autoScan": false }
   }
   ```
   Merge user config shallowly over defaults.

7. Push state via atomic temp-file + rename to `.explore-state.json`:
   ```json
   {
     "phases": [{"phase": 0, "completedAt": "<iso>"}],
     "sha": "<sha>",
     "sizeCategory": "<small|medium|large>",
     "cacheHit": <bool>,
     "config": { ... merged ... }
   }
   ```

## Output to user

Print exactly one of:

- Cache hit:
  ```
  Preflight: cached map found for HEAD <sha-short>. Skipping scan; re-rendering summary.
  ```

- Cache miss:
  ```
  Preflight OK. HEAD <sha-short>, <N> tracked files (<size-category>). Starting scan.
  ```

## Branching

- `cacheHit && !force` → jump to Phase 4 (render is a no-op but still
  emits the summary line; map artefact already exists on disk).
- Otherwise → proceed to Phase 1.
