// Unit tests for the comprehensive-mode crawler (BFS, scope filtering,
// depth + page caps, exclude globs, cross-origin discard).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  crawl,
  canonicalisePath,
  isExcluded,
} from "../../plugins/harness-floor/skills/visual-qa/lib/crawler.mjs";

function makeFetcher(graph) {
  return async (path) => {
    const node = graph[path];
    if (!node) return { title: path, links: [] };
    return { title: node.title ?? path, links: node.links };
  };
}

test("canonicalisePath: strips query + fragment, normalises trailing slash", () => {
  assert.equal(canonicalisePath("/foo/?q=1#x", "/"), "/foo");
  assert.equal(canonicalisePath("/foo", "/"), "/foo");
  assert.equal(canonicalisePath("/", "/foo"), "/");
});

test("canonicalisePath: resolves relative URLs against origin path", () => {
  assert.equal(canonicalisePath("about", "/products/x"), "/products/about");
  assert.equal(canonicalisePath("/about", "/products/x"), "/about");
});

test("canonicalisePath: returns null for cross-origin / mailto / javascript", () => {
  assert.equal(canonicalisePath("https://other.example/about", "/"), null);
  assert.equal(canonicalisePath("mailto:hi@example.com", "/"), null);
  assert.equal(canonicalisePath("javascript:void(0)", "/"), null);
  assert.equal(canonicalisePath("#anchor", "/"), null);
});

test("isExcluded: simple glob matching", () => {
  assert.equal(isExcluded("/admin", ["/admin"]), true);
  assert.equal(isExcluded("/admin/users", ["/admin/*"]), true);
  assert.equal(isExcluded("/admin/users/3", ["/admin/*"]), false);
  assert.equal(isExcluded("/admin/users/3", ["/admin/**"]), true);
  assert.equal(isExcluded("/blog/2026/post", ["/admin/*"]), false);
});

test("crawl: empty scope.include returns []", async () => {
  const out = await crawl({ scope: { include: [] }, fetchPageLinks: makeFetcher({}) });
  assert.deepEqual(out, []);
});

test("crawl: visits root and follows links BFS", async () => {
  const graph = {
    "/": { links: ["/about", "/products"] },
    "/about": { links: [] },
    "/products": { links: ["/products/a", "/products/b"] },
    "/products/a": { links: [] },
    "/products/b": { links: [] },
  };
  const out = await crawl({
    scope: { include: ["/"], maxPages: 50, depth: 5 },
    fetchPageLinks: makeFetcher(graph),
  });
  const paths = out.map((p) => p.path);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/about"));
  assert.ok(paths.includes("/products"));
  assert.ok(paths.includes("/products/a"));
  assert.ok(paths.includes("/products/b"));
  assert.equal(out.length, 5);
});

test("crawl: respects depth cap", async () => {
  const graph = {
    "/": { links: ["/lvl1"] },
    "/lvl1": { links: ["/lvl2"] },
    "/lvl2": { links: ["/lvl3"] },
    "/lvl3": { links: [] },
  };
  const out = await crawl({
    scope: { include: ["/"], maxPages: 50, depth: 2 },
    fetchPageLinks: makeFetcher(graph),
  });
  const paths = out.map((p) => p.path).sort();
  assert.deepEqual(paths, ["/", "/lvl1", "/lvl2"]);
});

test("crawl: respects maxPages cap", async () => {
  const graph = {
    "/": { links: ["/a", "/b", "/c", "/d", "/e", "/f"] },
  };
  for (const p of ["/a", "/b", "/c", "/d", "/e", "/f"]) graph[p] = { links: [] };
  const out = await crawl({
    scope: { include: ["/"], maxPages: 3, depth: 5 },
    fetchPageLinks: makeFetcher(graph),
  });
  assert.equal(out.length, 3);
});

test("crawl: excludes paths matching exclude globs", async () => {
  const graph = {
    "/": { links: ["/about", "/admin", "/admin/users"] },
    "/about": { links: [] },
    "/admin": { links: ["/admin/users"] },
    "/admin/users": { links: [] },
  };
  const out = await crawl({
    scope: { include: ["/"], exclude: ["/admin", "/admin/**"], maxPages: 50, depth: 5 },
    fetchPageLinks: makeFetcher(graph),
  });
  const paths = out.map((p) => p.path).sort();
  assert.deepEqual(paths, ["/", "/about"]);
});

test("crawl: deduplicates pages reached via multiple paths", async () => {
  const graph = {
    "/": { links: ["/foo", "/bar"] },
    "/foo": { links: ["/shared"] },
    "/bar": { links: ["/shared"] },
    "/shared": { links: [] },
  };
  const out = await crawl({
    scope: { include: ["/"], maxPages: 50, depth: 5 },
    fetchPageLinks: makeFetcher(graph),
  });
  assert.equal(out.filter((p) => p.path === "/shared").length, 1);
});

test("crawl: records source page for non-root entries", async () => {
  const graph = {
    "/": { links: ["/about"] },
    "/about": { links: [] },
  };
  const out = await crawl({
    scope: { include: ["/"], maxPages: 50, depth: 5 },
    fetchPageLinks: makeFetcher(graph),
  });
  const about = out.find((p) => p.path === "/about");
  assert.equal(about.source, "/");
  assert.equal(about.depth, 1);
});

test("crawl: fetcher errors don't abort the run", async () => {
  const fetcher = async (path) => {
    if (path === "/broken") throw new Error("network fail");
    if (path === "/") return { links: ["/broken", "/ok"] };
    return { links: [] };
  };
  const out = await crawl({
    scope: { include: ["/"], maxPages: 50, depth: 5 },
    fetchPageLinks: fetcher,
  });
  const paths = out.map((p) => p.path).sort();
  assert.deepEqual(paths, ["/", "/broken", "/ok"]);
  const broken = out.find((p) => p.path === "/broken");
  assert.match(broken.error, /network fail/);
});

test("crawl: throws when fetchPageLinks not a function", async () => {
  await assert.rejects(
    () => crawl({ scope: { include: ["/"] } }),
    /requires a fetchPageLinks/,
  );
});
