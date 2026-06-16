// Lib-level end-to-end smoke test for comprehensive-mode visual-qa.
//
// Stitches crawler → dom-walker → shallow-clicker (stubs) → dom-hash
// cache → verdict together without touching Playwright. Validates the
// pieces compose into a coherent pipeline before live CLI testing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { crawl } from "../../plugins/harness-floor/skills/visual-qa/lib/crawler.mjs";
import { walkDom } from "../../plugins/harness-floor/skills/visual-qa/lib/dom-walker.mjs";
import { shallowClick } from "../../plugins/harness-floor/skills/visual-qa/lib/shallow-clicker.mjs";
import {
  hashComponent,
  emptyCache,
  lookup,
  recordHit,
  readCache,
  writeCache,
} from "../../plugins/harness-floor/skills/visual-qa/lib/dom-hash.mjs";
import { computeVerdict, firstRunVerdict } from "../../plugins/harness-floor/skills/visual-qa/lib/verdict.mjs";
import { scopeDiff } from "../../plugins/harness-floor/skills/visual-qa/lib/git-diff-scoper.mjs";

function tmp() {
  return mkdtempSync(resolve(tmpdir(), "vqa-int-"));
}

// A tiny in-memory site for the crawler to walk.
const SITE = {
  "/": {
    title: "Home",
    links: ["/about", "/products"],
    snapshot: {
      elements: [
        { tag: "button", attributes: { "data-testid": "primary-cta" }, text: "Get started", path: "html>body>button", visible: true },
        { tag: "a",      attributes: { href: "/about", id: "nav-about" }, text: "About",      path: "html>body>nav>a:nth(0)", visible: true },
      ],
    },
  },
  "/about": {
    title: "About",
    links: [],
    snapshot: {
      elements: [
        { tag: "button", attributes: { "data-testid": "back" }, text: "Back", path: "html>body>button", visible: true },
      ],
    },
  },
  "/products": {
    title: "Products",
    links: [],
    snapshot: {
      elements: [
        { tag: "button", attributes: { "data-testid": "add-to-cart" }, text: "Add to cart", path: "html>body>button", visible: true },
        { tag: "input",  attributes: { type: "text", id: "qty" },      text: "",            path: "html>body>input", visible: true },
      ],
    },
  },
};

test("integration: crawler → dom-walker → shallow-clicker → verdict, first run = auto-pass", async () => {
  // 1. Crawl
  const pages = await crawl({
    scope: { include: ["/"], maxPages: 50, depth: 3 },
    fetchPageLinks: async (path) => {
      const node = SITE[path];
      return node ? { title: node.title, links: node.links } : { links: [] };
    },
  });
  const paths = pages.map((p) => p.path).sort();
  assert.deepEqual(paths, ["/", "/about", "/products"]);

  // 2. Walk DOM per page
  const matrix = [];
  for (const page of pages) {
    const components = walkDom(SITE[page.path].snapshot);
    matrix.push({ page: page.path, components });
  }
  assert.equal(matrix.find((m) => m.page === "/").components.length, 2);

  // 3. Shallow click each page (input on /products should be skipped)
  const screenshots = [];
  for (const m of matrix) {
    const result = await shallowClick({
      pagePath: m.page,
      clickables: m.components,
      hooks: {
        click: async ({ selector }) => ({ navigated: selector.includes("nav-about") }),
        waitStable: async () => {},
        screenshot: async ({ pagePath, suffix }) => {
          const fakePath = `/tmp/${pagePath.replace(/\W/g, "_")}${suffix}.png`;
          screenshots.push(fakePath);
          return fakePath;
        },
        revert: async () => {},
      },
    });
    assert.equal(result.errors.length, 0);
  }
  // / has 2 clickables, /about 1, /products has 1 button + 1 input (input skipped) = 1
  assert.equal(screenshots.length, 2 + 1 + 1);

  // 4. Hash components + cache
  const cachePath = resolve(tmp(), "dom-hashes.json");
  let cache = emptyCache();
  for (const m of matrix) {
    for (const c of m.components) {
      const hash = hashComponent({
        dom: `<${m.components[0].kind} data-testid="${c.selector}">${c.label}</${m.components[0].kind}>`,
        computedStyles: { color: "#000" },
      });
      assert.equal(typeof hash, "string");
      assert.equal(hash.length, 16);
      cache = recordHit(cache, hash, { verdict: "pass", issues: [] });
    }
  }
  writeCache(cachePath, cache);
  const back = readCache(cachePath);
  // 2 + 1 + 2 components hashed (input is interactive but click was skipped)
  assert.equal(Object.keys(back.entries).length, 5);

  // 5. First-run verdict — no baseline yet, should auto-pass
  const v = firstRunVerdict({
    thisRun: { issues: [] },
    firstRun: "auto-pass",
  });
  assert.equal(v.pass, true);
  assert.equal(v.isFirstRun, true);
});

test("integration: second run with no DOM changes → cache hits, verdict pass vs baseline", async () => {
  const dom1 = '<button data-testid="cta">Go</button>';
  const dom2 = '<button data-testid="cta">Go</button>'; // identical
  const styles = { color: "#000" };
  const hash1 = hashComponent({ dom: dom1, computedStyles: styles });
  const hash2 = hashComponent({ dom: dom2, computedStyles: styles });
  assert.equal(hash1, hash2, "identical DOM should hit cache");

  let cache = emptyCache();
  cache = recordHit(cache, hash1, { verdict: "pass", issues: [] });
  const hit = lookup(cache, hash2);
  assert.ok(hit, "cache should return a hit on second pass");
  assert.deepEqual(hit.priorAnalysis, { verdict: "pass", issues: [] }, "cached prior analysis should be retrievable");

  // Issue set unchanged → verdict pass
  const v = computeVerdict({
    thisRun: { issues: [] },
    baseline: { issues: [] },
    failOn: ["critical", "major"],
  });
  assert.equal(v.pass, true);
});

test("integration: regression detected (new critical) → verdict fail", () => {
  const baseline = { issues: [] };
  const thisRun = {
    issues: [
      { page: "/", component: "cta", category: "alignment", severity: "critical", message: "button overflows viewport" },
    ],
  };
  const v = computeVerdict({ thisRun, baseline, failOn: ["critical", "major"] });
  assert.equal(v.pass, false);
  assert.equal(v.newCritical.length, 1);
});

test("integration: git-diff scoping skips Phase 1 on docs-only changes", () => {
  const r = scopeDiff({ changedFiles: ["README.md", "CHANGELOG.md", "tests/foo.test.mjs"], cwd: "." });
  assert.equal(r.scope, "none");
  // In Phase 1: pages would be cleared, matrix would be empty, Phase 5
  // would default to a pass verdict. End-to-end this lets the loop break
  // immediately on doc-only iterations.
});
