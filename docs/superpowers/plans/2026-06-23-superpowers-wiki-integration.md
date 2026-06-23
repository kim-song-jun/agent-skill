# Project-Docs ↔ Wiki Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single `/wiki import` engine that records project docs (specs/plans/tasks/hand-written docs) into `.wiki/` by reference + synthesis — topic-merge into one page per topic with a BLUF + source links — powering standalone capture (advisory hook), one-time backfill (`--all`), and agent-all Phase 2.

**Architecture:** A pure mechanical lib (`wiki/lib/wiki-import.mjs`: `deriveTopic` + `importDoc` + `parseSources` + `planBackfill`) reuses the existing `wiki-log.mjs` writer (`findOrCreatePage`/`writePage` topic-merge/`slugify`, vendored into `wiki/lib/`). The `/wiki import` phase orchestrates a cheap-model scribe (the agent-all Phase 2 pattern) for prose synthesis. Source roots are project-configurable in `.agent-all.json` (`wiki.sources`/`wiki.exclude`), interactively selected on first backfill. An advisory `agent-init` hook nudges standalone capture, suppressed during agent-all runs.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test` (`node --test`), `execFileSync` for real-hook tests, markdown phase-contract tests, Handlebars settings + snapshot tests, `scripts/sync-lib.mjs` vendoring.

## Global Constraints

- This is the `agent-skill` repo. Shared worktree on branch `main`: commit ONLY files each task names with `git add -- <paths>`; never `git add -A`/`stash`/`reset`/branch-switch. Verify each commit with `git show --stat HEAD`.
- **Reference, never duplicate.** A wiki page synthesizes + links to the source doc; it never copies the doc body verbatim. The scribe prompt must say so; a test asserts the page body is materially smaller than the source.
- **Topic-merge is the collapse mechanism.** `deriveTopic` must map a feature's spec, plan, and tasks to the SAME slug so they merge into one page (no per-file page explosion).
- **Reuse, don't reinvent:** `findOrCreatePage`/`writePage`/`slugify` from `wiki-log.mjs` (vendored into `wiki/lib/`). `writePage(wikiDir, {title, slug, grade, tags[], bluf, details, contradictions?, related[], sources[], updated})` is topic-merge (replaces the page + INDEX row when the slug exists). It renders `sources[]` as `- <label>` lines under a `Sources:` header in the `## Provenance` section.
- **Cheap scribe.** Prose authoring uses `wiki.model` (default `haiku`) in its own subagent context (global rule 11). The lib mechanics are free code (no model tokens).
- **Non-fatal hooks:** any error → `console.error("agent-skill hook warning: …")` + `process.exit(0)`. Project root = `process.env.CLAUDE_PROJECT_DIR || process.cwd()`.
- **Config SSOT:** `.agent-all.json` `wiki` block. Defaults: `{auto:true, model:"haiku", sources:["docs/superpowers/specs","docs/superpowers/plans",".agent-skill/tasks"], exclude:["**/process-archive/**","**/raw/**","**/artifacts/**","**/*-shots/**","**/meeting-*/**"], maxImportUSD:2.0}`.
- **Scope:** Claude `/wiki` skill first (the Codex `wiki-codex` port is a follow-up, not in this plan). No edits to upstream `brainstorming`/`writing-plans` skills.
- **Not in this plan (deferred release task):** version bump + version-bump-tax + RELEASE CHECKLIST hook note. Run the focused test per task with `node --test <path>`; full suite with `node --test`.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `plugins/harness-floor/skills/wiki/lib/wiki-import.mjs` | engine: `deriveTopic`, `parseSources`, `importDoc`, `planBackfill` (NEW) | 1, 4 |
| `plugins/harness-floor/skills/wiki/lib/wiki-log.mjs` | vendored copy of the writer (NEW vendor dest) | 1 |
| `scripts/sync-lib.mjs` | register the `wiki/lib/wiki-log.mjs` vendor dest | 1 |
| `plugins/harness-floor/skills/wiki/phases/4-import.md` | `/wiki import` orchestration (single + `--all`) (NEW) | 2, 4 |
| `plugins/harness-floor/skills/wiki/SKILL.md` | usage/flags for `import` | 2, 4 |
| `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs` | `wiki.sources`/`wiki.exclude`/`wiki.maxImportUSD` defaults + validation | 3 |
| `plugins/harness-builder/skills/agent-init/templates/hooks/wiki-capture.mjs` | advisory capture hook (NEW) | 5 |
| `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs` | register the PostToolUse hook | 5 |
| `plugins/harness-floor/skills/agent-all/phases/2-plan.md` | add `spec:` source | 6 |
| `tests/agent-all/lib/wiki-import.test.mjs` | engine tests (NEW) | 1 |
| `tests/agent-all/lib/wiki-backfill.test.mjs` | `planBackfill` tests (NEW) | 4 |
| `tests/agent-init/wiki-capture-hook.test.mjs` | hook tests (NEW) | 5 |
| `tests/agent-all/lib/config-loader-wiki-sources.test.mjs` | config tests (NEW) | 3 |
| `tests/agent-all/lib/wiki-import-phase-contract.test.mjs` | phase/SKILL/phase2 contract (NEW) | 2, 4, 6 |
| `tests/lib/__snapshots__/settings.local.json.hbs__*.snap` | regenerated | 5 |

