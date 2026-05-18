# Phase 1 — Fan-out (parallel subagent dispatch)

## Pre-fan-out

Invoke `Skill` with `superpowers:dispatching-parallel-agents`. Adopt
its dispatch checklist before starting the fan-out.

## Inputs

- `sha`, `sizeCategory`, `config` from Phase 0 state.
- Repo root = current working directory.

## Enumerate top-level dirs

Call `lib/tree-walker.mjs#topLevelDirs(root, config.ignorePatterns)`.
The walker:
- Returns immediate subdirectories of `root` only (not deep).
- Excludes anything matching `config.ignorePatterns`.
- Honours `.gitignore` if present at root (read via
  `tree-walker.mjs#loadGitignore(root)`).
- Honours `.explore-ignore` (same syntax as `.gitignore`).

If the result is empty (single-dir repo, or all dirs ignored): emit
warn `no top-level dirs to scan; mapping the root as a single dir`
and treat `["."]` as the work list.

## Dispatch one subagent per top-level dir

For each dir `D` in the work list:

1. Render the prompt via `lib/dir-subagent-prompt.mjs#render(D, root,
   { tokenBudget: config.subagentOutputTokenBudget, ignorePatterns:
   config.ignorePatterns })`. This pulls
   `templates/dir-summary-prompt.md.hbs` and injects per-dir context
   (path, glob hints, token budget, ignore patterns, JSON schema).

2. Dispatch via the `Task` tool (or platform-equivalent) with:
   - `subagent_type: "general-purpose"`
   - `description: "Explore scan: <D>"`
   - `prompt: <rendered prompt from step 1>`

3. Run subagents in parallel up to `min(config.concurrency,
   workList.length)`.

## Subagent contract (recap — full text lives in the rendered prompt)

Each subagent:
- Uses its own `Read` + `Glob` (or platform equivalent) tools to
  enumerate `D` recursively (respecting `ignorePatterns`).
- Returns ONE JSON object with this shape:
  ```json
  {
    "dir": "<D>",
    "fileCount": <int>,
    "totalLines": <int>,
    "languages": { "<ext>": <count>, ... },
    "purpose": "<one paragraph>",
    "publicEntryPoints": ["<path>", ...],
    "notableConventions": ["<bullet>", ...],
    "entries": [
      {
        "path": "<repo-relative path>",
        "kind": "module" | "subdir" | "config" | "test" | "doc" | "other",
        "lines": <int>,
        "exports": ["<symbol>", ...],
        "symbols": [
          { "name": "<symbol>", "kind": "function|class|interface|const|type", "line": <int> }
        ]
      },
      ...
    ],
    "incomplete": false
  }
  ```
- `entries[*].symbols` is BEST EFFORT — required for TS/Py, optional
  for other languages (Rust/Go in v1 are imports-only).
- Output budget: ≤ `tokenBudget` tokens (default 4000). Subagents are
  instructed to summarise rather than enumerate when a dir contains
  >50 files at depth >3.

## Orchestrator post-dispatch

1. Collect all subagent results into `state.perDir[D] = <result>`.

2. Validate each reply:
   - Must parse as JSON.
   - Must include `dir`, `fileCount`, `entries`.
   - On validation failure: set `state.perDir[D] = { dir: D,
     incomplete: true, reason: "<message>" }` and continue.

3. Compute coverage = (count of complete dirs) / (total dirs).
   - If coverage < 0.75: abort Phase 1 with exit code 2. Phase 2 will
     not run; Phase 4 still writes a partial map with `incomplete:
     true` markers so the user can see what was attempted.

4. Push `{phase: 1, completedAt: "<iso>", dirsAttempted: <N>,
   dirsComplete: <K>, dirsIncomplete: <N-K>}` to state.

## Output to user

Print one line per dir:

```
<dir>: <fileCount> files, <complete|incomplete>
```

Then a summary:
```
Phase 1: <K>/<N> dirs scanned (concurrency=<C>).
```
