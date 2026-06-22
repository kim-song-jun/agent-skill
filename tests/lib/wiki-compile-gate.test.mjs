// wiki-compile-gate.test.mjs — Real compile self-audit gate tests.
//
// Verifies that compileSelfAudit() correctly enforces the diff=0 gate
// against real fixture wiki directories in tests/fixtures/wiki/.
//
// The LLM-Wiki pattern (Karpathy, MIT) requires that every index entry
// has a corresponding page file and every page file is listed in the index.
// These tests use real on-disk fixtures — not mocks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  compileSelfAudit,
  parseIndex,
  parseIndexRaw,
  routePhaseA,
  appendIndexEntry,
} from "../../plugins/harness-floor/skills/wiki/lib/wiki-index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, "../fixtures/wiki");

test("wiki compile gate passes for a consistent wiki (diff=0)", () => {
  const wikiDir = resolve(fixtureDir, "complete");
  const result = compileSelfAudit(wikiDir);

  assert.equal(result.ok, true, `compile gate must pass for complete fixture; got indexOnly=${JSON.stringify(result.indexOnly)} pagesOnly=${JSON.stringify(result.pagesOnly)}`);
  assert.deepEqual(result.indexOnly, []);
  assert.deepEqual(result.pagesOnly, []);
  assert.equal(result.entryCount, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.matched.length, 2);
});

test("wiki compile gate fails when index entry has no matching page on disk", () => {
  // The missing-page fixture has INDEX.md referencing missing.md which does not exist
  const wikiDir = resolve(fixtureDir, "missing-page");
  const result = compileSelfAudit(wikiDir);

  assert.equal(result.ok, false, "compile gate must fail when index declares a non-existent page");
  assert.ok(result.indexOnly.includes("missing.md"), `indexOnly must contain missing.md; got ${JSON.stringify(result.indexOnly)}`);
  assert.deepEqual(result.pagesOnly, [], "pagesOnly must be empty — no unindexed pages in this fixture");
});

test("wiki compile gate fails when a page on disk is not listed in the index", () => {
  // The missing-index-entry fixture has orphan-page.md on disk but not in INDEX.md
  const wikiDir = resolve(fixtureDir, "missing-index-entry");
  const result = compileSelfAudit(wikiDir);

  assert.equal(result.ok, false, "compile gate must fail when a page on disk is not indexed");
  assert.deepEqual(result.indexOnly, [], "indexOnly must be empty — all index entries have pages");
  assert.ok(result.pagesOnly.includes("orphan-page.md"), `pagesOnly must contain orphan-page.md; got ${JSON.stringify(result.pagesOnly)}`);
});

// C5 guard (2026-06-22 adversarial round): a nonexistent or INDEX-less directory
// must NOT vacuously pass with diff=0 — that reports a wrong/typo'd wiki path as a
// clean compile and defeats the gate. A genuinely-empty-but-valid wiki still passes.
test("wiki compile gate FAILS on a nonexistent directory (no vacuous diff=0 pass)", () => {
  const result = compileSelfAudit("/tmp/agent-skill-wiki-does-not-exist-zzz-9999");
  assert.equal(result.ok, false, "compile must fail for a nonexistent wiki directory");
  assert.equal(result.missing, "directory", "result must flag the missing directory");
});

test("wiki compile gate FAILS on a directory with no INDEX.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-guard-no-index-"));
  try {
    const result = compileSelfAudit(dir);
    assert.equal(result.ok, false, "compile must fail for a directory without INDEX.md");
    assert.equal(result.missing, "INDEX.md", "result must flag the missing INDEX.md");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wiki compile gate PASSES for a valid but empty wiki (INDEX.md present, zero rows)", () => {
  // Distinguishes 'empty valid wiki' (legitimate, diff=0) from 'path not found'.
  const result = compileSelfAudit(resolve(fixtureDir, "empty-valid"));
  assert.equal(result.ok, true, `valid empty wiki must pass; got ${JSON.stringify(result)}`);
  assert.equal(result.missing, undefined, "a valid empty wiki must not be flagged as missing anything");
  assert.equal(result.entryCount, 0);
  assert.equal(result.pageCount, 0);
});

