# Phase 3 — Compile Self-Audit (diff=0 gate)

**Purpose:** Verify that `INDEX.md` and the on-disk pages are perfectly consistent. The gate passes only when the diff is zero (no orphaned index entries, no unindexed pages).

Uses `lib/wiki-index.mjs` → `compileSelfAudit(wikiDir)`.

## Gate Logic

Call `compileSelfAudit(wikiDir)`. The function returns:
```
{
  ok: boolean,           // true only when indexOnly=[] AND pagesOnly=[]
  indexOnly: string[],   // files in INDEX.md that don't exist on disk
  pagesOnly: string[],   // .md files on disk not listed in INDEX.md
  matched: string[],     // consistent entries
  entryCount: number,
  pageCount: number
}
```

## Outcomes

| ok | indexOnly | pagesOnly | Meaning |
|----|-----------|-----------|---------|
| true | [] | [] | **PASS** — diff=0, wiki is consistent |
| false | non-empty | [] | **FAIL** — index declares pages that don't exist on disk |
| false | [] | non-empty | **FAIL** — pages on disk are not indexed |
| false | non-empty | non-empty | **FAIL** — both directions drift |

## PASS output

```
wiki compile: ok (N pages indexed, N on disk, diff=0)
```

Exit code 0.

## FAIL output

```
wiki compile: FAILED
  Index-only (not on disk):   <file1.md>, <file2.md>
  Pages-only (not indexed):   <file3.md>
  Fix: run /wiki update <slug> to re-index, or /wiki write to create missing pages.
```

Exit code 1 (non-zero blocks the pipeline).

## When called by Phase B

Phase B calls this phase automatically after every write. If the gate fails after a write, the write is still persisted (it is not rolled back), but the session output flags the drift so the user can repair it.

## When called directly (run /wiki compile)

The compile gate is the authoritative health check for the wiki. Run it before committing wiki changes or before a session handoff.
