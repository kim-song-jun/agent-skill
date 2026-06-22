// wiki-index.mjs — Index-as-Router core for the /wiki skill.
//
// Implements the Karpathy LLM-Wiki pattern:
//   • Index-as-Router: INDEX.md is the single source of truth for all pages.
//   • 2-Phase A/B routing: Phase A reads the index to discover existing pages;
//     Phase B writes or updates the matched (or new) page.
//   • Provenance grading: each entry carries a grade (A/B/C) reflecting
//     source fidelity (A=primary source, B=secondary, C=inferred/synthesised).
//   • Contradiction preservation: pages carry explicit contradiction blocks
//     rather than silently resolving conflicts.
//
// Attribution: Karpathy LLM-Wiki pattern (MIT licence) — adapted for
// Claude Code slash-command surface by the agent-skill harness.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const INDEX_FILENAME = "INDEX.md";
export const WIKI_DIR_DEFAULT = ".wiki";

// statSync that returns null instead of throwing (ENOENT, EACCES, …), so the
// compile guard can distinguish "absent / not a regular file" cleanly without an
// unhandled EISDIR/permission stack trace.
function statSafe(p) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

// IndexEntry shape:
//   { title: string, file: string, slug: string, grade: "A"|"B"|"C", tags: string[] }

/**
 * Parse the wiki INDEX.md into a list of entries.
 * Returns { entries: IndexEntry[], raw: string }
 */
export function parseIndex(wikiDir) {
  const indexPath = resolve(wikiDir, INDEX_FILENAME);
  if (!existsSync(indexPath)) {
    return { entries: [], raw: "", malformed: [] };
  }
  const raw = readFileSync(indexPath, "utf-8");
  const { entries, malformed } = parseIndexRows(raw);
  return { entries, raw, malformed };
}

/**
 * Parse the raw INDEX.md text into entries.
 * The table format is:
 *   | Page | Slug | Grade | Tags |
 *   |------|------|-------|------|
 *   | [Title](file.md) | slug | A | tag1, tag2 |
 */
export function parseIndexRaw(raw) {
  return parseIndexRows(raw).entries;
}

/**
 * Single-pass parser returning BOTH valid entries and MALFORMED declared-page
 * rows. A malformed row carries a real `[title](file)` page link but fails
 * slug/grade validation. Such rows were previously silently dropped, which hid a
 * declared (and possibly missing-on-disk) page from the compile gate and let a
 * malformed index vacuously pass diff=0 (2026-06-22 adversarial round).
 */
function parseIndexRows(raw) {
  const entries = [];
  const malformed = [];
  const lines = raw.split(/\r?\n/);
  let tableStarted = false;
  let separatorSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      // Reset table parse state when we leave a table
      if (tableStarted) {
        tableStarted = false;
        separatorSeen = false;
      }
      continue;
    }

    if (!tableStarted) {
      tableStarted = true;
      continue; // first row = header
    }

    if (!separatorSeen) {
      // Check if this is a separator row (all dashes/colons)
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        separatorSeen = true;
        continue;
      }
      // If not a separator, treat it as data (malformed table)
      separatorSeen = true;
    }

    // Data row: split on | and trim each cell
    const cols = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    // A first cell that is a markdown-link attempt (`](`) or a bare `*.md`
    // filename is a page DECLARATION. Detect it BEFORE the column-count and
    // strict-link guards so a malformed page row (too few columns, unparseable
    // link, or bad grade/slug) is recorded as malformed rather than silently
    // dropped — a silent drop hides the declared page and vacuously passes
    // diff=0 (e.g. `| [Short](short.md) |`, `[Paren](file(1).md)`, `[Empty]()`,
    // a bare `page.md`). A plain non-page text row is ignored as before.
    // Scan EVERY cell, not just the first: a page link or `*.md` filename in any
    // column (e.g. a drifted/hand-edited row `| Plain | [Ghost](ghost.md) | A |`)
    // still declares a page and must not silently pass when its file is absent.
    const firstCell = cols[0] ?? "";
    const looksLikePageDecl = cols.some((c) => /\]\(/.test(c) || /[^\s|]+\.md\b/i.test(c));

    if (cols.length < 3) {
      if (looksLikePageDecl) {
        malformed.push({ title: firstCell, file: null, slug: cols[1] ?? null, grade: cols[2] ?? null });
      }
      continue;
    }

    const titleLink = cols[0];
    const slug = cols[1];
    const grade = cols[2];
    const tags =
      cols[3]
        ? cols[3]
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    // Only rows with a real `[title](file)` link are valid page declarations.
    const linkMatch = titleLink.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!linkMatch) {
      if (looksLikePageDecl) {
        malformed.push({ title: titleLink, file: null, slug, grade });
      }
      continue;
    }
    const title = linkMatch[1];
    const file = linkMatch[2];

    if (!slug || !["A", "B", "C"].includes(grade)) {
      // Declares a page file but is malformed — record it, do NOT silently drop
      // (dropping would hide the declared page and vacuously pass the gate).
      malformed.push({ title, file, slug, grade });
      continue;
    }

    entries.push({ title, file, slug, grade, tags });
  }
  return { entries, malformed };
}

