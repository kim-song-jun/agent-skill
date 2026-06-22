// Real-behavior tests for wiki-log.mjs — the agent-all↔wiki auto-loop helper.
// Exercises the actual file/index mechanics against tmp dirs; no mocks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureWiki,
  findOrCreatePage,
  writePage,
  readPage,
  compile,
  slugify,
} from "../../plugins/harness-floor/skills/agent-all/lib/wiki-log.mjs";

function tmpWiki() {
  return join(mkdtempSync(join(tmpdir(), "wiki-log-")), ".wiki");
}

test("ensureWiki creates .wiki/ + INDEX.md and reports created=true once (idempotent)", () => {
  const dir = tmpWiki();
  const first = ensureWiki(dir);
  assert.equal(first.ok, true);
  assert.equal(first.created, true, "first call creates");
  assert.ok(existsSync(join(dir, "INDEX.md")), "INDEX.md exists");

  const second = ensureWiki(dir);
  assert.equal(second.ok, true);
  assert.equal(second.created, false, "second call is a no-op (created=false) so the notice prints once");
  rmSync(dir, { recursive: true, force: true });
});

test("findOrCreatePage: miss → existed=false with a derived slug", () => {
  const dir = tmpWiki();
  ensureWiki(dir);
  const r = findOrCreatePage(dir, "Google OAuth login");
  assert.equal(r.ok, true);
  assert.equal(r.existed, false);
  assert.equal(r.slug, "google-oauth-login");
  assert.equal(r.file, "google-oauth-login.md");
  rmSync(dir, { recursive: true, force: true });
});

test("writePage creates the page file + a single INDEX row; topic-merge re-route hits the same page", () => {
  const dir = tmpWiki();
  const w = writePage(dir, {
    title: "Auth Flow",
    grade: "C",
    tags: ["auth", "security"],
    bluf: "How login works.",
    details: "OAuth via Google.",
  });
  assert.equal(w.ok, true);
  assert.ok(existsSync(w.file), "page file written");
  const idx = readFileSync(join(dir, "INDEX.md"), "utf-8");
  assert.match(idx, /\| \[Auth Flow\]\(auth-flow\.md\) \| auth-flow \| C \|/, `index row present: ${idx}`);

  // Topic-merge (D3): routing the same topic must return the EXISTING page.
  const r = findOrCreatePage(dir, "Auth Flow");
  assert.equal(r.existed, true, "topic-merge: same topic resolves to the existing page");
  assert.equal(r.slug, "auth-flow");
  rmSync(dir, { recursive: true, force: true });
});

test("writePage upserts (re-writing the same slug updates the row, never duplicates)", () => {
  const dir = tmpWiki();
  writePage(dir, { title: "Auth Flow", grade: "C", tags: ["auth"], bluf: "v1", details: "plan" });
  const upd = writePage(dir, { title: "Auth Flow", grade: "B", tags: ["auth", "oauth"], bluf: "v2", details: "shipped" });
  assert.equal(upd.ok, true);
  const idx = readFileSync(join(dir, "INDEX.md"), "utf-8");
  const rows = idx.split("\n").filter((l) => l.includes("auth-flow |") || l.includes("auth-flow.md"));
  assert.equal(rows.length, 1, `exactly one index row for the slug (upsert, no dupe): ${idx}`);
  assert.match(idx, /auth-flow \| B \|/, "grade upgraded C→B in place");
  const page = readFileSync(join(dir, "auth-flow.md"), "utf-8");
  assert.match(page, /\*\*BLUF:\*\* v2/, "page content updated to v2");
  rmSync(dir, { recursive: true, force: true });
});

test("writePage clamps an invalid grade to C", () => {
  const dir = tmpWiki();
  const w = writePage(dir, { title: "X", grade: "Z", bluf: "b", details: "d" });
  assert.equal(w.ok, true);
  assert.match(readFileSync(w.file, "utf-8"), /grade: C/, "invalid grade falls back to C");
  rmSync(dir, { recursive: true, force: true });
});

test("readPage: found=false before write, found=true with content after", () => {
  const dir = tmpWiki();
  ensureWiki(dir);
  assert.equal(readPage(dir, "auth-flow").found, false);
  writePage(dir, { title: "Auth Flow", grade: "C", bluf: "b", details: "d" });
  const r = readPage(dir, "auth-flow");
  assert.equal(r.found, true);
  assert.match(r.content, /# Auth Flow/);
  rmSync(dir, { recursive: true, force: true });
});

test("compile re-export gates diff=0: clean wiki ok, orphaned index entry fails", () => {
  const dir = tmpWiki();
  writePage(dir, { title: "Auth Flow", grade: "C", bluf: "b", details: "d" });
  const clean = compile(dir);
  assert.equal(clean.ok, true);
  assert.equal(clean.audit.ok, true, "a consistent wiki compiles diff=0");

  // Inject an index-only entry (page not on disk) → compile must fail.
  const idxPath = join(dir, "INDEX.md");
  writeFileSync(idxPath, readFileSync(idxPath, "utf-8").replace(
    "|------|------|-------|------|",
    "|------|------|-------|------|\n| [Ghost](ghost.md) | ghost | C |  |",
  ));
  const drifted = compile(dir);
  assert.equal(drifted.ok, true, "compile itself does not throw");
  assert.equal(drifted.audit.ok, false, "index-only ghost page must fail the audit (non-vacuous)");
  rmSync(dir, { recursive: true, force: true });
});

test("every export is NON-THROWING on bad input (spec C2: a wiki step never fails the run)", () => {
  // Bad/empty/odd inputs must return { ok:... } objects, never throw.
  assert.doesNotThrow(() => ensureWiki(""));
  assert.doesNotThrow(() => findOrCreatePage("/nonexistent-xyz/.wiki", null));
  assert.doesNotThrow(() => readPage("/nonexistent-xyz/.wiki", undefined));
  assert.doesNotThrow(() => compile("/nonexistent-xyz/.wiki"));
  // writePage to an impossible path (a file as a parent dir) returns ok:false, not throw.
  const f = mkdtempSync(join(tmpdir(), "wiki-log-bad-"));
  const filePath = join(f, "afile");
  writeFileSync(filePath, "x");
  const r = writePage(join(filePath, ".wiki"), { title: "X", bluf: "b", details: "d" });
  assert.equal(r.ok, false, "writePage under a non-dir path returns ok:false (non-throwing)");
  rmSync(f, { recursive: true, force: true });
});

test("slugify is deterministic and strips punctuation", () => {
  assert.equal(slugify("Hello, World!"), "hello-world");
  assert.equal(slugify("  Multiple   Spaces  "), "multiple-spaces");
  assert.equal(slugify("***"), "untitled");
});