// E residual (2026-06-22 adversarial round): a row that declares a real
// [Title](file.md) page but fails grade/slug validation was silently dropped by
// parseIndex, hiding the declared (missing-on-disk) page and re-opening the
// vacuous diff=0 pass. The malformed row must now FAIL the gate.
test("wiki compile gate FAILS on a malformed declared-page row (invalid grade), not a vacuous pass", () => {
  const result = compileSelfAudit(resolve(fixtureDir, "malformed-row"));
  assert.equal(result.ok, false, "a malformed declared-page row must fail the compile gate, not pass diff=0");
  assert.equal(result.malformed.length, 1, `exactly one malformed row expected; got ${JSON.stringify(result.malformed)}`);
  assert.equal(result.malformed[0].file, "ghost-page.md", "the malformed row's declared page file must be surfaced");
});

test("wiki parseIndex separates valid entries from malformed declared-page rows", () => {
  const raw = [
    "| Page | Slug | Grade | Tags |",
    "|---|---|---|---|",
    "| [Good](good.md) | good | A | t |",
    "| [Bad](bad.md) | bad | X | t |",
  ].join("\n");
  const entries = parseIndexRaw(raw);
  assert.equal(entries.length, 1, "only the well-formed row is a valid entry");
  assert.equal(entries[0].file, "good.md");
});

