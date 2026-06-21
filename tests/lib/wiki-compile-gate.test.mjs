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
import { dirname } from "node:path";
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