/**
 * Phase A: Route a query against the index.
 * Returns { match: IndexEntry|null, candidates: IndexEntry[], phase: "A" }
 */
export function routePhaseA(query, entries) {
  const q = query.toLowerCase().trim();

  // Exact slug match (highest priority)
  const exactSlug = entries.find((e) => e.slug.toLowerCase() === q);
  if (exactSlug) return { match: exactSlug, candidates: [], phase: "A" };

  // Title substring match
  const titleMatches = entries.filter((e) => e.title.toLowerCase().includes(q));
  if (titleMatches.length === 1) return { match: titleMatches[0], candidates: [], phase: "A" };
  if (titleMatches.length > 1) return { match: null, candidates: titleMatches, phase: "A" };

  // Tag match
  const tagMatches = entries.filter((e) => e.tags.some((t) => t.toLowerCase().includes(q)));
  if (tagMatches.length > 0) return { match: null, candidates: tagMatches, phase: "A" };

  return { match: null, candidates: [], phase: "A" };
}

/**
 * Compile self-audit: verify index <-> pages consistency.
 * Returns { ok: boolean, indexOnly: string[], pagesOnly: string[], matched: string[], ... }
 *
 * The "diff=0" gate: ok is true only when indexOnly and pagesOnly are both empty.
 *   indexOnly  — files declared in INDEX.md but not present on disk
 *   pagesOnly  — .md files on disk (excluding INDEX.md) not listed in INDEX.md
 */
export function compileSelfAudit(wikiDir) {
  const absDir = resolve(wikiDir);

  // Guard: a nonexistent directory, or a directory without an INDEX.md, is NOT a
  // valid empty wiki — it is a wrong/typo'd path. Reporting diff=0 there is a
  // vacuous pass that defeats the gate's purpose (2026-06-22 adversarial round
  // defect C5: `compile /tmp/nonexistent` printed "ok ... diff=0" exit 0). A
  // genuinely-empty-but-valid wiki (dir + INDEX.md present, zero page rows) still
  // passes the diff=0 check below.
  const dirStat = statSafe(absDir);
  if (!dirStat || !dirStat.isDirectory()) {
    return { ok: false, missing: "directory", indexOnly: [], pagesOnly: [], matched: [], malformed: [], entryCount: 0, pageCount: 0 };
  }
  // INDEX.md must be a readable regular file — not absent, and not itself a
  // directory (which would EISDIR-crash parseIndex's readFileSync).
  const indexStat = statSafe(resolve(absDir, INDEX_FILENAME));
  if (!indexStat || !indexStat.isFile()) {
    return { ok: false, missing: "INDEX.md", indexOnly: [], pagesOnly: [], matched: [], malformed: [], entryCount: 0, pageCount: 0 };
  }

  const { entries, malformed } = parseIndex(absDir);

  // Declared page files from index (just the filename, not full path)
  const indexFiles = new Set(entries.map((e) => e.file));

  // Actual .md files in wikiDir, excluding INDEX.md (absDir exists per guard above)
  const diskFiles = new Set(
    readdirSync(absDir).filter((f) => f.endsWith(".md") && f !== INDEX_FILENAME),
  );

  const indexOnly = [...indexFiles].filter((f) => !diskFiles.has(f));
  const pagesOnly = [...diskFiles].filter((f) => !indexFiles.has(f));
  const matched = [...indexFiles].filter((f) => diskFiles.has(f));

  return {
    ok: indexOnly.length === 0 && pagesOnly.length === 0 && malformed.length === 0,
    indexOnly,
    pagesOnly,
    matched,
    malformed,
    entryCount: entries.length,
    pageCount: diskFiles.size,
  };
}

