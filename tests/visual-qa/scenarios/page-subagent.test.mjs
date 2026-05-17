import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatrix } from "../../../plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs";
import { diffRuns } from "../../../plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs";

function aggregate(captures) {
  const issues = captures.flatMap(c => (c.analysis?.issues ?? []).map(i => ({
    ...i,
    page: c.page, component: c.component, state: c.state, bp: c.bp, imagePath: c.imagePath,
  })));
  return issues;
}

const config = {
  baseUrl: "http://localhost:3000",
  breakpoints: [{ name: "d", width: 1, height: 1 }],
  pages: [{ name: "home", path: "/", components: [{ name: "btn", selector: "button" }] }],
};

test("first run: aggregated issues all surface as new in diff", () => {
  const matrix = buildMatrix(config);
  const captures = matrix.map(entry => ({
    ...entry,
    imagePath: `home/d/${entry.component ?? "_page"}__${entry.state ?? "n_a"}.png`,
    analysis: {
      issues: entry.component === "btn"
        ? [{ severity: "minor", category: "color-contrast", description: "ratio 4.3", suggestion: "increase" }]
        : [],
      summary: "...",
    },
  }));
  const issues = aggregate(captures);
  const diff = diffRuns(issues, null);
  assert.equal(diff.new.length, 1);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.unchanged.length, 0);
});

test("re-run with same captures: all unchanged", () => {
  const matrix = buildMatrix(config);
  const captures = matrix.map(entry => ({
    ...entry,
    imagePath: `home/d/${entry.component ?? "_page"}__${entry.state ?? "n_a"}.png`,
    analysis: { issues: entry.component === "btn" ? [{ severity: "minor", category: "color-contrast", description: "ratio 4.3", suggestion: "increase" }] : [], summary: "..." },
  }));
  const issues = aggregate(captures);
  const diff = diffRuns(issues, { issues });
  assert.equal(diff.new.length, 0);
  assert.equal(diff.unchanged.length, 1);
});

test("new issue surfaces in diff", () => {
  const matrix = buildMatrix(config);
  const priorCaptures = matrix.map(e => ({
    ...e,
    imagePath: `home/d/${e.component ?? "_page"}__${e.state ?? "n_a"}.png`,
    analysis: { issues: [], summary: "..." },
  }));
  const currentCaptures = priorCaptures.map((c, i) => i === 1
    ? { ...c, analysis: { issues: [{ severity: "major", category: "alignment", description: "off by 3px", suggestion: "snap" }], summary: "..." } }
    : c
  );
  const diff = diffRuns(aggregate(currentCaptures), { issues: aggregate(priorCaptures) });
  assert.equal(diff.new.length, 1);
  assert.equal(diff.new[0].category, "alignment");
});

test("resolved issue surfaces in diff", () => {
  const matrix = buildMatrix(config);
  const priorCaptures = matrix.map((e, i) => ({
    ...e,
    imagePath: `home/d/${e.component ?? "_page"}__${e.state ?? "n_a"}.png`,
    analysis: { issues: i === 1 ? [{ severity: "major", category: "alignment", description: "old", suggestion: "x" }] : [], summary: "" },
  }));
  const currentCaptures = priorCaptures.map(c => ({ ...c, analysis: { issues: [], summary: "" } }));
  const diff = diffRuns(aggregate(currentCaptures), { issues: aggregate(priorCaptures) });
  assert.equal(diff.new.length, 0);
  assert.equal(diff.resolved.length, 1);
});

test("partial failure: errored captures excluded from diff", () => {
  const matrix = buildMatrix(config);
  const captures = matrix.map((e, i) => i === 1
    ? { ...e, imagePath: `home/d/btn__default.png`, analysis: null, error: "analysis_malformed" }
    : { ...e, imagePath: `home/d/_page.png`, analysis: { issues: [], summary: "" } }
  );
  const issues = aggregate(captures.filter(c => !c.error));
  const diff = diffRuns(issues, null);
  assert.equal(diff.new.length, 0);
});
