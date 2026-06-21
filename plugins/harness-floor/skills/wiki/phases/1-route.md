# Phase A — Route (Index-as-Router)

**Purpose:** Search `INDEX.md` for the query and decide whether to read an existing page (Phase A match) or create a new one (Phase B write).

Uses `lib/wiki-index.mjs` → `routePhaseA(query, entries)`.

## Routing Logic

Call `routePhaseA(query, entries)` with the user's query string and the parsed index entries from Phase 0.

| Outcome | `match` | `candidates` | Action |
|---------|---------|--------------|--------|
| Exact slug match | entry | [] | Read the page → print BLUF + Provenance grade |
| Single title match | entry | [] | Read the page → print BLUF + Provenance grade |
| Multiple matches | null | [entries] | Present disambiguation list; user picks or refines |
| Tag-only matches | null | [entries] | Present list; user picks or proceeds to Phase B |
| No match | null | [] | Ask user: "Create new page titled `<query>`?" → Phase B |

## Read Path (match found)

1. Resolve `<wikiDir>/<entry.file>`.
2. Print the full page content (BLUF section first).
3. Ask: *"Update this page? (y/n)"*
   - Yes → proceed to Phase B with `mode=update`.
   - No → done (exit 0).

## Disambiguation Path

Present up to 5 candidates. User selects one by number or types a refined query.

## New Page Path (no match)

Ask: *"No wiki page for '<query>'. Create one? (y/n)"*
- Yes → proceed to Phase B with `mode=create`, slug derived from query (lowercase, hyphens).
- No → done (exit 0).

## Non-interactive (--yes flag)

- Single match → read and print only.
- No match → create new page automatically (grade=C unless `--grade` set).
- Multiple matches → pick highest-grade candidate; log the selection.