test("wiki compile gate FAILS cleanly when INDEX.md is a directory (no EISDIR crash)", () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-guard-eisdir-"));
  try {
    mkdirSync(join(dir, "INDEX.md"));
    const result = compileSelfAudit(dir); // must not throw
    assert.equal(result.ok, false, "INDEX.md as a directory must fail, not crash");
    assert.equal(result.missing, "INDEX.md", "non-regular-file INDEX.md must be flagged missing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Round-2 re-verification residual: a row that LOOKS like a page declaration but
// whose markdown link does not strictly parse (`[Paren](file(1).md)`, `[Empty]()`,
// or a bare `page.md`) was dropped BEFORE the malformed[] collection, leaking the
// same silent-drop vacuous diff=0 pass. Such rows must now fail the gate.
test("wiki compile gate FAILS on a link-malformed declared-page row (no silent-drop vacuous pass)", () => {
  for (const row of [
    "| [Paren](file(1).md) | parenfile | A | t |",
    "| [Empty]() | emptylink | A | t |",
    "| bare-page.md | bareslug | A | t |",
    // <3-column page-declaring rows: dropped by the `cols.length < 3` guard
    // BEFORE the page-decl detection until the round-3.1 hoist (re-verified leak).
    "| [Short](short.md) |",
    "| [Two](two.md) | onlytwo |",
    // Page link / *.md in a NON-FIRST column (drifted/hand-edited row): caught
    // only after looksLikePageDecl scans EVERY cell (round-3.2 re-verified leak).
    "| Plain Title | [Ghost](ghost.md) | A | t |",
    "| Plain | ghost.md | A | t |",
  ]) {
    const dir = mkdtempSync(join(tmpdir(), "wiki-linkmal-"));
    try {
      writeFileSync(
        join(dir, "INDEX.md"),
        `# Wiki Index\n\n| Page | Slug | Grade | Tags |\n|---|---|---|---|\n${row}\n`,
      );
      const r = compileSelfAudit(dir);
      assert.equal(r.ok, false, `link-malformed row "${row}" must fail the gate, not vacuously pass diff=0`);
      assert.equal(r.malformed.length, 1, `row "${row}" must be recorded malformed; got ${JSON.stringify(r.malformed)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("wiki compile gate IGNORES a plain non-page text row (not a false malformed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-plain-"));
  try {
    writeFileSync(
      join(dir, "INDEX.md"),
      `# Wiki Index\n\n| Page | Slug | Grade | Tags |\n|---|---|---|---|\n| just commentary | x | A | t |\n`,
    );
    const r = compileSelfAudit(dir);
    assert.equal(r.ok, true, "a plain text row (no link, no .md) must be ignored, not flagged malformed");
    assert.equal(r.malformed.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// cols.some scans every cell; guard against it false-flagging a VALID page row
// whose later cell merely mentions a .md filename — the col0 link parses, so the
// malformed branch is never reached and the row stays a valid entry.
test("wiki compile gate does NOT false-flag a valid page row that mentions .md in a later cell", () => {
  const dir = mkdtempSync(join(tmpdir(), "wiki-fp-"));
  try {
    writeFileSync(
      join(dir, "INDEX.md"),
      `# Wiki Index\n\n| Page | Slug | Grade | Tags |\n|---|---|---|---|\n| [Valid](valid.md) | valid | A | see other.md |\n`,
    );
    writeFileSync(join(dir, "valid.md"), "# Valid\n");
    const r = compileSelfAudit(dir);
    assert.equal(r.ok, true, `a valid col0 page row must pass even if a later cell mentions .md; got ${JSON.stringify(r)}`);
    assert.equal(r.malformed.length, 0);
    assert.equal(r.entryCount, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("wiki phase A routing finds exact slug match", () => {
  const wikiDir = resolve(fixtureDir, "complete");
  const { entries } = parseIndex(wikiDir);

  const result = routePhaseA("auth-flow", entries);
  assert.equal(result.phase, "A");
  assert.ok(result.match, "exact slug match must be found");
  assert.equal(result.match.slug, "auth-flow");
  assert.deepEqual(result.candidates, []);
});

test("wiki phase A routing returns no match for unknown query", () => {
  const wikiDir = resolve(fixtureDir, "complete");
  const { entries } = parseIndex(wikiDir);

  const result = routePhaseA("deployment-pipeline", entries);
  assert.equal(result.phase, "A");
  assert.equal(result.match, null);
  assert.deepEqual(result.candidates, []);
});

test("wiki phase A routing: title-substring single match returns match with no candidates", () => {
  // "Authentication Flow" title contains "authentication" — single title match branch
  const wikiDir = resolve(fixtureDir, "complete");
  const { entries } = parseIndex(wikiDir);

  const result = routePhaseA("authentication", entries);
  assert.equal(result.phase, "A");
  assert.ok(result.match, "title-substring single match must set match");
  assert.equal(result.match.slug, "auth-flow", "matched entry must be the auth-flow page");
  assert.deepEqual(result.candidates, [], "candidates must be empty for a single title match");
});

test("wiki phase A routing: multiple title matches returns null match with all candidates", () => {
  // Both "Authentication Flow" and "Database Schema" titles contain "a" — but we need a
  // substring that hits exactly two entries. Use the inline parseIndexRaw approach with
  // a custom entry list to reliably exercise the multi-match branch.
  const entries = [
    { title: "Auth Flow",     file: "auth-flow.md",  slug: "auth-flow",  grade: "A", tags: [] },
    { title: "Auth Config",   file: "auth-config.md", slug: "auth-config", grade: "B", tags: [] },
    { title: "Database Schema", file: "db-schema.md", slug: "db-schema", grade: "B", tags: ["database"] },
  ];

  const result = routePhaseA("auth", entries);
  assert.equal(result.phase, "A");
  assert.equal(result.match, null, "multiple title matches must return null match");
  assert.equal(result.candidates.length, 2, "candidates must contain all title-matching entries");
  const slugs = result.candidates.map((e) => e.slug).sort();
  assert.deepEqual(slugs, ["auth-config", "auth-flow"], "candidates must be the two auth-* entries");
});

test("wiki phase A routing: tag-only match returns null match with tag-matching candidates", () => {
  // "security" is a tag on auth-flow (not in title or slug)
  const wikiDir = resolve(fixtureDir, "complete");
  const { entries } = parseIndex(wikiDir);

  const result = routePhaseA("security", entries);
  assert.equal(result.phase, "A");
  assert.equal(result.match, null, "tag-only match must return null match");
  assert.ok(result.candidates.length > 0, "tag-only match must populate candidates");
  const slugs = result.candidates.map((e) => e.slug);
  assert.ok(slugs.includes("auth-flow"), "auth-flow must be in tag-match candidates (has 'security' tag)");
});

test("wiki appendIndexEntry produces valid parseable INDEX.md from empty", () => {
  const entry = {
    title: "New Page",
    file: "new-page.md",
    slug: "new-page",
    grade: "C",
    tags: ["test"],
  };

  const raw = appendIndexEntry("", entry);

  assert.match(raw, /Wiki Index/);
  assert.match(raw, /Karpathy LLM-Wiki/);
  assert.match(raw, /\[New Page\]\(new-page\.md\)/);

  const entries = parseIndexRaw(raw);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].slug, "new-page");
  assert.equal(entries[0].grade, "C");
  assert.deepEqual(entries[0].tags, ["test"]);
});
