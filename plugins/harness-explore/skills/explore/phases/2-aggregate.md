# Phase 2 — Aggregate

## Inputs

- `state.perDir` from Phase 1 (map of dir → subagent reply).
- `state.config` from Phase 0.

## Steps

1. Initialise `map`:
   ```json
   {
     "schemaVersion": "1.0.0",
     "sha": "<state.sha>",
     "generatedAt": "<iso>",
     "root": "<abs repo root>",
     "totalFiles": 0,
     "totalLines": 0,
     "sizeCategory": "<state.sizeCategory>",
     "languages": {},
     "ignorePatterns": [...],
     "dirs": [],
     "publicEntryPoints": [],
     "depGraph": null,
     "stateAtGeneration": {
       "branch": "<git branch>",
       "uncommittedChanges": <bool>
     }
   }
   ```

2. Walk `state.perDir` in stable (alphabetical) dir order. For each
   entry `D → result`:
   - Push the result into `map.dirs[]` verbatim.
   - Accumulate `map.totalFiles += result.fileCount` (skip if
     `incomplete`).
   - Accumulate `map.totalLines += result.totalLines || 0`.
   - Merge `result.languages` into `map.languages` (sum counts).
   - Concatenate `result.publicEntryPoints` into
     `map.publicEntryPoints`.

3. De-duplicate `map.publicEntryPoints` (preserve first occurrence).

4. Capture git state:
   - Branch via `git rev-parse --abbrev-ref HEAD`.
   - Uncommitted: `git status --porcelain | wc -l > 0`.
   - Store on `map.stateAtGeneration`.

5. Validate that every dir in the work list appears either as a
   complete summary or an `incomplete` marker. Any missing → push
   `{dir: <missing>, incomplete: true, reason: "no-subagent-reply"}`.

6. Stash on `state.map` (NOT yet to disk — Phase 4 writes the cache
   file).

7. Push `{phase: 2, completedAt: "<iso>", totalFiles, totalLines,
   languageCount: <num distinct exts>}` to state.

## Output to user

Print:

```
Phase 2: aggregated <N> dirs → map with <F> files, <L> lines,
<E> distinct extensions. Public entry points: <P>.
```