/**
 * Format a single index row for INDEX.md.
 */
function formatIndexRow(entry) {
  const tags = (entry.tags || []).join(", ");
  return `| [${entry.title}](${entry.file}) | ${entry.slug} | ${entry.grade} | ${tags} |`;
}

/**
 * Append a new entry to INDEX.md (or create if missing).
 * Does NOT write a file — returns the updated raw string.
 */
export function appendIndexEntry(raw, entry) {
  const row = formatIndexRow(entry);
  if (!raw) {
    return [
      "# Wiki Index",
      "",
      "<!-- Attribution: Karpathy LLM-Wiki pattern (MIT) — adapted for CC native -->",
      "",
      "| Page | Slug | Grade | Tags |",
      "|------|------|-------|------|",
      row,
      "",
    ].join("\n");
  }

  // Append after the last table row
  const lines = raw.split("\n");
  let lastTableLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().startsWith("|")) {
      lastTableLine = i;
      break;
    }
  }
  if (lastTableLine === -1) {
    return `${raw}\n${row}\n`;
  }
  lines.splice(lastTableLine + 1, 0, row);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI entrypoint: node lib/wiki-index.mjs compile|status|list [dir] | route <query>
// Exit codes: 0 = ok/match, 1 = drift/no-match, 2 = usage error
// ---------------------------------------------------------------------------
function cliMain(argv) {
  const [cmd, dirArg] = argv;
  const wikiDir = dirArg || WIKI_DIR_DEFAULT; // ".wiki" default
  switch (cmd) {
    case "compile": {
      const r = compileSelfAudit(wikiDir);
      if (r.ok) {
        process.stdout.write(`wiki compile: ok (${r.entryCount} pages indexed, ${r.pageCount} on disk, diff=0)\n`);
        return 0;
      }
      process.stderr.write("wiki compile: FAILED\n");
      if (r.missing) process.stderr.write(`  Not a valid wiki at "${wikiDir}": missing ${r.missing}\n`);
      if (r.malformed?.length) process.stderr.write(`  Malformed index rows (declared page, unparseable link or invalid grade/slug): ${r.malformed.map((m) => m.file ?? m.title ?? "?").join(", ")}\n`);
      if (r.indexOnly.length) process.stderr.write(`  Index-only (not on disk):   ${r.indexOnly.join(", ")}\n`);
      if (r.pagesOnly.length) process.stderr.write(`  Pages-only (not indexed):   ${r.pagesOnly.join(", ")}\n`);
      return 1;
    }
    case "status": {
      const r = compileSelfAudit(wikiDir);
      const drift = r.indexOnly.length + r.pagesOnly.length;
      process.stdout.write(`wiki status: ${r.entryCount} indexed, ${r.pageCount} on disk, drift=${drift}\n`);
      return drift === 0 ? 0 : 1;
    }
    case "list": {
      const { entries } = parseIndex(wikiDir);
      for (const e of entries) process.stdout.write(`${e.slug}\t${e.grade}\t${e.title}\t(${e.file})\n`);
      return 0;
    }
    case "route": {
      const query = argv.slice(1).join(" ");
      if (!query) {
        process.stderr.write("usage: wiki-index.mjs route <query>\n");
        return 2;
      }
      const { entries } = parseIndex(WIKI_DIR_DEFAULT);
      const r = routePhaseA(query, entries);
      process.stdout.write(JSON.stringify(r) + "\n");
      return r.match ? 0 : 1;
    }
    default:
      process.stderr.write("usage: wiki-index.mjs compile|status|route|list [dir]\n");
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(cliMain(process.argv.slice(2)));
}
