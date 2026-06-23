# Phase 4 — Import (project doc → wiki, reference + synthesize)

`/wiki import <doc-path>` records ONE project doc into the wiki as a topic page
(BLUF + synthesis + source link). **Reference, never duplicate** — the page
summarizes and points at the source; it never copies the doc body.

## Single-doc steps

1. **Mechanical prep (orchestrator, ~0 model tokens):**
   ```javascript
   import { deriveTopic } from "./lib/wiki-import.mjs";
   import { readPage } from "./lib/wiki-log.mjs";
   const { topic, slug, type } = deriveTopic(docPath, readFileSync(docPath, "utf-8"));
   const existing = readPage(".wiki", slug);   // {found, content} — for merge context
   ```
2. **Delegate authoring to a wiki-scribe subagent (Task, `model: config.wiki.model`, default `haiku`).**
   > `description`: `Wiki import: <topic>`
   > `model`: `config.wiki.model`
   > `prompt`: "You are a concise wiki scribe. Read the doc at `<docPath>` and (if any) the existing
   > page below. Return JSON `{ bluf: <≤1 sentence>, details: <synthesis of the approach/decisions in
   > ≤200 words>, contradictions: <if this doc reverses a prior decision on the page, both sides; else ''> }`.
   > **Summarize and point at the source — do NOT copy the doc's body verbatim. The wiki page is a synthesis
   > + pointer, not a mirror.** No prose outside the JSON. Existing page: <existing.content or '(none)'>."
3. **Persist (orchestrator, in skill context — keeps the lib import install-safe):**
   ```javascript
   import { importDoc } from "./lib/wiki-import.mjs";
   const authored = /* the scribe's returned { bluf, details, contradictions } */;
   const res = importDoc(".wiki", docPath, { type, authored, now: new Date().toISOString().slice(0,10) });
   if (!res.ok) console.warn(`wiki import skipped: ${res.error}`);
   ```
   `importDoc` preserves prior `sources:` and promotes grade C→B as a topic accretes evidence.
4. Re-run the compile self-audit (`/wiki compile`, diff=0) and report `Imported → .wiki/<slug>.md`.

### Backfill — `/wiki import --all`

1. **Resolve source roots.** Read `config.wiki.sources`. **If empty/unset, first-run interactive
   selection:** auto-discover candidate dirs (every dir under `docs/` and the conventions that
   contains `.md`), present them via `agent-interaction/v1` MULTI-SELECT (exclude defaults
   pre-checked; rule 14 — no silent auto-proceed), and persist the chosen `sources`+`exclude` to
   `.agent-all.json` (atomic write) for reuse.
2. **Plan (no writes):**
   ```javascript
   import { planBackfill } from "./lib/wiki-import.mjs";
   const files = /* walk each config.wiki.sources root for *.md */;
   const plan = planBackfill(files, { exclude: config.wiki.exclude });
   ```
3. **Dry-run preview (DEFAULT — `--all` without `--apply`).** Print: total docs, distinct topics
   (`new Set(plan.topics).size`) they collapse into, excluded count, and an estimated scribe cost
   (`plan.ordered.length` × a per-doc token estimate × `config.wiki.model` rate from
   `config.telemetry.cost.modelRates`, if present; else show the count only). Make NO writes.
4. **Apply (`/wiki import --all --apply`).** Import `plan.ordered` oldest-first (each through the
   single-doc scribe+`importDoc` flow above), so a topic page evolves chronologically and
   contradictions track reversals. Stop and report remaining work if accumulated cost exceeds
   `config.wiki.maxImportUSD`. Idempotent: re-running merges, never duplicates.
