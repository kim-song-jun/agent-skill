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
  const existed = !!(existing.ok && existing.found && /^grade:/m.test(existing.content));
  return { ok: res.ok, slug, existed, sources, error: res.error };
}
