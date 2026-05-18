# Phase 4 — Render (cache + map)

Always runs (even on cache hit; on cache hit it's a no-op write +
prints the summary so the user sees the artefact paths).

## Inputs

- `state.map` from Phase 2 (+ `depGraph` from Phase 3 if it ran).
- `state.sha` from Phase 0.

## Steps

1. Write machine-readable cache:
   - Path: `.explore-cache/<sha>.json`.
   - Call `lib/cache-store.mjs#save(sha, state.map, ".explore-cache")`.
   - `save` writes atomically: `<sha>.json.tmp` → rename.
   - On cache hit short-circuit: skip if the file already exists
     AND `state.cacheHit === true`.

2. Render human-readable map:
   - Read `templates/map.md.hbs`.
   - Call `render(template, state.map)` from the vendored
     `bin/lib/render.mjs` (or the in-skill shim — see lib).
   - Write to `docs/explore/<sha>-map.md`. Create the directory if
     missing.
   - On cache hit: only re-write if the file is missing on disk
     (resilient to user deletion).

3. Patch `.gitignore` (idempotent):
   - If `.gitignore` doesn't exist: create it.
   - Ensure these lines are present (append if missing):
     ```
     .explore-cache/
     .explore-state.json
     ```
   - Do NOT add `docs/explore/` — that directory is intentionally
     committable.

4. Push `{phase: 4, completedAt: "<iso>", cacheBytes: <size>,
   mapBytes: <size>}` to state.

5. Print one-line summary to console:
   ```
   Map built: <totalFiles> files, <totalLines> lines, <topLevelDirs>
   top-level dirs, dep graph: <depFileCount> typed-lang files.
   Cache: .explore-cache/<sha>.json
   Map:   docs/explore/<sha>-map.md
   ```

6. Exit code:
   - `0` if all phases completed without `incomplete` markers.
   - `2` if any dir is `incomplete` OR any dep extraction errored.

## Output to user

See step 5.
