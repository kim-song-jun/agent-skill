# /harness-view Dashboard Redesign — Design Spec

**Date:** 2026-06-29
**Status:** approved (brainstorm) — ready for implementation plan
**Skill:** `plugins/harness-floor/skills/harness-view`
**Supersedes:** the v0.7.18 first-cut `/harness-view` renderer (kept the markdown→HTML engine; replaces the flat tabbed-accordion layout).

## 1. Problem & Intent

`/harness-view` compiles the harness's own markdown/JSON artifacts (the live `/agent-all`
run state, the task ledger, and design specs) into one self-contained HTML file. The
v0.7.18 first cut already renders markdown bodies to real HTML (headings, tables, code,
links, blockquotes) — that part works. But the original intent was a **dashboard** where a
user can both (a) browse specs/tasks at a glance and (b) read a *specific* spec/task as
easy-to-understand HTML rather than raw markdown. Two gaps block that intent:

1. **Navigability collapses at scale.** The Specs tab is a flat accordion of date-prefixed
   *filenames* (50 in this repo). No title extraction, no search, no filter, no grouping, no
   status — finding one spec means scrolling 50 identical gray bars. It is a file listing, not
   a dashboard.
2. **Markdown fidelity leaks raw syntax.** Task checkboxes `- [x]` / `- [ ]` render as literal
   `[x]` / `[]` text; nested lists flatten to one level; fenced-code language hints are dropped;
   headings have no anchors so long specs (up to ~29k chars) cannot be navigated.

### Goals
- Browse 50+ documents instantly: title extraction, live search, topic grouping, status.
- Read an individual spec/task in a focused pane with a table of contents.
- Remove the markdown fidelity defects (checkboxes, nested lists, code language, anchors).

### Non-goals (YAGNI)
- No new data sources — keep the existing three (run / tasks / specs).
- No external libraries, no build step, no network — preserve the dependency-zero,
  single-file, open-anywhere property.
- No editing — the view is read-only.
- No full-text relevance ranking — a substring filter is sufficient at this scale.

## 2. Constraints (locked during brainstorm)

| Decision | Choice |
|---|---|
| Scope | Full dashboard redesign: navigability + reading experience + fidelity fixes |
| Output form | Dependency-zero, single self-contained `index.html`, vanilla JS, hand-rolled markdown engine (no bundled lib) |
| Layout | **A + overview-home hybrid**: master-detail (sidebar + reading pane + TOC) with B's stat-card home as the default landing |

## 3. Architecture — single file preserved

- **Output unchanged:** still `.agent-skill/html/index.html`. `bin/render.mjs` and
  `writeDashboard({ cwd })` entry points and signatures are **unchanged**, so both consumers
  keep working untouched:
  - on-demand `/harness-view`
  - best-effort regeneration at each `/agent-all` phase checkpoint (live tracking)
- **Render strategy — server pre-render + JS toggle (option a):** Node pre-renders every
  document to HTML and embeds each as a hidden `<section data-doc-id="…">`. Vanilla JS shows
  the selected section and hides the rest. Consequences:
  - The markdown engine ships **only server-side** (Node); the browser needs no parser →
    stays dependency-free.
  - Document body text is present in the DOM, so client-side search reads `textContent` —
    no separate search index to build or embed.
  - Rejected alternative (b) "embed raw md + ship a JS parser": duplicates the engine into
    the client and is more complex for no portability gain.
- **Change surface:** `lib/harness-html.mjs` internals + its embedded CSS/JS only. No new
  sidecar files, no new dependencies.
- **File size:** ~50 docs inlined ≈ several hundred KB of HTML. Acceptable for a local file
  opened directly; documented as an accepted tradeoff of the single-file constraint.

## 4. Layout & Components

Three-column CSS grid under a slim header:

```
┌───────────────────────────────────────────────────────────┐
│ header: project · "harness view" · run badge · generated  │
├───────────────┬───────────────────────────────┬───────────┤
│ sidebar       │ reading pane                  │ TOC       │
│  search       │  (overview-home when nothing  │ "on this  │
│  Run          │   selected; else the selected │  page"    │
│  Tasks (n)    │   doc: title + meta + body)   │  h2/h3    │
│  Specs (n)    │                               │  anchors  │
│   topic grps  │                               │           │
└───────────────┴───────────────────────────────┴───────────┘
```

- **Sidebar (navigation):** search box on top, then sections in order **Run / Tasks / Specs**.
  - Run: a single row → selects the overview-home (or a dedicated run view).
  - Tasks: one row per task — extracted title + `id` + status badge.
  - Specs: grouped by topic family with per-group counts; each row shows the **extracted
    title** (not the filename), date, and language badge (EN/KO). Filename is available on
    hover (`title=`) but is not the primary label.
  - The active row is highlighted; selection drives the reading pane.
- **Overview-home (default landing, no selection):** the B-style stat cards —
  - Run: status badge + task + phase timeline (Preflight→…→Loop, done/current/todo) + decisions.
  - Tasks: rollup counts by status (done / running / todo).
  - Specs: total count + topic count + most-recent date.
