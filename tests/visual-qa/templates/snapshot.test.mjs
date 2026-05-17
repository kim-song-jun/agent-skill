import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { render } from "../../../plugins/harness-builder/skills/harness-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function snapshot(name, actual) {
  const snapPath = resolve(here, "__snapshots__", `${name}.snap`);
  mkdirSync(dirname(snapPath), { recursive: true });
  if (!existsSync(snapPath) || process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, "utf-8");
  assert.equal(actual, expected, `Snapshot mismatch for ${name}. Re-run with UPDATE_SNAPSHOTS=1 to update.`);
}

const TEMPLATES_DIR = resolve(here, "..", "..", "..", "plugins", "harness-floor", "skills", "visual-qa", "templates");

const FIXTURES = [
  {
    tag: "minimal",
    ctx: {
      baseUrl: "http://localhost:3000",
      model: "claude-sonnet-4-6",
      categories: ["accessibility"],
      severityThreshold: "minor",
      slug: "2026-05-17-min",
      timestamp: "2026-05-17T00:00:00Z",
      matrix: { totalCaptures: 0 },
      pageCount: 0,
      counts: {
        critical: { new: 0, resolved: 0, unchanged: 0, total: 0 },
        major: { new: 0, resolved: 0, unchanged: 0, total: 0 },
        minor: { new: 0, resolved: 0, unchanged: 0, total: 0 },
      },
      hasIncompletePages: false,
      incompletePages: [],
      newIssues: [],
      resolvedIssues: [],
      unchangedIssues: [],
      estCostUSD: "0.00",
    },
  },
  {
    tag: "with-issues",
    ctx: {
      baseUrl: "http://localhost:3000",
      model: "claude-opus-4-7",
      categories: ["accessibility", "alignment"],
      severityThreshold: "major",
      slug: "2026-05-17-iss",
      timestamp: "2026-05-17T01:00:00Z",
      matrix: { totalCaptures: 42 },
      pageCount: 3,
      counts: {
        critical: { new: 1, resolved: 0, unchanged: 0, total: 1 },
        major: { new: 0, resolved: 1, unchanged: 1, total: 2 },
        minor: { new: 0, resolved: 0, unchanged: 0, total: 0 },
      },
      hasIncompletePages: true,
      incompletePages: [{ page: "checkout", reason: "auth flow timed out" }],
      newIssues: [{ severity: "critical", page: "home", component: "modal", state: "default", bp: "mobile", category: "alignment", description: "modal off-screen", suggestion: "constrain max-width", imagePath: "home/mobile/modal__default.png" }],
      resolvedIssues: [{ severity: "major", page: "home", component: "hero", state: "hover", bp: "desktop", description: "logo off-center" }],
      unchangedIssues: [{ severity: "major", page: "home", component: "footer", state: "default", bp: "tablet", description: "missing copyright" }],
      estCostUSD: "1.20",
    },
  },
  {
    tag: "categories-only",
    ctx: { categories: ["a11y", "color"], severityThreshold: "critical", baseUrl: "http://localhost:8080", model: "claude-haiku-4-5", slug: "", timestamp: "", matrix: { totalCaptures: 0 }, pageCount: 0, counts: { critical: { new: 0, resolved: 0, unchanged: 0, total: 0 }, major: { new: 0, resolved: 0, unchanged: 0, total: 0 }, minor: { new: 0, resolved: 0, unchanged: 0, total: 0 } }, hasIncompletePages: false, incompletePages: [], newIssues: [], resolvedIssues: [], unchangedIssues: [], estCostUSD: "0.00" },
  },
];

function listTemplates(dir, base = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = `${base}${e.name}`;
    return e.isDirectory() ? listTemplates(resolve(dir, e.name), `${p}/`) : [p];
  });
}

for (const tplRel of listTemplates(TEMPLATES_DIR)) {
  if (!tplRel.endsWith(".hbs") && !tplRel.endsWith(".md.hbs")) continue;
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
  for (const fx of FIXTURES) {
    test(`snapshot: ${tplRel} × ${fx.tag}`, () => {
      const out = render(tpl, fx.ctx);
      snapshot(`${tplRel.replace(/\//g, "_")}__${fx.tag}`, out);
    });
  }
}
