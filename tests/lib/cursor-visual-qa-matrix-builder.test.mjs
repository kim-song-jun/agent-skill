import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMatrix } from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/matrix-builder.mjs";

const SOURCE = resolve("plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs");
const VENDORED = resolve("plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/matrix-builder.mjs");

test("vendored copy retains source-of-truth code", () => {
  const src = readFileSync(SOURCE, "utf-8");
  const ven = readFileSync(VENDORED, "utf-8");
  for (const line of src.split("\n")) {
    if (!line.trim()) continue;
    assert.ok(ven.includes(line), `vendored matrix-builder.mjs missing: ${line}`);
  }
});

test("page-only matrix: one _page entry per breakpoint", () => {
  const cfg = {
    breakpoints: [{ name: "m", width: 1, height: 1 }, { name: "d", width: 2, height: 2 }],
    pages: [{ name: "home", path: "/", components: [] }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 2);
  assert.ok(m.every((e) => e.kind === "page"));
});

test("matrix with components and flows: total respects spec arithmetic", () => {
  const cfg = {
    breakpoints: [{ name: "m", width: 1, height: 1 }, { name: "d", width: 2, height: 2 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button", states: ["hover"] }],
    }],
    flows: [{ name: "f", steps: [{ screenshot: "a" }, { screenshot: "b" }] }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 8);
});
