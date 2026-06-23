# Project-Docs ↔ Wiki Integration — Design

**Status:** Approved for planning (2026-06-23)
**Scope:** `/wiki` skill (harness-floor) + `agent-all` Phase 2 + the `agent-init` install template (harness-builder) + `.agent-all.json` wiki config.

## Problem

The richest design/knowledge artifacts a project produces — brainstorming **specs** (`docs/superpowers/specs/*`), writing-plans **plans** (`docs/superpowers/plans/*`), agent-all **tasks** (`.agent-skill/tasks/*` or legacy `docs/tasks/*`), and a project's own hand-written docs — live in a parallel documentation system that **bypasses the `.wiki/` knowledge base**. Today only `agent-all` records anything to the wiki (Phase 2 plan summary, Phase 5 outcome). Anyone querying the wiki for "the design for topic X" gets agent-all's thin Phase-2 summary, not the actual spec — and gets nothing at all when brainstorming/writing-plans run standalone (outside an agent-all run).

The real target project, `posco-mds`, makes the gap concrete and large: **931 markdown docs** under `docs/` (226 in `docs/tasks/`, plus `docs/design`, `docs/ssot`, `docs/conventions`, `docs/api`, `docs/decisions`, `docs/superpowers`, and dozens of top-level knowledge docs) versus a **`.wiki/` with 2 pages** — essentially unused. The opportunity is to turn the scattered corpus into a navigable, topic-keyed, synthesized wiki; the danger is that an indiscriminate import of 931 heterogeneous docs (meeting notes, raw artifacts, screenshot dumps) creates a noisy, expensive mess.

## Goal

A single **`/wiki import`** engine that records project docs into the wiki by **reference + synthesis, never duplication**: each doc becomes (or merges into) a topic page carrying a one-line BLUF, a synthesized current-state summary, and a **source link** back to the primary doc. The engine powers three entry points — standalone capture (advisory hook), one-time backfill (`--all`), and agent-all's existing in-run recording — over **project-configurable source roots**, scale-safely.

## Non-goals

- **No duplication.** The wiki page references and synthesizes; it never copies a doc's body verbatim. Two copies = drift.
- **No indiscriminate mass import.** The backfill never imports a whole tree blindly; source roots are user-curated and the run is dry-run-previewed and cost-capped.
- **No new documentation system.** This routes existing docs into the existing `.wiki/` engine (`writePage` topic-merge + `sources[]`); it does not invent a second index.
- **No editing of upstream skills.** `brainstorming`/`writing-plans` are upstream superpowers skills; standalone capture is achieved by an advisory hook + the orchestrator running `/wiki import`, never by forking those skills.

## Platform / existing facts

- `lib/wiki-log.mjs`: `findOrCreatePage(wikiDir, topic) → {ok, slug, file, existed}`; `writePage(wikiDir, {title, slug, grade, tags[], bluf, details, contradictions?, related[], sources[]})` is **topic-merge** (replaces the INDEX row + page if the slug exists, else appends); `slugify(title)`; `ensureWiki`; `compile`.
- The `/wiki` skill already has a phase pipeline (`phases/1-route.md` …) and a `WIKI_DIR` env / `.wiki` default.
- agent-all Phase 2 already does the canonical "mechanical prep → cheap-model wiki-scribe → `writePage`" pattern; this engine generalizes it.
- `.agent-all-state.json` carries `status:"running"` during an agent-all run (v0.7.8) — the capture hook keys off it to avoid double-recording.
- `.agent-all.json` already has a `wiki` block (`wiki.auto`, `wiki.model`); this design adds `wiki.sources` and `wiki.exclude` to the same SSOT (read by both agent-all and `/wiki`).

## Architecture — components

### 1. Core engine — `lib/wiki-import.mjs` + `/wiki import` phase

The mechanical half is a pure lib; the prose synthesis is a cheap-model scribe orchestrated by the `/wiki import` phase doc (same split as agent-all Phase 2, so the lib stays install-anchored).

