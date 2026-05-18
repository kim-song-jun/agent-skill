import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderReport,
} from "../../../plugins/harness-floor-copilot/skills/visual-qa-copilot/lib/report-renderer.mjs";

test("renderReport: produces a markdown summary with diff sections", () => {
  const md = renderReport({
    summary: { totalCaptures: 4, totalIssues: 2, critical: 1, major: 1, minor: 0, costUSD: 0.123 },
    diff: {
      new: [{ severity: "critical", category: "a11y", page: "home", description: "missing alt" }],
      resolved: [{ severity: "minor", category: "layout", page: "about", description: "old issue" }],
      unchanged: [],
    },
    pages: [{ name: "home", status: "completed", captures: 4, issues: [] }],
    run: { slug: "demo", finishedAt: "2026-05-18T00:00:00Z", model: "claude-sonnet-4-6" },
  });
  assert.match(md, /# Visual QA Report — demo/);
  assert.match(md, /\*\*4\*\*/);
  assert.match(md, /critical: 1, major: 1, minor: 0/);
  assert.match(md, /\$0\.1230/);
  assert.match(md, /missing alt/);
  assert.match(md, /old issue/);
  assert.match(md, /### home — _completed_/);
});

test("renderReport: 'None.' fallback when section empty", () => {
  const md = renderReport({
    summary: {},
    diff: { new: [], resolved: [], unchanged: [] },
    pages: [],
    run: {},
  });
  assert.match(md, /### New\n\n_None\._/);
  assert.match(md, /### Resolved\n\n_None\._/);
});

test("renderReport: throws when report is not an object", () => {
  assert.throws(() => renderReport(null), /must be an object/);
});
