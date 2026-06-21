---
name: wiki
description: Use when you want to read, write, or compile the project wiki — a structured markdown knowledge base kept in .wiki/ with an index-as-router, provenance grades, and contradiction-preserving pages.
---

# /wiki (Codex near-native)

Manages the project's Codex-native wiki: a directory of structured markdown pages at `.wiki/` governed by an `INDEX.md` index-as-router.

Spec anchor: **Codex near-native (live-CLI verified) | `.codex/skills/wiki-*` + PreToolUse first-call digest**

Implements the Karpathy LLM-Wiki pattern (MIT). Core properties:
- **Index-as-Router** — `INDEX.md` is the single source of truth; all navigation goes through it.
- **2-Phase A/B routing** — Phase A searches the index; Phase B writes or updates the page.
- **Provenance grading** — each page is graded A (primary source) / B (secondary) / C (inferred/synthesised).
- **Contradiction preservation** — conflicts are recorded explicitly in pages rather than silently resolved.
- **BLUF + fixed sections** — every page follows the same template: BLUF, Details, Provenance, Contradictions, Related.
- **Compile self-audit** — `run /wiki compile` runs a diff=0 gate: every index entry must have a page, every page must be indexed.
- **PreToolUse first-call digest** — a PreToolUse hook fires the wiki digest on the FIRST tool call of each session (sentinel-guarded; no-ops on subsequent calls).

## Usage

```
run /wiki <query>               # Phase A: look up query in index → read or write page
run /wiki write <title>         # Phase B: write a new page (prompts for content)
run /wiki update <slug>         # Phase B: update an existing page
run /wiki compile               # Run compile self-audit (diff=0 gate)
run /wiki status                # Print index summary (entry count, drift, top grades)
run /wiki list                  # List all pages in the index
```

## Codex primitive map

| Action | Codex primitive |
|---|---|
| Read file | implicit (model reads file directly) |
| Write file | `apply_patch` |
| Shell (one-shot) | `shell_command` |
| Prompt user | `ask_user` |
| Run compile gate | `shell_command: node -e "..."` against `.codex/skills/wiki/lib/wiki-index.mjs` |

All confirmation prompts (create new page? / update existing page? / etc.) route through `ask_user`.
All writes (page content + INDEX.md updates) go through `apply_patch`.
All reads are implicit.

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
| 3 | `phases/3-compile.md` | compile self-audit (diff=0 gate) — used by `run /wiki compile` |

## Rules

1. **Index is authoritative.** Never write a page without updating `INDEX.md`. Never reference a page that is not in the index.
2. **Provenance grade is mandatory.** Default is C (inferred). Promote to B when citing a secondary source, A when citing primary documentation.
3. **Contradictions go in the Contradictions section.** Do not silently resolve; document the conflict and both sources.
4. **Compile gate must pass.** After every write or update, re-run Phase 3 (`run /wiki compile`) to confirm diff=0.
5. **Pages follow the standard template.** Read `templates/page.md.tpl` before writing any page.
6. **PreToolUse first-call digest is non-fatal.** The hook exits 0 even when the wiki is absent or malformed.

## Lib modules

- `lib/wiki-index.mjs` — `parseIndex(wikiDir)` → entries; `routePhaseA(query, entries)` → match/candidates; `compileSelfAudit(wikiDir)` → diff=0 audit result; `appendIndexEntry(raw, entry)` → updated raw.

## PreToolUse first-call digest

The plugin ships a PreToolUse hook (`wiki-pretool-first-call-digest.mjs` in `.codex/hooks/`) that prints a one-line status on the FIRST tool call of each Codex session:

```
✔ wiki: 12 page(s) indexed, 12 on disk
  Run /wiki status for details, /wiki compile to audit, /wiki <query> to read or write.
```

**Why PreToolUse instead of SessionStart:** Codex does not expose a clean once-per-session opener usable for a status digest. The PreToolUse first-call pattern fires on the first tool invocation of each session and then immediately no-ops via a per-session sentinel file (`.wiki/.session-digest-<sessionId>`). See `references/porting-notes.md` for the full rationale and spec decision 7.

The `init.mjs` installer (the `wiki` bucket) writes the hook files into `.codex/hooks/` and **prints** a sentinel-bracketed TOML snippet to stdout. The user merges this snippet into `~/.codex/config.toml` (or the project `.codex/config.toml`) manually — the installer does not auto-patch `config.toml`.

## On error

- `.wiki/INDEX.md` missing → Phase 0 creates an empty wiki scaffold (confirm with `ask_user` first).
- Query matches zero entries → Phase B offers to create a new page (via `ask_user`).
- Query matches multiple entries → Phase A presents candidates for selection (via `ask_user`).
- Compile gate fails (indexOnly or pagesOnly non-empty) → list drift; refuse to exit 0.
- `--dry-run` → print plan without writing; always exits 0.

## When done

Print the page path written (or read), the current entry count, and the compile gate result.

## References

- `references/porting-notes.md` — PreToolUse-first-call rationale; cites spec decision 7
- `phases/*.md` — runnable Codex phase contracts
- CC source: `plugins/harness-floor/skills/wiki/SKILL.md`
