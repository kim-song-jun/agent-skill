// wiki-log.mjs — the agent-all ↔ wiki auto-loop helper.
//
// agent-all consults and grows a project wiki in `.wiki/` as it works: Phase 1
// reads relevant pages into planning, Phase 2 records the plan, Phase 5 records
// the outcome. This module provides the MECHANICAL operations (create the wiki,
// topic-merge route, write a page file, upsert the index row, run the compile
// audit). The page CONTENT (BLUF / Details / Contradictions prose) is authored
// by the orchestrating LLM following the phase docs and passed in here.
//
// Install-safety (spec C1): this imports the LOCAL vendored `./wiki-index.mjs`,
// never the `/wiki` skill's copy — on Codex, agent-all and wiki install to
// different dirs, so a cross-skill import would be the v0.7.2 ERR_MODULE_NOT_FOUND
// class. sync-lib keeps a verbatim wiki-index.mjs copy beside this file.
//
// Non-fatal (spec C2): every export returns { ok, ... } and NEVER throws, so a
// wiki step can never fail the agent-all run.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  INDEX_FILENAME,
  WIKI_DIR_DEFAULT,
  parseIndex,
  routePhaseA,
  compileSelfAudit,
} from "./wiki-index.mjs";

const VALID_GRADES = new Set(["A", "B", "C"]);

export function slugify(title) {
  return (
    String(title ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled"
  );
}

function indexRow(e) {
  const tags = Array.isArray(e.tags) ? e.tags.join(", ") : e.tags ?? "";
  return `| [${e.title}](${e.file}) | ${e.slug} | ${e.grade} | ${tags} |`;
}

function rebuildIndex(entries) {
  return [
    "# Wiki Index",
    "",
    "<!-- Attribution: Karpathy LLM-Wiki pattern (MIT) — adapted for CC native -->",
    "<!-- Auto-managed by /agent-all (wiki.auto) and /wiki. -->",
    "",
    "| Page | Slug | Grade | Tags |",
    "|------|------|-------|------|",
    ...entries.map(indexRow),
    "",
  ].join("\n");
}

// Ensure `.wiki/` + INDEX.md exist. Returns { ok, created, wikiDir }.
// `created` is true ONLY when this call actually created the dir or index (so a
// caller can print the one-time "started a project wiki" notice exactly once).
export function ensureWiki(wikiDir = WIKI_DIR_DEFAULT) {
  try {
    const dir = resolve(wikiDir);
    const indexPath = join(dir, INDEX_FILENAME);
    let created = false;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created = true;
    }
    if (!existsSync(indexPath)) {
      writeFileSync(indexPath, rebuildIndex([]));
      created = true;
    }
    return { ok: true, created, wikiDir: dir };
  } catch (e) {
    return { ok: false, created: false, error: e.message };
  }
}

// Topic-merge (spec D3): route the topic through the index; a hit returns the
// existing page (so the same topic accretes into ONE page), a miss returns a
// fresh slug to create. Returns { ok, slug, file, existed, grade?, title? }.
export function findOrCreatePage(wikiDir, topic) {
  try {
    const dir = resolve(wikiDir);
    const { entries } = parseIndex(dir);
    const routed = routePhaseA(String(topic ?? ""), entries);
    if (routed.match) {
      const m = routed.match;
      return { ok: true, slug: m.slug, file: m.file, existed: true, grade: m.grade, title: m.title };
    }
    const slug = slugify(topic);
    return { ok: true, slug, file: `${slug}.md`, existed: false };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Read an existing page's raw markdown so the LLM can merge into it (add an
// outcome, append a Contradiction) before calling writePage. { ok, found, content }.
export function readPage(wikiDir, slug) {
  try {
    const file = join(resolve(wikiDir), `${slugify(slug)}.md`);
    if (!existsSync(file)) return { ok: true, found: false, content: "" };
    return { ok: true, found: true, content: readFileSync(file, "utf-8") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Write (create or overwrite) a page file from LLM-authored content, then upsert
// its INDEX.md row (topic-merge: replace the row if the slug exists, else append).
// page = { title, slug, grade, tags[], bluf, details, contradictions?, related[], sources[] }.
// Returns { ok, file, slug, indexed }.
export function writePage(wikiDir, page) {
  try {
    const dir = resolve(wikiDir);
    const ensured = ensureWiki(dir);
    if (!ensured.ok) return ensured;

    const slug = slugify(page.slug ?? page.title);
    const file = `${slug}.md`;
    const grade = VALID_GRADES.has(page.grade) ? page.grade : "C";
    const tags = Array.isArray(page.tags) ? page.tags : [];
    const sources = Array.isArray(page.sources) ? page.sources : [];
    const related = Array.isArray(page.related) ? page.related : [];
    const updated = page.updated ?? "unknown";

    const body = [
      "---",
      `title: ${page.title ?? slug}`,
      `slug: ${slug}`,
      `grade: ${grade}`,
      `tags: [${tags.join(", ")}]`,
      `updated: ${updated}`,
      "---",
      "",
      `# ${page.title ?? slug}`,
      "",
      `**BLUF:** ${page.bluf ?? ""}`,
      "",
      "## Details",
      "",
      `${page.details ?? ""}`,
      "",
      "## Provenance",
      "",
      `Grade: ${grade}`,
      "- A = primary source (official docs, spec, source code)",
      "- B = secondary source",
      "- C = inferred / synthesised",
      "",
      "Sources:",
      ...(sources.length ? sources.map((s) => `- ${s}`) : ["- (none)"]),
      "",
      "## Contradictions",
      "",
      "<!-- Record conflicts here rather than silently resolving them. -->",
      `${page.contradictions ?? ""}`,
      "",
      "## Related",
      "",
      ...(related.length ? related.map((r) => `- [${r.title}](${r.file})${r.note ? ` — ${r.note}` : ""}`) : ["- (none)"]),
      "",
    ].join("\n");

    writeFileSync(join(dir, file), body);

    // Upsert the index row (rebuild deterministically to avoid fragile splicing).
    const { entries } = parseIndex(dir);
    const next = entries.filter((e) => e.slug !== slug);
    next.push({ title: page.title ?? slug, file, slug, grade, tags });
    writeFileSync(join(dir, INDEX_FILENAME), rebuildIndex(next));

    return { ok: true, file: join(dir, file), slug, indexed: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Run the compile self-audit (diff=0 gate). Non-fatal: returns the audit result
// so the caller can warn-and-continue. { ok, audit }.
export function compile(wikiDir = WIKI_DIR_DEFAULT) {
  try {
    return { ok: true, audit: compileSelfAudit(resolve(wikiDir)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
