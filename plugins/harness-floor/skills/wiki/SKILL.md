---
name: wiki
description: Use when you want to read, write, or compile the project wiki — a structured markdown knowledge base kept in .wiki/ with an index-as-router, provenance grades, and contradiction-preserving pages.
---

# /wiki

Manages the project's CC-native wiki: a directory of structured markdown pages at `.wiki/` governed by an `INDEX.md` index-as-router.

Implements the Karpathy LLM-Wiki pattern (MIT). Core properties:
- **Index-as-Router** — `INDEX.md` is the single source of truth; all navigation goes through it.
- **2-Phase A/B routing** — Phase A searches the index; Phase B writes or updates the page.
- **Provenance grading** — each page is graded A (primary source) / B (secondary) / C (inferred/synthesised).
- **Contradiction preservation** — conflicts are recorded explicitly in pages rather than silently resolved.
- **BLUF + fixed sections** — every page follows the same template: BLUF, Details, Provenance, Contradictions, Related.
- **Compile self-audit** — `/wiki compile` runs a diff=0 gate: every index entry must have a page, every page must be indexed.
- **SessionStart digest** — a lightweight hook prints a wiki status summary at every session open.

## Usage

```
/wiki <query>               # Phase A: look up query in index → read or write page
/wiki write <title>         # Phase B: write a new page (prompts for content)
/wiki update <slug>         # Phase B: update an existing page
/wiki compile               # Run compile self-audit (diff=0 gate)
/wiki status                # Print index summary (entry count, drift, top grades)
/wiki list                  # List all pages in the index
```

## Flags

- `--grade=A|B|C` — override the provenance grade when writing/updating a page. Default is C.
- `--tags=tag1,tag2` — comma-separated tags to attach to the index entry.
- `--dry-run` — print what would be written without touching any files.
- `--force` — overwrite an existing page without confirmation.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | confirm `.wiki/` exists; create if first run |
| A | `phases/1-route.md` | Phase A: search INDEX.md for the query |
| B | `phases/2-write.md` | Phase B: write or update a page + update index |
| 3 | `phases/3-compile.md` | compile self-audit (diff=0 gate) — used by `/wiki compile` |

## Rules

1. **Index is authoritative.** Never write a page without updating `INDEX.md`. Never reference a page that is not in the index.
2. **Provenance grade is mandatory.** Default is C (inferred). Promote to B when citing a secondary source, A when citing primary documentation.
3. **Contradictions go in the Contradictions section.** Do not silently resolve; document the conflict and both sources.
4. **Compile gate must pass.** After every write or update, re-run Phase 3 (`/wiki compile`) to confirm diff=0.
5. **Pages follow the standard template.** Read `templates/page.md.tpl` before writing any page.
6. **SessionStart digest is non-fatal.** The hook exits 0 even when the wiki is absent or malformed.

## CLI

Run directly from the skill directory:

```
node lib/wiki-index.mjs compile|status|list [dir]
node lib/wiki-index.mjs route <query>
```

Wiki root: `compile`/`status`/`list` take an optional `[dir]` positional; all commands also honor the `WIKI_DIR` env var, defaulting to `.wiki` relative to cwd. `route` takes only `<query>` (which may be multi-word, so it has no positional dir slot) — point it at a non-cwd wiki with `WIKI_DIR=/path/to/.wiki node lib/wiki-index.mjs route <query>`.

Exit codes: `0` = ok/match, `1` = drift/no-match, `2` = usage error. Can gate a pipeline or pre-commit check: `node lib/wiki-index.mjs compile && echo "wiki ok"`.

## Lib modules

- `lib/wiki-index.mjs` — `parseIndex(wikiDir)` → entries; `routePhaseA(query, entries)` → match/candidates; `compileSelfAudit(wikiDir)` → diff=0 audit result; `appendIndexEntry(raw, entry)` → updated raw. Also ships a `compile|status|route|list` CLI entrypoint (see ## CLI above).

## SessionStart hook

The plugin ships a SessionStart hook (`bin/wiki-session-digest.mjs`) that prints a one-line status when a wiki exists:

```
✔ wiki: 12 page(s) indexed, 12 on disk
  Run /wiki status for details, /wiki compile to audit, /wiki <query> to read or write.
```

The hook is registered in `.claude-plugin/plugin.json` and requires no user action after plugin install.

## On error

- `.wiki/INDEX.md` missing → Phase 0 creates an empty wiki scaffold (confirm first).
- Query matches zero entries → Phase B offers to create a new page.
- Query matches multiple entries → Phase A presents candidates for selection.
- Compile gate fails (indexOnly or pagesOnly non-empty) → list drift; refuse to exit 0.
- `--dry-run` → print plan without writing; always exits 0.

## When done

Print the page path written (or read), the current entry count, and the compile gate result.