---

## Task 1: Engine lib — `deriveTopic` + `importDoc` + `parseSources`

**Files:**
- Create: `plugins/harness-floor/skills/wiki/lib/wiki-import.mjs`
- Vendor: `plugins/harness-floor/skills/wiki/lib/wiki-log.mjs` (copy of `agent-all/lib/wiki-log.mjs`)
- Modify: `scripts/sync-lib.mjs` (add the vendor dest)
- Test: `tests/agent-all/lib/wiki-import.test.mjs`

**Interfaces:**
- Consumes: `findOrCreatePage`, `writePage`, `readPage`, `slugify` from `./wiki-log.mjs`.
- Produces:
  - `deriveTopic(docPath, content="", type=null) → { topic, slug, type }` — `slug` is the merge key (from the normalized filename); `topic` is a display title.
  - `parseSources(pageContent) → string[]` — the `- <label>` lines under `Sources:`.
  - `importDoc(wikiDir, docPath, { type, authored, now }) → { ok, slug, existed, sources }` — mechanical upsert preserving prior sources, grade `C`→`B` on the 2nd+ source.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-all/lib/wiki-import.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveTopic, parseSources, importDoc } from "../../../plugins/harness-floor/skills/wiki/lib/wiki-import.mjs";

test("deriveTopic: spec and plan of one feature share a slug (merge key)", () => {
  const spec = deriveTopic("docs/superpowers/specs/2026-06-23-agent-all-compaction-resilience-design.md");
  const plan = deriveTopic("docs/superpowers/plans/2026-06-23-agent-all-compaction-resilience.md");
  assert.equal(spec.slug, "agent-all-compaction-resilience");
  assert.equal(plan.slug, spec.slug, "spec+plan must collapse to the same topic");
  assert.equal(spec.type, "spec");
  assert.equal(plan.type, "plan");
});

test("deriveTopic: strips task-id, numeric, and date prefixes", () => {
  assert.equal(deriveTopic(".agent-skill/tasks/T-20260611-001-fix-login.md").slug, "fix-login");
  assert.equal(deriveTopic("docs/04-db-schema-design.md").slug, "db-schema");
  assert.equal(deriveTopic("docs/LOT_DATA_SSOT.md").slug, "lot-data-ssot");
});

test("parseSources extracts the Sources list", () => {
  const page = "## Provenance\n\nGrade: C\n- A = primary\n\nSources:\n- spec: docs/a.md\n- plan: docs/b.md\n\n## Contradictions\n";
  assert.deepEqual(parseSources(page), ["spec: docs/a.md", "plan: docs/b.md"]);
});

