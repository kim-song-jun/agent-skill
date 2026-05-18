// Unit tests for the git-diff scoper: framework auto-detect (Next App
// Router / Next Pages / Remix), conservative `scope: "all"` on unknown
// framework + src/, `scope: "none"` on docs/tests-only diffs, and the
// per-route mapping when changes are confined to detectable route dirs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { scopeDiff, detectFramework } from "../../plugins/harness-floor/skills/visual-qa/lib/git-diff-scoper.mjs";

function freshDir(seed) {
  return mkdtempSync(resolve(tmpdir(), `git-diff-scoper-${seed}-`));
}

function mkfile(dir, rel, contents = "") {
  const path = resolve(dir, rel);
  const parts = rel.split("/");
  parts.pop();
  if (parts.length) mkdirSync(resolve(dir, parts.join("/")), { recursive: true });
  writeFileSync(path, contents);
}

test("scopeDiff: empty changedFiles → scope=none", () => {
  assert.deepEqual(scopeDiff({ changedFiles: [], cwd: "." }), { scope: "none" });
});

test("scopeDiff: docs/tests/CI only → scope=none", () => {
  const r = scopeDiff({
    changedFiles: ["README.md", "tests/foo.test.mjs", ".github/workflows/ci.yml", "CHANGELOG.md"],
    cwd: ".",
  });
  assert.deepEqual(r, { scope: "none" });
});

test("scopeDiff: unknown framework + src/* file → scope=all (conservative)", () => {
  const dir = freshDir("unknown-fw");
  const r = scopeDiff({ changedFiles: ["src/utils/util.ts"], cwd: dir });
  assert.deepEqual(r, { scope: "all" });
});

test("scopeDiff: unknown framework + non-src/* visual-y change → scope=none", () => {
  const dir = freshDir("non-src");
  const r = scopeDiff({ changedFiles: ["scripts/build.js"], cwd: dir });
  assert.deepEqual(r, { scope: "none" });
});

test("detectFramework: Next.js Pages Router (src/pages) detected", () => {
  const dir = freshDir("next-pages-src");
  mkfile(dir, "src/pages/index.tsx");
  const fw = detectFramework(dir);
  assert.ok(fw);
  assert.equal(fw.name, "nextjs-pages");
});

test("detectFramework: Next.js App Router (app/layout.tsx) detected", () => {
  const dir = freshDir("next-app");
  mkfile(dir, "app/layout.tsx");
  const fw = detectFramework(dir);
  assert.ok(fw);
  assert.equal(fw.name, "nextjs-app");
});

test("detectFramework: Remix detected when app/routes + remix.config.js", () => {
  const dir = freshDir("remix");
  mkfile(dir, "app/routes/_index.tsx");
  mkfile(dir, "remix.config.js");
  const fw = detectFramework(dir);
  assert.ok(fw);
  assert.equal(fw.name, "remix");
});

test("scopeDiff: Next.js App Router scoped to specific changed route", () => {
  const dir = freshDir("next-app-scoped");
  mkfile(dir, "app/layout.tsx");
  const r = scopeDiff({
    changedFiles: ["app/dashboard/page.tsx"],
    cwd: dir,
  });
  assert.equal(r.scope, "some");
  assert.deepEqual(r.paths, ["/dashboard"]);
});

test("scopeDiff: Next.js App Router with mixed shared+route changes → all", () => {
  const dir = freshDir("next-app-mixed");
  mkfile(dir, "app/layout.tsx");
  const r = scopeDiff({
    changedFiles: ["app/dashboard/page.tsx", "lib/utils.ts"],
    cwd: dir,
  });
  assert.equal(r.scope, "all");
});

test("scopeDiff: Next.js Pages Router maps file → route", () => {
  const dir = freshDir("next-pages-scoped");
  mkfile(dir, "src/pages/index.tsx");
  const r = scopeDiff({
    changedFiles: ["src/pages/about.tsx"],
    cwd: dir,
  });
  assert.equal(r.scope, "some");
  assert.deepEqual(r.paths, ["/about"]);
});

test("scopeDiff: Next.js Pages Router index.tsx → /", () => {
  const dir = freshDir("next-pages-index");
  mkfile(dir, "src/pages/index.tsx");
  const r = scopeDiff({
    changedFiles: ["src/pages/index.tsx"],
    cwd: dir,
  });
  assert.deepEqual(r.paths, ["/"]);
});

test("scopeDiff: nested index → /nested", () => {
  const dir = freshDir("next-pages-nested");
  mkfile(dir, "src/pages/index.tsx");
  const r = scopeDiff({
    changedFiles: ["src/pages/blog/index.tsx"],
    cwd: dir,
  });
  assert.deepEqual(r.paths, ["/blog"]);
});

test("scopeDiff: changedFiles must be an array", () => {
  assert.throws(() => scopeDiff({ changedFiles: "nope", cwd: "." }), /changedFiles array/);
});