- **`deriveTopic(docPath, content, type) → { topic, slug }`** (pure, tested). The merge key. Rules:
  - Strip a leading ISO date (`YYYY-MM-DD-`), a leading task id (`T-YYYYMMDD-NNN-`), a leading numeric prefix (`NN-`), and a trailing `-design`/`-plan`/`.md` from the filename; prefer the doc's first `#` heading or frontmatter `title` when present; `slugify` the result. So `2026-06-23-agent-all-compaction-resilience-design.md` (spec) and `2026-06-23-agent-all-compaction-resilience.md` (plan) both derive slug `agent-all-compaction-resilience` → they **merge into one topic page**.
  - `type ∈ {spec, plan, task, doc}` is inferred from the path (under `specs/` → spec, `plans/` → plan, `tasks/` → task, else generic doc) and recorded in the source label.
- **`importDoc(wikiDir, docPath, { type, authored }) → { ok, slug, existed, merged }`** (mechanical): derives the topic, `findOrCreatePage`, and `writePage` with `sources` **adding** `"<type>: <docPath>"` (de-duplicated; never dropping existing sources), `grade` promoted `C→B` as the second+ source for a topic lands, and `contradictions` carried through from the scribe. `authored = { bluf, details, contradictions }` comes from the scribe.
- **`/wiki import <doc-path>`** (phase): mechanical prep (`importDoc` minus the scribe) → dispatch a **cheap wiki-scribe (`wiki.model`, default `haiku`)** that reads the doc + the existing page (if any) and returns `{ bluf (≤1 sentence), details (synthesis of approach/decisions, ≤200 words), contradictions }` — explicitly instructed to **summarize and point at the source, never copy the body** → `writePage`.
- **`/wiki import --all <root...>`**: backfill mode (see §4).

### 2. Configurable source roots — `.agent-all.json` `wiki` block

```json
{ "wiki": { "auto": true, "model": "haiku",
            "sources": ["docs/superpowers/specs", "docs/superpowers/plans", ".agent-skill/tasks"],
            "exclude": ["**/process-archive/**", "**/raw/**", "**/artifacts/**", "**/*-shots/**", "**/meeting-*/**"] } }
```

- `wiki.sources` defaults to the agent-skill convention. Projects with their own layout (posco-mds) override it.
- `wiki.exclude` is a glob list applied to every backfill/scan.
- **First-run interactive configuration:** when `/wiki import --all` runs and `wiki.sources` is unset/empty, the engine auto-discovers candidate doc directories (every dir under `docs/` and the conventions containing `.md` files), presents them via `agent-interaction/v1` **multi-select** (with the exclude defaults pre-checked), and on confirm **persists** the chosen `sources` + `exclude` to `.agent-all.json` (atomic). Subsequent runs reuse the saved config — a one-time decision (rule 14: no silent auto-proceed).

### 3. Advisory capture hook (standalone trigger)

New `agent-init` PostToolUse hook on `Write|Edit` → installed `.claude/hooks/wiki-capture.mjs`, registered in `settings.local.json.hbs`.

- Reads the tool payload `file_path`. If it matches a `wiki.sources` root (or the convention defaults when no config) and is a `.md` not under an `exclude` glob → emit a **non-blocking advisory**: *"You just wrote a <type> at <path>. Record it in the project wiki (reference, not copy): run `/wiki import <path>` when convenient."*
- **Suppression:** if `.agent-all-state.json` `status === "running"`, stay silent — agent-all records to the wiki itself; the standalone nudge would double up.
- Deterministic (path match + emit); the LLM does the synthesis via `/wiki import`. Non-fatal, `exit 0` always (mirrors the other hooks).

### 4. Backfill — `/wiki import --all` (scale-safe)

- Resolves `wiki.sources` (interactive first-run config if unset, §2), walks each root for `.md` files, applies `wiki.exclude`.
- **Dry-run preview first (default):** `--all` without `--apply` prints a preview — file count, the set of **topics** they collapse into via `deriveTopic` (so the user sees "226 task files → ~14 topics"), excluded count, and an **estimated scribe cost** (docs to author × `wiki.model` rate). No writes.
- **Apply gate:** `/wiki import --all --apply` runs the imports, ordered by date prefix (oldest first, so a topic page evolves chronologically and `contradictions` track reversals). A **cost cap** (`wiki.maxImportUSD`, default a safe ceiling) stops the run and reports remaining work if exceeded.
- Idempotent: re-running merges (topic-merge), it does not duplicate.