test("importDoc: new topic creates a page with a source link, grade C", () => {
  const wiki = mkdtempSync(join(tmpdir(), "wi-"));
  const doc = join(wiki, "spec.md");
  writeFileSync(doc, "# Auth redesign\n\nlong body ".repeat(50));
  const r = importDoc(wiki, doc, { type: "spec", authored: { bluf: "Auth.", details: "synth", contradictions: "" }, now: "2026-06-23" });
  assert.equal(r.ok, true);
  assert.equal(r.existed, false);
  const page = readFileSync(join(wiki, `${r.slug}.md`), "utf-8");
  assert.match(page, new RegExp(`spec: ${doc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(page, /grade: C/);
});

test("importDoc: second source for same topic merges (one page, two sources, grade B)", () => {
  const wiki = mkdtempSync(join(tmpdir(), "wi-"));
  const specDoc = join(wiki, "2026-06-23-x-design.md"); writeFileSync(specDoc, "# X\nbody");
  const planDoc = join(wiki, "2026-06-23-x.md"); writeFileSync(planDoc, "# X\nbody");
  const a = importDoc(wiki, specDoc, { authored: { bluf: "X.", details: "d", contradictions: "" } });
  const b = importDoc(wiki, planDoc, { authored: { bluf: "X.", details: "d2", contradictions: "" } });
  assert.equal(b.slug, a.slug, "same topic → same page");
  assert.equal(b.existed, true);
  const page = readFileSync(join(wiki, `${b.slug}.md`), "utf-8");
  const sources = parseSources(page);
  assert.equal(sources.length, 2, "both sources preserved");
  assert.match(page, /grade: B/, "promoted on 2nd source");
});

test("importDoc: reference-not-duplicate — page body much smaller than source", () => {
  const wiki = mkdtempSync(join(tmpdir(), "wi-"));
  const doc = join(wiki, "big.md");
  const big = "# Big spec\n\n" + "detailed paragraph. ".repeat(2000);
  writeFileSync(doc, big);
  const r = importDoc(wiki, doc, { authored: { bluf: "Big.", details: "a short synthesis", contradictions: "" } });
  const page = readFileSync(join(wiki, `${r.slug}.md`), "utf-8");
  assert.ok(page.length < big.length / 3, "synthesized page must be far smaller than the source (no copy)");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-all/lib/wiki-import.test.mjs`
Expected: FAIL (`wiki-import.mjs` and the vendored `wiki-log.mjs` do not exist → import error).

- [ ] **Step 3: Vendor `wiki-log.mjs` into the wiki skill lib**

Copy the writer so the wiki skill is install-anchored (no cross-skill import):

```bash
cp plugins/harness-floor/skills/agent-all/lib/wiki-log.mjs plugins/harness-floor/skills/wiki/lib/wiki-log.mjs
```

- [ ] **Step 4: Register the vendor dest in sync-lib**

In `scripts/sync-lib.mjs`, the `wiki-log.mjs` source list (around line 287) currently maps `agent-all/lib/wiki-log.mjs` → the codex copy. Add the wiki-skill dest so `sync-lib --check` keeps it honest. In the array that lists wiki-log destinations, add:

```javascript
  "plugins/harness-floor/skills/wiki/lib/wiki-log.mjs",
```

(Place it alongside the existing `agent-all-codex/.../wiki-log.mjs` dest entry, following the same structure that file uses for multi-dest vendoring.)

- [ ] **Step 5: Write the engine**

Create `plugins/harness-floor/skills/wiki/lib/wiki-import.mjs`:

```javascript
// wiki-import.mjs — route a project doc into the wiki by reference + synthesis.
// Mechanical half only; prose synthesis is a cheap-model scribe orchestrated by
// phases/4-import.md. Reuses the vendored wiki-log.mjs writer (install-anchored).
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { writePage, readPage, slugify } from "./wiki-log.mjs";

const TYPE_BY_DIR = [
  [/(^|\/)(docs\/superpowers\/)?specs?\//i, "spec"],
  [/(^|\/)(docs\/superpowers\/)?plans?\//i, "plan"],
  [/(^|\/)(\.agent-skill\/)?tasks?\//i, "task"],
];

function inferType(docPath) {
  for (const [re, t] of TYPE_BY_DIR) if (re.test(docPath)) return t;
  return "doc";
}

// The merge key. Normalize the FILENAME (not the H1 — spec/plan H1s differ) so a
// feature's spec, plan, and tasks collapse to one slug. Display title prefers H1.
export function deriveTopic(docPath, content = "", type = null) {
  const t = type ?? inferType(docPath);
  const stem = basename(docPath).replace(/\.md$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")     // ISO date prefix
    .replace(/^T-\d{8}-\d+-/i, "")          // task id prefix
    .replace(/^\d+[-_]/, "")                // numeric prefix (04-, 274_)
    .replace(/-(design|plan)$/i, "")        // design/plan suffix
    .replace(/_/g, "-");                    // underscores → hyphens (slugify keeps \w incl. _)
  const slug = slugify(stem);
  const h1 = /^#\s+(.+?)\s*$/m.exec(content)?.[1];
  const fm = /^title:\s*(.+?)\s*$/m.exec(content)?.[1];
  const topic = (h1 || fm || stem).trim();
  return { topic, slug, type: t };
}

export function parseSources(pageContent = "") {
  const lines = String(pageContent).split(/\r?\n/);
  const i = lines.findIndex((l) => /^Sources:\s*$/.test(l));
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    const m = /^-\s+(.+?)\s*$/.exec(lines[j]);
    if (!m) break;
    if (m[1] === "(none)") continue;
    out.push(m[1]);
  }
  return out;
}

function safeRead(p) { try { return existsSync(p) ? readFileSync(p, "utf-8") : ""; } catch { return ""; } }

export function importDoc(wikiDir, docPath, { type = null, authored = {}, now = "unknown" } = {}) {
  const { topic, slug, type: t } = deriveTopic(docPath, safeRead(docPath), type);
  const existing = readPage(wikiDir, slug);
  const prev = existing.ok && existing.found ? parseSources(existing.content) : [];
  const label = `${t}: ${docPath}`;
  const sources = [...new Set([...prev, label])];
  const grade = sources.length > 1 ? "B" : "C";
  const res = writePage(wikiDir, {
    title: topic, slug, grade, tags: [],
    bluf: authored.bluf ?? "", details: authored.details ?? "",
    contradictions: authored.contradictions ?? "", sources, updated: now,
  });
  return { ok: res.ok, slug, existed: !!(existing.ok && existing.found), sources, error: res.error };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tests/agent-all/lib/wiki-import.test.mjs`
Expected: PASS (6 tests). Then `node scripts/sync-lib.mjs --check` → `OK`.

- [ ] **Step 7: Commit**

```bash
git add -- plugins/harness-floor/skills/wiki/lib/wiki-import.mjs plugins/harness-floor/skills/wiki/lib/wiki-log.mjs scripts/sync-lib.mjs tests/agent-all/lib/wiki-import.test.mjs
git commit -m "feat(wiki): import engine — deriveTopic + importDoc (reference+synthesize, topic-merge)"
git show --stat HEAD
```

---

## Task 2: `/wiki import <doc>` phase + reference-not-duplicate scribe

**Files:**
- Create: `plugins/harness-floor/skills/wiki/phases/4-import.md`
- Modify: `plugins/harness-floor/skills/wiki/SKILL.md` (usage/pipeline rows for `import`)
- Test: `tests/agent-all/lib/wiki-import-phase-contract.test.mjs`

**Interfaces:**
- Consumes: `deriveTopic`/`importDoc` from `lib/wiki-import.mjs` (Task 1).
- Produces: the documented `/wiki import <doc-path>` orchestration.

- [ ] **Step 1: Write the failing contract test**

Create `tests/agent-all/lib/wiki-import-phase-contract.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const W = resolve("plugins/harness-floor/skills/wiki");
const read = (f) => readFileSync(resolve(W, f), "utf-8");

test("Phase 4 import orchestrates a cheap scribe with a no-copy guardrail", () => {
  const body = read("phases/4-import.md");
  assert.match(body, /wiki-import\.mjs|importDoc/, "calls the import engine");
  assert.match(body, /wiki\.model|haiku/, "uses the cheap wiki.model scribe");
  assert.match(body, /summari[sz]e|do not copy|not a copy|never copy/i, "instructs reference-not-duplicate");
  assert.match(body, /sources?:/i, "records the source link");
});

test("SKILL documents /wiki import", () => {
  const body = read("SKILL.md");
  assert.match(body, /\/wiki import/, "usage lists /wiki import");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-all/lib/wiki-import-phase-contract.test.mjs`
Expected: FAIL (no `phases/4-import.md`, SKILL has no `import`).

- [ ] **Step 3: Write the phase doc**

Create `plugins/harness-floor/skills/wiki/phases/4-import.md`:

```markdown
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
   `importDoc` preserves prior `sources` and promotes grade C→B as a topic accretes evidence.
4. Re-run the compile self-audit (`/wiki compile`, diff=0) and report `Imported → .wiki/<slug>.md`.

## `--all` backfill

See `### Backfill` below (added in the backfill task).
```

- [ ] **Step 4: Add SKILL usage**

In `plugins/harness-floor/skills/wiki/SKILL.md`, under `## Usage`, add a line after `/wiki update <slug>`:

```markdown
/wiki import <doc>          # Phase 4: record a project doc (spec/plan/task) into the wiki (reference+synthesize)
/wiki import --all          # Phase 4: backfill all configured source roots (dry-run preview first)
```

And in the `## Pipeline` table add a row:

```markdown
| 4 | `phases/4-import.md` | record project docs into the wiki (single + --all backfill) |
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/agent-all/lib/wiki-import-phase-contract.test.mjs`
Expected: PASS (2 tests for now; more added in later tasks).

- [ ] **Step 6: Commit**

```bash
git add -- plugins/harness-floor/skills/wiki/phases/4-import.md plugins/harness-floor/skills/wiki/SKILL.md tests/agent-all/lib/wiki-import-phase-contract.test.mjs
git commit -m "feat(wiki): /wiki import phase — cheap-scribe synthesis with no-copy guardrail"
git show --stat HEAD
```

---

## Task 3: `wiki.sources` / `wiki.exclude` / `wiki.maxImportUSD` config

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs` (DEFAULTS `wiki` block ~line 20; validation ~line 117)
- Test: `tests/agent-all/lib/config-loader-wiki-sources.test.mjs`

**Interfaces:**
- Produces: `config.wiki.sources: string[]`, `config.wiki.exclude: string[]`, `config.wiki.maxImportUSD: number` with defaults; validation errors on wrong types.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-all/lib/config-loader-wiki-sources.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

function cfg(obj) {
  const dir = mkdtempSync(join(tmpdir(), "cl-"));
  const p = join(dir, ".agent-all.json");
  writeFileSync(p, JSON.stringify(obj));
  return loadConfig(p);
}

test("wiki defaults include sources, exclude, maxImportUSD", () => {
  const { ok, config } = cfg({});
  assert.equal(ok, true);
  assert.ok(Array.isArray(config.wiki.sources) && config.wiki.sources.includes("docs/superpowers/specs"));
  assert.ok(Array.isArray(config.wiki.exclude) && config.wiki.exclude.some((g) => /process-archive/.test(g)));
  assert.equal(typeof config.wiki.maxImportUSD, "number");
});

test("custom wiki.sources is accepted", () => {
  const { ok, config } = cfg({ wiki: { sources: ["docs/tasks", "docs/design"] } });
  assert.equal(ok, true);
  assert.deepEqual(config.wiki.sources, ["docs/tasks", "docs/design"]);
});

test("wiki.sources must be an array of strings", () => {
  const { ok, errors } = cfg({ wiki: { sources: "docs" } });
  assert.equal(ok, false);
  assert.ok(errors.some((e) => e.path === "wiki.sources"));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-all/lib/config-loader-wiki-sources.test.mjs`
Expected: FAIL (defaults lack `sources`; no validation).

- [ ] **Step 3: Extend DEFAULTS and validation**

In `config-loader.mjs`, replace the `wiki` default (line ~20 `wiki: { auto: true, model: "haiku" },`) with:

```javascript
  wiki: {
    auto: true, model: "haiku",
    sources: ["docs/superpowers/specs", "docs/superpowers/plans", ".agent-skill/tasks"],
    exclude: ["**/process-archive/**", "**/raw/**", "**/artifacts/**", "**/*-shots/**", "**/meeting-*/**"],
    maxImportUSD: 2.0,
  },
```

After the existing `wiki.model` validation (line ~120), add:

```javascript
  if (cfg.wiki?.sources !== undefined && (!Array.isArray(cfg.wiki.sources) || cfg.wiki.sources.some((s) => typeof s !== "string"))) {
    errors.push({ path: "wiki.sources", message: "must be an array of strings" });
  }
  if (cfg.wiki?.exclude !== undefined && (!Array.isArray(cfg.wiki.exclude) || cfg.wiki.exclude.some((s) => typeof s !== "string"))) {
    errors.push({ path: "wiki.exclude", message: "must be an array of strings" });
  }
  if (cfg.wiki?.maxImportUSD !== undefined && typeof cfg.wiki.maxImportUSD !== "number") {
    errors.push({ path: "wiki.maxImportUSD", message: "must be a number" });
  }
```

Ensure the loader deep-merges `wiki` so partial overrides keep the array defaults (mirror how the loader already merges nested defaults; if it shallow-assigns `wiki`, merge `sources`/`exclude`/`maxImportUSD` from DEFAULTS when absent).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/agent-all/lib/config-loader-wiki-sources.test.mjs`
Expected: PASS (3 tests). Then `node --test tests/agent-all/lib/config-loader.test.mjs` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add -- plugins/harness-floor/skills/agent-all/lib/config-loader.mjs tests/agent-all/lib/config-loader-wiki-sources.test.mjs
git commit -m "feat(wiki): config wiki.sources/exclude/maxImportUSD"
git show --stat HEAD
```

---

## Task 4: `/wiki import --all` backfill — `planBackfill` + dry-run/cost/apply

**Files:**
- Modify: `plugins/harness-floor/skills/wiki/lib/wiki-import.mjs` (add `planBackfill`)
- Modify: `plugins/harness-floor/skills/wiki/phases/4-import.md` (add `### Backfill`)
- Test: `tests/agent-all/lib/wiki-backfill.test.mjs` (+ extend the phase-contract test)

**Interfaces:**
- Consumes: `deriveTopic` (Task 1), `config.wiki.{sources,exclude,maxImportUSD}` (Task 3).
- Produces: `planBackfill(files, { exclude, dates }) → { ordered: {path,slug,type,date}[], topics: string[], excludedCount }` — pure planner (no LLM, no writes) for the dry-run preview and the apply order.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-all/lib/wiki-backfill.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { planBackfill } from "../../../plugins/harness-floor/skills/wiki/lib/wiki-import.mjs";

const files = [
  "docs/superpowers/specs/2026-06-23-auth-design.md",
  "docs/superpowers/plans/2026-06-20-auth.md",
  "docs/tasks/meeting-0614/notes.md",
  "docs/superpowers/specs/2026-06-10-billing-design.md",
];

test("planBackfill excludes matched globs and collapses to topics", () => {
  const r = planBackfill(files, { exclude: ["**/meeting-*/**"] });
  assert.equal(r.excludedCount, 1, "meeting note excluded");
  assert.deepEqual([...new Set(r.topics)].sort(), ["auth", "billing"], "auth spec+plan collapse to one topic");
  assert.equal(r.ordered.length, 3);
});

test("planBackfill orders oldest-first by date prefix", () => {
  const r = planBackfill(files, { exclude: ["**/meeting-*/**"] });
  const dates = r.ordered.map((x) => x.date);
  assert.deepEqual(dates, [...dates].sort(), "ascending date order");
  assert.equal(r.ordered[0].path, "docs/superpowers/specs/2026-06-10-billing-design.md");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-all/lib/wiki-backfill.test.mjs`
Expected: FAIL (`planBackfill` not exported).

- [ ] **Step 3: Add `planBackfill` to the engine**

Append to `plugins/harness-floor/skills/wiki/lib/wiki-import.mjs`:

```javascript
// Minimal glob match: supports ** and * segments; anchored anywhere in the path.
function globToRe(glob) {
  const re = glob.split("/").map((seg) =>
    seg === "**" ? ".*" : seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")
  ).join("/").replace(/\.\*\//g, "(?:.*/)?");
  return new RegExp(re);
}

function dateOf(path) { return (/(\d{4}-\d{2}-\d{2})/.exec(path)?.[1]) || "0000-00-00"; }

// Pure planner for the backfill dry-run + apply order. No LLM, no writes.
export function planBackfill(files, { exclude = [] } = {}) {
  const excludeRes = exclude.map(globToRe);
  const kept = [];
  let excludedCount = 0;
  for (const f of files) {
    if (excludeRes.some((re) => re.test(f))) { excludedCount++; continue; }
    const { slug, type } = deriveTopic(f);
    kept.push({ path: f, slug, type, date: dateOf(f) });
  }
  kept.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { ordered: kept, topics: kept.map((k) => k.slug), excludedCount };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/agent-all/lib/wiki-backfill.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Document the `--all` backfill flow in the phase**

In `plugins/harness-floor/skills/wiki/phases/4-import.md`, replace the `## --all backfill` stub with:

```markdown
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
```

- [ ] **Step 6: Extend the phase-contract test**

Append to `tests/agent-all/lib/wiki-import-phase-contract.test.mjs`:

```javascript
test("Phase 4 backfill is dry-run-first, configurable, cost-capped", () => {
  const body = read("phases/4-import.md");
  assert.match(body, /planBackfill/, "uses the pure planner");
  assert.match(body, /config\.wiki\.sources/, "reads configurable source roots");
  assert.match(body, /interactiv|multi-select|agent-interaction/i, "first-run interactive root selection");
  assert.match(body, /dry-run[\s\S]{0,200}(DEFAULT|no writes|NO writes)/i, "dry-run preview is the default");
  assert.match(body, /--apply/, "explicit apply gate");
  assert.match(body, /maxImportUSD/, "cost cap");
});
```

- [ ] **Step 7: Run both tests to verify they pass**

Run: `node --test tests/agent-all/lib/wiki-backfill.test.mjs tests/agent-all/lib/wiki-import-phase-contract.test.mjs`
Expected: PASS (2 + 3 tests).

- [ ] **Step 8: Commit**

```bash
git add -- plugins/harness-floor/skills/wiki/lib/wiki-import.mjs plugins/harness-floor/skills/wiki/phases/4-import.md tests/agent-all/lib/wiki-backfill.test.mjs tests/agent-all/lib/wiki-import-phase-contract.test.mjs
git commit -m "feat(wiki): --all backfill — planBackfill + dry-run preview + cost cap + interactive roots"
git show --stat HEAD
```

---

## Task 5: `wiki-capture.mjs` advisory PostToolUse hook

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/templates/hooks/wiki-capture.mjs`
- Modify: `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs` (PostToolUse `Write|Edit`)
- Modify (regenerate): `tests/lib/__snapshots__/settings.local.json.hbs__*.snap`
- Test: `tests/agent-init/wiki-capture-hook.test.mjs`

**Interfaces:**
- Consumes: hook payload `{tool_name, tool_input:{file_path}}`; `.agent-all.json` `wiki.sources`/`wiki.exclude`; `.agent-all-state.json` `status`.
- Produces: a non-blocking advisory on stdout nudging `/wiki import <path>`; silent otherwise.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-init/wiki-capture-hook.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/wiki-capture.mjs";

function runHook(payload, dir) {
  try {
    const out = execFileSync("node", [HOOK], { input: JSON.stringify(payload), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, stdout: out.toString() };
  } catch (e) { return { code: e.status, stdout: (e.stdout || "").toString() }; }
}
function project({ config, state } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  if (config) writeFileSync(join(dir, ".agent-all.json"), JSON.stringify(config));
  if (state) writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify(state));
  return dir;
}
const ev = (fp) => ({ tool_name: "Write", tool_input: { file_path: fp } });

test("nudges /wiki import when a configured source doc is written", () => {
  const dir = project();
  const { stdout } = runHook(ev(join(dir, "docs/superpowers/specs/x-design.md")), dir);
  assert.match(stdout, /\/wiki import/);
  assert.match(stdout, /x-design\.md/);
});

test("silent for a non-source path", () => {
  const dir = project();
  const { stdout } = runHook(ev(join(dir, "src/app.ts")), dir);
  assert.equal(stdout.trim(), "");
});

test("silent for an excluded glob", () => {
  const dir = project();
  const { stdout } = runHook(ev(join(dir, "docs/superpowers/specs/raw/dump.md")), dir);
  assert.equal(stdout.trim(), "");
});

test("suppressed while an agent-all run is active", () => {
  const dir = project({ state: { status: "running" } });
  const { stdout } = runHook(ev(join(dir, "docs/superpowers/specs/x-design.md")), dir);
  assert.equal(stdout.trim(), "");
});

test("non-fatal on malformed config", () => {
  const dir = mkdtempSync(join(tmpdir(), "wc-"));
  writeFileSync(join(dir, ".agent-all.json"), "{ not json");
  const { code } = runHook(ev(join(dir, "docs/superpowers/specs/x-design.md")), dir);
  assert.equal(code, 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-init/wiki-capture-hook.test.mjs`
Expected: FAIL (hook does not exist).

- [ ] **Step 3: Write the hook**

Create `plugins/harness-builder/skills/agent-init/templates/hooks/wiki-capture.mjs`:

```javascript
#!/usr/bin/env node
// PostToolUse Write|Edit hook (project-scoped). Advisory: when a project doc under a configured
// wiki source root is written, nudge the orchestrator to record it in the wiki via /wiki import.
// Suppressed during an agent-all run (it records to the wiki itself). Non-fatal, never blocks.
import { readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

const HOOK_NAME = "wiki-capture";
const DEFAULT_SOURCES = ["docs/superpowers/specs", "docs/superpowers/plans", ".agent-skill/tasks"];
const DEFAULT_EXCLUDE = ["**/process-archive/**", "**/raw/**", "**/artifacts/**", "**/*-shots/**", "**/meeting-*/**"];

function warn(action, err) {
  const msg = (err && err.message ? String(err.message) : String(err)).split(/\r?\n/, 1)[0].slice(0, 200);
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${msg}`);
}
function globToRe(g) {
  const re = g.split("/").map((s) => s === "**" ? ".*" : s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")).join("/").replace(/\.\*\//g, "(?:.*/)?");
  return new RegExp(re);
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf-8") || "{}"); } catch { process.exit(0); }

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const fp = payload?.tool_input?.file_path;
if (!fp || !/\.md$/i.test(fp)) process.exit(0);

try {
  // Suppress during an agent-all run.
  try {
    const st = JSON.parse(readFileSync(resolve(cwd, ".agent-all-state.json"), "utf-8"));
    if (st && st.status === "running") process.exit(0);
  } catch { /* no state → not running */ }

  let sources = DEFAULT_SOURCES, exclude = DEFAULT_EXCLUDE;
  try {
    const cfg = JSON.parse(readFileSync(resolve(cwd, ".agent-all.json"), "utf-8"));
    if (Array.isArray(cfg?.wiki?.sources) && cfg.wiki.sources.length) sources = cfg.wiki.sources;
    if (Array.isArray(cfg?.wiki?.exclude)) exclude = cfg.wiki.exclude;
  } catch { /* use defaults */ }

  const rel = isAbsolute(fp) ? relative(cwd, fp) : fp;
  if (rel.startsWith("..")) process.exit(0);
  const underSource = sources.some((s) => rel === s || rel.startsWith(s.replace(/\/?$/, "/")));
  if (!underSource) process.exit(0);
  if (exclude.map(globToRe).some((re) => re.test(rel))) process.exit(0);

  process.stdout.write(`agent-skill: recorded a project doc at ${rel}. Record it in the wiki (reference, not copy): run \`/wiki import ${rel}\` when convenient.\n`);
} catch (err) { warn("evaluate capture", err); }
process.exit(0);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/agent-init/wiki-capture-hook.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Register the hook in settings**

In `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs`, add a `PostToolUse` matcher for `Write|Edit` (the existing `PostToolUse` array has a `Task` matcher under `operationalProfile`). Add this entry to the `PostToolUse` array (ungated — advisory is harmless everywhere):

```hbs
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/wiki-capture.mjs\"" }
        ]
      }
```

Note: if `PostToolUse` currently only exists inside the `{{#if operationalProfile}}` block, lift a base `PostToolUse` array so the `Write|Edit` entry is present in all profiles, keeping the existing `Task` entry gated as-is. Keep valid JSON/Handlebars.

- [ ] **Step 6: Regenerate snapshots and confirm**

```bash
UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs
node --test tests/lib/render.test.mjs
```
Expected: second run PASS; updated `tests/lib/__snapshots__/settings.local.json.hbs__*.snap`.

- [ ] **Step 7: Commit**

```bash
git add -- plugins/harness-builder/skills/agent-init/templates/hooks/wiki-capture.mjs plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs tests/agent-init/wiki-capture-hook.test.mjs tests/lib/__snapshots__/
git commit -m "feat(agent-init): wiki-capture advisory hook (standalone doc → /wiki import nudge)"
git show --stat HEAD
```

---

## Task 6: agent-all Phase 2 — add `spec:` source

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/phases/2-plan.md` (the wiki plan-capture `writePage` sources)
- Test: extend `tests/agent-all/lib/wiki-import-phase-contract.test.mjs`

**Interfaces:**
- Consumes: the existing Phase 2 wiki block; `state.specPath`/the Phase 1 brainstorming output path.
- Produces: Phase 2's `writePage` `sources` includes `spec: <path>` when a spec exists.

- [ ] **Step 1: Write the failing contract assertion**

Append to `tests/agent-all/lib/wiki-import-phase-contract.test.mjs`:

```javascript
test("agent-all Phase 2 records the spec as a wiki source", () => {
  const body = readFileSync(resolve("plugins/harness-floor/skills/agent-all/phases/2-plan.md"), "utf-8");
  assert.match(body, /sources:[\s\S]{0,200}spec:/i, "Phase 2 writePage sources include spec:");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/agent-all/lib/wiki-import-phase-contract.test.mjs`
Expected: FAIL (Phase 2 sources currently list only `task:` and `plan:`).

- [ ] **Step 3: Edit Phase 2's wiki sources**

In `plugins/harness-floor/skills/agent-all/phases/2-plan.md`, the `writePage` call's `sources` line currently reads:

```javascript
       sources: [`task: ${task.path}`, `plan: ${plan.path}`],
```

Change it to include the spec when Phase 1 produced one (`state.specPath`, set by Phase 1 brainstorming; omit the entry when absent):

```javascript
       sources: [`task: ${task.path}`, `plan: ${plan.path}`, ...(state.specPath ? [`spec: ${state.specPath}`] : [])],
```

Add a one-line note after the block: "Phase 1 records the brainstorming spec path as `state.specPath`; Phase 2 links it here so the wiki page points at the design, not just the plan."

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/agent-all/lib/wiki-import-phase-contract.test.mjs`
Expected: PASS (all assertions).

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: all PASS, 0 fail (new tests + regenerated snapshots; no regressions). Also `node scripts/sync-lib.mjs --check` → OK.

- [ ] **Step 6: Commit**

```bash
git add -- plugins/harness-floor/skills/agent-all/phases/2-plan.md tests/agent-all/lib/wiki-import-phase-contract.test.mjs
git commit -m "feat(agent-all): Phase 2 records the brainstorming spec as a wiki source"
git show --stat HEAD
```

---

## After all tasks

- **Live verification (DoD) on posco-mds:** run `/wiki import --all` → first-run interactive root selection over its real `docs/` tree → config persisted to `.agent-all.json` → dry-run preview shows the ~931 docs collapsing to a sane topic count + a cost estimate → `--apply` a curated subset → verify (a) topic-merge collapsed related docs into shared pages, (b) pages reference (link) the source, not copy it, (c) re-run is idempotent. Then write a standalone spec and confirm `wiki-capture.mjs` nudges `/wiki import`.
- **Release (separate, gated):** version bump + the full version-bump-tax + a RELEASE CHECKLIST note that operational installs must re-run `/agent-init` for the new `wiki-capture` PostToolUse hook. Only after live verification and explicit user go-ahead.

## Notes for the implementer

- `wiki-log.mjs` is vendored (Task 1 adds the `wiki/lib` dest). After ANY change to the source `agent-all/lib/wiki-log.mjs`, re-run `node scripts/sync-lib.mjs`; `sync-lib --check` is in the suite and will fail on drift (this is the trap that cascades into provenance/checksum tests — see the prior release saga).
- Phase-contract tests assert the markdown *describes* the wiring (the orchestrator is the runtime). Verify the RED in each doc task's Step 2 — never skip it.
- `deriveTopic`'s filename normalization (not H1) is deliberate: a feature's spec H1 and plan H1 differ, so only the normalized filename collapses them to one slug. Don't "improve" it to prefer the H1 for the slug.
- The Codex `wiki-codex` port of `/wiki import` is out of scope for this plan (Claude-first, like the compaction hooks); note it for a follow-up.
