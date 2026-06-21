# Phase B — Write / Update

**Purpose:** Write a new wiki page or update an existing one, then update `INDEX.md`.

## Pre-write

1. If `mode=create`:
   - Derive `slug` from title: lowercase, strip punctuation, replace spaces with hyphens.
   - Derive `file` from slug: `<slug>.md`.
   - Confirm file does not exist (or `--force` is set).

2. If `mode=update`:
   - Read existing page content.
   - Confirm overwrite unless `--force`.

## Page Content

All pages follow the standard template (`templates/page.md.tpl`). The key sections are:

```markdown
---
title: <Title>
slug: <slug>
grade: <A|B|C>
tags: [tag1, tag2]
updated: <ISO-8601 date>
---

# <Title>

**BLUF:** <One-sentence bottom line up front.>

## Details

<Main content>

## Provenance

Grade: <A|B|C>
- A = primary source (official docs, spec, code)
- B = secondary source (blog post, talk, third-party guide)
- C = inferred / synthesised from context

Sources:
- <source 1>
- <source 2>

## Contradictions

<!-- Record conflicts here rather than silently resolving them -->
_None known._

## Related

- [<Page Title>](<file.md>) — <one-line note>
```

## Write Steps

1. Render the template with user-supplied content.
2. If `--dry-run`: print the rendered page and the proposed index row. Do not write.
3. Otherwise:
   a. Write `<wikiDir>/<file>`.
   b. Update `INDEX.md` via `appendIndexEntry(raw, entry)` and write the updated raw.

## Provenance Grade Guidance

| Grade | When to use |
|-------|-------------|
| A | You are reading primary documentation, a spec, or the actual source code. |
| B | You are summarising a blog post, conference talk, or third-party tutorial. |
| C | You are synthesising from context, memory, or multiple secondary sources. |

## Contradiction Handling

If the page content contradicts an existing page, record both in the Contradictions section of **both** pages. Do not silently resolve. Add a cross-reference under Related.

## After Write

Run Phase 3 automatically to confirm the compile gate passes (diff=0). Print the result inline.