### 5. agent-all Phase 2 extension

Phase 2 already records the plan. Add the **spec** as a source: when Phase 1 ran brainstorming and produced a spec file, Phase 2's `writePage` `sources` includes `spec: <path>` alongside `plan: <path>`. One-line addition; the rest of Phase 2's wiki flow is unchanged.

### 6. Guardrails

- **Reference-not-duplicate:** the scribe prompt forbids verbatim copying; a test asserts an imported page's body is materially smaller than its source doc (a copy-detection ratio) and that the `sources[]` link to the primary doc is present.
- **Topic-merge collapse:** the same `deriveTopic` slug across spec/plan/task/doc is what prevents per-file page explosion (226 tasks → a handful of feature topics). Imperfect merges are acceptable for v1; the existing `/wiki` Phase-A fuzzy route remains the manual dedupe path.

## Data flow

1. **Single import:** `/wiki import docs/.../X.md` → `deriveTopic` → `findOrCreatePage` → scribe synthesizes → `writePage` (source += `X.md`, merge if topic exists).
2. **Standalone capture:** brainstorming writes `docs/superpowers/specs/X.md` → `wiki-capture.mjs` (agent-all not running) nudges → orchestrator runs `/wiki import X.md`.
3. **Backfill:** `/wiki import --all` → (first run) interactive root selection → persist config → dry-run preview (931 → topics + cost) → `--apply` (oldest-first, cost-capped).
4. **agent-all:** Phase 2 records plan **+ spec** as sources (suppressing the capture hook via `status:running`).

## Testing (node --test, existing patterns)

- `deriveTopic` unit tests: spec+plan of one feature → identical slug (merge); date/task-id/numeric prefixes and `-design`/`-plan` suffixes stripped; first-`#`/frontmatter title preferred; posco-style names (`04-db-schema-design.md`, `LOT_DATA_SSOT.md`, `T-20260611-001-fix-login.md`) → sane slugs.
- `importDoc` lib tests: new topic → page + source link; second source for same topic → merge (one page, two sources, grade C→B, no source dropped); idempotent re-import.
- Reference-not-duplicate test: imported page body ≪ source doc size; source link present.
- `wiki-capture.mjs` hook test (`execFileSync`): write under a source root → advisory emitted naming path + `/wiki import`; write under an exclude glob or unrelated path → no advisory; `status:"running"` → suppressed; non-fatal on bad input.
- Backfill test: `--all` dry-run over a fixture dir (2 specs + 1 plan + 1 excluded) → correct topic count, excluded count, no writes; `--apply` → pages written, merges correct, cost-cap stop path.
- agent-all Phase 2 contract: `sources` includes `spec:` when a spec exists.
- settings snapshot regen for the new PostToolUse hook.

## Definition of Done

- All tests green; new tests fail against pre-change code.
- **Live on posco-mds (the real validation):** run `/wiki import --all` → interactive root selection over its real `docs/` tree → config persisted → dry-run preview shows the 931 docs collapsing to a sane topic count + a cost estimate → import a curated subset with `--apply` → verify (a) topic-merge collapsed related docs, (b) pages reference (link) not copy, (c) re-run is idempotent. Also: write a standalone spec → capture hook nudges → `/wiki import` records it.
- `/agent-init` installs `wiki-capture.mjs` + registers it (existing installs re-run `/agent-init` once — the established re-init).
- Full suite green.

Release (separate, gated): version bump + the standard version-bump-tax, with a RELEASE CHECKLIST note for the new hook.

## Decomposition (for the plan)

1. `deriveTopic` + `importDoc` lib (the engine core) + tests.
2. `/wiki import <doc>` phase (scribe orchestration) + reference-not-duplicate guardrail.
3. `wiki.sources`/`wiki.exclude` config (+ config-loader support) + first-run interactive selection.
4. `/wiki import --all` backfill (dry-run preview, exclude, cost cap, oldest-first apply).
5. `wiki-capture.mjs` advisory hook + settings registration + agent-all-active suppression + snapshot regen.
6. agent-all Phase 2 `spec:` source addition.

Engine (1-2) is the foundation; 3-6 depend on it. One cohesive spec, ordered tasks.
