// Unit tests for the comprehensive-mode verdict computer + first-run
// baseline policy.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeVerdict,
  firstRunVerdict,
} from "../../plugins/harness-floor/skills/visual-qa/lib/verdict.mjs";

function issue(over = {}) {
  return {
    page: "/",
    component: "submit-btn",
    category: "color-contrast",
    severity: "major",
    message: "low contrast on hover",
    ...over,
  };
}

test("computeVerdict: identical baseline + this-run → pass", () => {
  const i = issue();
  const r = computeVerdict({ thisRun: { issues: [i] }, baseline: { issues: [i] } });
  assert.equal(r.pass, true);
  assert.equal(r.newCritical.length, 0);
  assert.equal(r.newMajor.length, 0);
});

test("computeVerdict: new critical issue → fail by default failOn", () => {
  const newOne = issue({ severity: "critical", message: "broken layout" });
  const r = computeVerdict({ thisRun: { issues: [newOne] }, baseline: { issues: [] } });
  assert.equal(r.pass, false);
  assert.equal(r.newCritical.length, 1);
  assert.match(r.reason, /1 new critical/);
});

test("computeVerdict: new major fails by default but only minor passes", () => {
  const major = issue({ severity: "major", message: "alignment off" });
  const minor = issue({ severity: "minor", message: "fontsize tiny" });
  const r1 = computeVerdict({ thisRun: { issues: [major] }, baseline: { issues: [] } });
  assert.equal(r1.pass, false);
  const r2 = computeVerdict({ thisRun: { issues: [minor] }, baseline: { issues: [] } });
  assert.equal(r2.pass, true);
});

test("computeVerdict: regressed issue (worse severity) → fail", () => {
  const before = issue({ severity: "minor" });
  const after  = issue({ severity: "critical" });
  const r = computeVerdict({ thisRun: { issues: [after] }, baseline: { issues: [before] } });
  assert.equal(r.pass, false);
  assert.equal(r.regressed.length, 1);
  assert.equal(r.regressed[0].previousSeverity, "minor");
  assert.match(r.reason, /regressed/);
});

test("computeVerdict: improved severity (major → minor) counts as fixed, not regression", () => {
  const before = issue({ severity: "major" });
  const after  = issue({ severity: "minor" });
  const r = computeVerdict({ thisRun: { issues: [after] }, baseline: { issues: [before] } });
  // Same (page, component, category, message-hash) — so same key. Not new, not regressed.
  // But severity dropped, so it's not regressed either.
  assert.equal(r.pass, true);
  assert.equal(r.regressed.length, 0);
});

test("computeVerdict: issue fixed in this run shows up in fixed[]", () => {
  const old = issue({ severity: "critical" });
  const r = computeVerdict({ thisRun: { issues: [] }, baseline: { issues: [old] } });
  assert.equal(r.pass, true);
  assert.equal(r.fixed.length, 1);
});

test("computeVerdict: custom failOn list", () => {
  const minor = issue({ severity: "minor", message: "tiny" });
  const r = computeVerdict({ thisRun: { issues: [minor] }, baseline: { issues: [] }, failOn: ["minor"] });
  assert.equal(r.pass, false);
  assert.match(r.reason, /1 new minor/);
});

test("computeVerdict: handles missing / null inputs gracefully", () => {
  assert.equal(computeVerdict({ thisRun: null, baseline: null }).pass, true);
  assert.equal(computeVerdict({ thisRun: {}, baseline: {} }).pass, true);
});

test("computeVerdict: same message text on different components -> independent issue keys", () => {
  const a = issue({ component: "btn-a", message: "low contrast" });
  const b = issue({ component: "btn-b", message: "low contrast" });
  const r = computeVerdict({ thisRun: { issues: [a, b] }, baseline: { issues: [a] } });
  // `b` is new, `a` matches baseline
  assert.equal(r.newMajor.length, 1);
  assert.equal(r.newMajor[0].component, "btn-b");
});

test("firstRunVerdict: auto-pass default returns pass + writes-baseline reason", () => {
  const r = firstRunVerdict({ thisRun: { issues: [issue({ severity: "critical" })] } });
  assert.equal(r.pass, true);
  assert.equal(r.isFirstRun, true);
  assert.match(r.reason, /baseline written/);
});

test("firstRunVerdict: policy=block fails when baseline missing", () => {
  const r = firstRunVerdict({
    thisRun: { issues: [issue({ severity: "critical" })] },
    firstRun: "block",
  });
  assert.equal(r.pass, false);
  assert.equal(r.isFirstRun, true);
  assert.match(r.reason, /not yet established/);
  assert.equal(r.newCritical.length, 1);
});

test("firstRunVerdict: policy=report passes but surfaces issue counts", () => {
  const r = firstRunVerdict({
    thisRun: { issues: [issue({ severity: "critical" }), issue({ severity: "minor" })] },
    firstRun: "report",
  });
  assert.equal(r.pass, true);
  assert.equal(r.isFirstRun, true);
  assert.match(r.reason, /1c 0m 1n/);
});