- **Reading pane:** selected document's title, a meta line (filename · date · status), and the
  improved-markdown body.
- **TOC ("on this page"):** built from the selected doc's h2/h3 headings; anchor links jump
  within the pane. Scrollspy (highlighting the current section) is a nice-to-have, not required.
- **Responsive:** below a breakpoint the sidebar collapses behind a toggle; the TOC may hide.
  The reading pane is always the priority surface on narrow screens.

## 5. Navigation behavior

- **Title extraction:** first `# ` heading of the body → title; fall back to the filename slug.
- **Topic grouping:** derive a `family` from the filename slug against an ordered known-prefix
  list (`agent-all`, `visual-qa`, `harness-builder`, `harness-debug`, `harness-explore`,
  `harness-thrift`, `cross-platform`, `hook`, `decision-surfacing`, `auto-detect`,
  `native-ask`, `cli-runtime`), else `misc`. Validated: 50 specs → 12 groups. Sort within a
  group by date. (The prefix list lives in one place in the module so it is easy to extend.)
- **Live search:** substring match over title + family + body text; filters the sidebar list
  (and collapses empty groups). Clearing the box restores the full tree.
- **Deep-linking:** the selected document is reflected in the URL hash (`#doc=<id>`), and
  heading anchors are addressable (`#doc=<id>` + scroll to heading id). This lets a user
  bookmark/share a view and lets the harness link to a specific document. On load, the hash
  selects the doc; with no hash, the overview-home shows.

## 6. Markdown fidelity fixes (engine)

Applied in the existing `mdToHtml` / `inlineMd` functions, preserving the current escaping
and `safeHref` security posture:

| Fix | Before | After |
|---|---|---|
| Task checkboxes | `- [x] foo` → literal `[x] foo` | `<li><label class="task"><input type="checkbox" disabled checked> foo</label></li>` |
| Nested lists | all items flattened to one level | indent-stack tracks depth → correct nested `<ul>`/`<ol>` |
| Code fence language | ` ```python ` discarded | language captured → uppercase label badge on the code block |
| Heading anchors | none | each heading gets a slug `id` (deduped) for TOC + deep-link |
| Soft line wrap | single newline → `<br>` | single newline → space (CommonMark paragraph behavior) |

TOC data is produced as a side output of the body render (`{ html, toc }`), so headings are
slugged once and reused for both anchors and the TOC.

## 7. Backward compatibility & output

- `.agent-skill/html/index.html` path, `render.mjs`, and `writeDashboard()` signature are
  unchanged. `/agent-all` checkpoint regeneration and on-demand `/harness-view` are unaffected.
- Empty states remain graceful: no run state, no tasks, or no specs each render a friendly
  placeholder rather than an error.

## 8. Testing & verification (proportional to change — global rule 24)

- **Unit tests (real parsing/transform contracts)** in `tests/harness-view/harness-html.test.mjs`:
  checkbox rendering, nested-list nesting, code-fence language capture, heading-anchor id
  generation (incl. dedup), title extraction (+ filename fallback), topic-family grouping, and
  TOC extraction. Update the existing assertions affected by the soft-wrap change
  (`<br>` → space). These are genuine logic tests, not file-existence/echo-back tests.
- **Visual verification (global rule 17):** render the final build against real data with
  Playwright and screenshot the key states — overview-home, a selected doc (with checkboxes /
  nested list / code label / TOC), active search filter, and the responsive collapsed sidebar.
  Include before/after screenshots inline in the completion report (global rule 16).
- Full test suite is reserved for the release gate, not per-task (global rule 24).

## 9. Implementation surface (for the plan)

- `lib/harness-html.mjs`
  - engine: `mdToHtml` (checkboxes, nesting, code label, anchors, soft-wrap), `inlineMd` (unchanged behavior), heading slug helper, `{html, toc}` return.
  - collection: keep `collectArtifacts`; add per-doc derivation (title, date, family, id).
  - rendering: replace `renderDashboard` tabbed layout with the three-column shell;
    add `renderSidebar`, `renderOverviewHome`, `renderReadingPanes` (hidden sections),
    `renderToc`; keep `renderRun` content (reused inside overview-home).
  - client JS (inline): sidebar selection, show/hide panes, live search filter, hash routing.
  - CSS (inline): three-column grid, sidebar, cards, reading typography, TOC, responsive.
- `bin/render.mjs` — unchanged.
- `tests/harness-view/harness-html.test.mjs` — extend per §8.
- `SKILL.md` — refresh the "what it shows / layout" description to match the new UI.

## 10. Risks & mitigations

- **Single-file size** with 50+ inlined docs → accepted; mitigation is purely server-side
  pre-render (no client parser) which keeps the file static and fast to open.
- **Topic heuristic drift** as new families appear → the prefix list is centralized and
  `misc` is the safe catch-all; adding a family is a one-line edit.
- **Soft-wrap change** could alter a few existing rendered docs → covered by updating unit
  tests and by the visual pass.
