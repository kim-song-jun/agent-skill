import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReport } from "../../plugins/harness-floor-cursor/skills/visual-qa-cursor/lib/report-renderer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(here, "..", "fixtures", "cursor-visual-qa", "report.json"), "utf-8"));

test("renders fixture report — required fields appear in output", () => {
  const md = renderReport(fixture);
  assert.ok(md.includes(`# Visual QA Report — ${fixture.slug}`));
  assert.ok(md.includes(fixture.baseUrl));
  assert.ok(md.includes(`Total issues:** ${fixture.issueCount}`));
});

test("each-block expands per-page status entries", () => {
  const md = renderReport(fixture);
  for (const p of fixture.perPageStatus) {
    assert.ok(md.includes(`### ${p.page}`), `missing per-page section for ${p.page}`);
  }
});

test("each-block expands issues with severity + category", () => {
  const md = renderReport(fixture);
  for (const issue of fixture.issues) {
    assert.ok(md.includes(issue.description), `issue description missing: ${issue.description}`);
    // Assert the issue BLOCK HEADER is rendered, not just that the severity word
    // appears somewhere (it also appears in the summary "**Major:** 1" section).
    assert.ok(
      md.includes(`### ${issue.severity} — ${issue.category}`),
      `issue block header missing for severity=${issue.severity} category=${issue.category}`,
    );
  }
});

test("if-block: priorRunDir null suppresses diff section", () => {
  const md = renderReport(fixture);
  assert.ok(!md.includes("Diff vs prior run"), "should hide diff section when priorRunDir is null");
});

test("if-block: priorRunDir set shows diff section", () => {
  const withPrior = {
    ...fixture,
    priorRunDir: "docs/visual-qa/2026-05-17-xyz0987",
    newCount: 1,
    resolvedCount: 0,
    unchangedCount: 1,
  };
  const md = renderReport(withPrior);
  assert.ok(md.includes("Diff vs prior run"));
  assert.ok(md.includes("2026-05-17-xyz0987"));
});

test("missing template path throws", () => {
  assert.throws(() => renderReport(fixture, "/nope/template.hbs"));
});
