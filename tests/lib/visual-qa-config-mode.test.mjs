// Tests the config-loader mode branch: validates `mode` field, requires
// `pages` only when mode=declared, requires `comprehensive.scope.include`
// when mode=comprehensive.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { loadConfig } from "../../plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs";

function write(name, content) {
  const dir = mkdtempSync(resolve(tmpdir(), `visual-qa-config-mode-${name}-`));
  const path = resolve(dir, ".visual-qa.json");
  writeFileSync(path, JSON.stringify(content));
  return path;
}

const baseBreakpoints = [{ name: "desktop", width: 1440, height: 900 }];

test("loadConfig: default mode is declared (back-compat)", () => {
  const p = write("default-mode", {
    baseUrl: "http://localhost:3000",
    breakpoints: baseBreakpoints,
    pages: [{ name: "home", path: "/" }],
  });
  const r = loadConfig(p, {});
  assert.equal(r.ok, true);
});

test("loadConfig: mode=declared requires pages", () => {
  const p = write("decl-no-pages", {
    mode: "declared",
    baseUrl: "http://localhost:3000",
    breakpoints: baseBreakpoints,
  });
  const r = loadConfig(p, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "pages"), `expected a 'pages' error, got: ${JSON.stringify(r.errors)}`);
});

test("loadConfig: mode=comprehensive does NOT require pages", () => {
  const p = write("comp-no-pages", {
    mode: "comprehensive",
    baseUrl: "http://localhost:3000",
    breakpoints: baseBreakpoints,
    comprehensive: { scope: { include: ["/"], maxPages: 10, depth: 2 } },
  });
  const r = loadConfig(p, {});
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test("loadConfig: mode=comprehensive requires non-empty scope.include", () => {
  const p = write("comp-empty-scope", {
    mode: "comprehensive",
    baseUrl: "http://localhost:3000",
    breakpoints: baseBreakpoints,
    comprehensive: { scope: { include: [] } },
  });
  const r = loadConfig(p, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "comprehensive.scope.include"), `expected a 'comprehensive.scope.include' error, got: ${JSON.stringify(r.errors)}`);
});

test("loadConfig: mode=comprehensive missing comprehensive.scope.include also fails", () => {
  const p = write("comp-no-section", {
    mode: "comprehensive",
    baseUrl: "http://localhost:3000",
    breakpoints: baseBreakpoints,
  });
  const r = loadConfig(p, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "comprehensive.scope.include"), `expected a 'comprehensive.scope.include' error, got: ${JSON.stringify(r.errors)}`);
});

test("loadConfig: unknown mode value rejected", () => {
  const p = write("bad-mode", {
    mode: "fancy",
    baseUrl: "http://localhost:3000",
    breakpoints: baseBreakpoints,
    pages: [{ name: "home", path: "/" }],
  });
  const r = loadConfig(p, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "mode"), `expected a 'mode' error, got: ${JSON.stringify(r.errors)}`);
});

test("loadConfig: comprehensive auto-scaffold config (from break-resolver) validates clean", async () => {
  const { QA_AUTOSCAFFOLD_CONFIG } = await import(
    "../../plugins/harness-floor/skills/agent-all/lib/break-resolver.mjs"
  );
  const p = write("autoscaffold", QA_AUTOSCAFFOLD_CONFIG);
  const r = loadConfig(p, {});
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.config.mode, "comprehensive");
});

test("loadConfig: Phase 1 doc references mode branch", async () => {
  const { readFileSync } = await import("node:fs");
  const body = readFileSync(
    resolve("plugins/harness-floor/skills/visual-qa/phases/1-config.md"),
    "utf-8",
  );
  assert.match(body, /mode === "declared"/);
  assert.match(body, /mode === "comprehensive"/);
  assert.match(body, /crawler/);
  assert.match(body, /walkDom|dom-walker/);
});
