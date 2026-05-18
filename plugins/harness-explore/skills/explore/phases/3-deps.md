# Phase 3 — Dependency graph extraction

Skippable if `--no-deps` is set OR if no files in the map match a
supported language extension. Supported in v1: **TypeScript / TSX /
JS / JSX / MJS / CJS**, **Python**, **Rust**, **Go**.

## Inputs

- `state.map` from Phase 2.
- `state.config` from Phase 0 (`config.languages`).

## Steps

1. Build the work list: walk `map.dirs[*].entries[*]`, collect every
   `entry.path` whose extension is in
   `["ts","tsx","js","jsx","mjs","cjs","py","rs","go"]` ∩
   `config.languages`. Drop anything marked `kind: "doc"` or
   `"config"`.

2. If work list is empty: set
   ```json
   map.depGraph = {
     "schemaVersion": "1.0.0",
     "supportedLanguages": [],
     "imports": {},
     "importedBy": {},
     "orphans": [],
     "skipped": "no-typed-languages"
   }
   ```
   and proceed to step 7.

3. For each file `F` in the work list:
   - Determine language from the extension via
     `lib/dependency-extractor.mjs#languageOf(path)`.
   - Call `lib/dependency-extractor.mjs#extract(filePath, language)`
     to get `{ imports: string[], exports: string[] }`. Imports are
     RAW import strings (e.g., `"./session"`, `"react"`,
     `"crate::auth"`).
   - On read or scan failure: log to `state.depErrors[]`, continue.

4. Resolve each raw import to an absolute repo-relative path via
   `lib/dependency-extractor.mjs#resolveRelative(rawImport, fromFile,
   { tsconfigPaths })`:
   - Bare module specifiers (`"react"`, `"crate::foo"`, `"fmt"`)
     resolve to `null` — they're external, excluded from the graph.
   - Relative paths (`"./foo"`, `"../bar/baz"`) resolve to an
     in-repo path. If the resolved path doesn't exist in `map.dirs`,
     keep the raw string but mark it unresolved (still excluded from
     `importedBy` indexing).
   - Honour `tsconfig.json` `compilerOptions.paths` for TS if
     present at repo root (best-effort; only the simplest
     `"@scope/*": ["src/*"]` form is supported in v1).

5. Build two indexes:
   - `imports[file]` = array of resolved in-repo paths this file
     imports.
   - `importedBy[file]` = inverse — files that import this file.

6. Compute `orphans` = files in the work list that:
   - Have `importedBy[file]` empty AND
   - Are not in `map.publicEntryPoints`.

7. Attach `depGraph` to `state.map`:
   ```json
   {
     "schemaVersion": "1.0.0",
     "supportedLanguages": ["ts","py","rs","go"],
     "imports": { ... },
     "importedBy": { ... },
     "orphans": [ ... ],
     "skipped": false
   }
   ```

8. Push `{phase: 3, completedAt: "<iso>", filesScanned: <N>,
   importEdges: <count>, depErrors: <count>}` to state.

## Performance budget

Target: ≤ 30s for repos up to 50K supported files. Implementation:

- Streaming reads (one file at a time); no AST.
- Bounded worker pool sized to `min(os.cpus().length, 8)`.
- Skip any file > 1 MB (likely generated; emit warn).

## Accuracy tradeoffs (v1 — regex only)

See `references/design-notes.md` for the full table. Highlights:

- **Misses**: dynamic `import()` calls, TS `export * from "./foo"`
  re-exports (partial), conditional imports inside functions, Python
  `__import__()`, Rust macro-generated `use`, Go build-tag-gated
  imports.
- **False positives**: import-like strings inside comments or string
  literals (regex scans line-anchored statements; multi-line string
  literals can slip through).
- **Acceptable for v1.** AST upgrade tracked as v2 follow-up in the
  design spec §15.

## Output to user

Print:

```
Phase 3: dep graph — <N> files scanned, <E> import edges, <O> orphans.
```

Or, if skipped:
```
Phase 3: skipped (no supported typed-language files in map).
```
