// tests/lib/derive-priors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { derivePriors } from "../../plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs";

function seed(dir, records) {
  const recDir = join(dir, ".agent-skill", "runs", "records");
  mkdirSync(recDir, { recursive: true });
  records.forEach((r, i) => writeFileSync(join(recDir, `r${i}.json`), JSON.stringify({
    schemaVersion: "agent-skill-run-record/v1",
    runId: `r${i}`, ts: `2026-06-25T00:00:0${i}.000Z`, source: r.source ?? "agent-all",
    scaffold: { profile: r.profile ?? "operational", roster: r.roster ?? [] },
    outcome: { passed: true, rolesActuallyInvoked: r.invoked ?? [] },
    telemetryRecords: (r.cost ? [{ costUSD: r.cost }] : []),
  })));
}

test("empty records dir yields empty priors", () => {
  const dir = mkdtempSync(join(tmpdir(), "priors-empty-"));
  try {
    assert.deepEqual(derivePriors({ cwd: dir }), {
      priorRunCount: 0, rosterAdditions: [], suggestedProfile: null, suggestedMaxCostUSD: null,
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a role invoked-but-unscaffolded in >=60% of recent runs is recommended", () => {
  const dir = mkdtempSync(join(tmpdir(), "priors-roster-"));
  try {
    // 5 runs: security-reviewer invoked-not-scaffolded in 4/5 (80% >= 60% -> recommend);
    // doc-writer in 2/5 (40% < 60% -> excluded)
    seed(dir, [
      { roster: ["planner"], invoked: ["planner", "security-reviewer"] },
      { roster: ["planner"], invoked: ["planner", "security-reviewer", "doc-writer"] },
      { roster: ["planner"], invoked: ["planner", "security-reviewer", "doc-writer"] },
      { roster: ["planner"], invoked: ["planner", "security-reviewer"] },
      { roster: ["planner"], invoked: ["planner"] },
    ]);
    const p = derivePriors({ cwd: dir });
    assert.equal(p.priorRunCount, 5);
    assert.deepEqual(p.rosterAdditions, ["security-reviewer"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dominant profile and cost headroom are suggested", () => {
  const dir = mkdtempSync(join(tmpdir(), "priors-profile-"));
  try {
    seed(dir, [
      { profile: "operational", cost: 2 },
      { profile: "operational", cost: 4 },
      { profile: "lite", cost: 1 },
    ]);
    const p = derivePriors({ cwd: dir });
    assert.equal(p.suggestedProfile, "operational");
    assert.equal(p.suggestedMaxCostUSD, 6); // max(4) * 1.5
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("eval-live records do not influence suggestedProfile or suggestedMaxCostUSD", () => {
  // 3 agent-all records with profile "operational" and costs ~3-4,
  // plus 4 eval-live records with profile "lite" and costs ~0.5.
  // Without the source filter the window (N=5) would be dominated by eval-live
  // records and would flip profile to "lite" and drive cost near 0.75.
  const dir = mkdtempSync(join(tmpdir(), "priors-mixed-"));
  try {
    seed(dir, [
      { source: "agent-all",  profile: "operational", cost: 3.0 },
      { source: "agent-all",  profile: "operational", cost: 4.0 },
      { source: "agent-all",  profile: "operational", cost: 3.5 },
      { source: "eval-live",  profile: "lite",         cost: 0.5 },
      { source: "eval-live",  profile: "lite",         cost: 0.4 },
      { source: "eval-live",  profile: "lite",         cost: 0.6 },
      { source: "eval-live",  profile: "lite",         cost: 0.5 },
    ]);
    // recentN=5 window slices last 5: [agent-all op 3.5, eval-live ×4]
    // but profile/cost must only use agent-all records from that window.
    const p = derivePriors({ cwd: dir, recentN: 7 }); // include all 7 to guarantee agent-all are present
    assert.equal(p.suggestedProfile, "operational", "eval-live records must not flip profile to lite");
    // max agent-all cost = 4.0, headroom = 4.0 * 1.5 = 6.0
    assert.equal(p.suggestedMaxCostUSD, 6, "eval-live costs must not lower suggestedMaxCostUSD");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test(">recentN records are windowed: priorRunCount equals recentN not total", () => {
  // Seed 7 agent-all records but default recentN=5 — count must be 5.
  const dir = mkdtempSync(join(tmpdir(), "priors-window-"));
  try {
    seed(dir, [
      { profile: "operational", cost: 1 },
      { profile: "operational", cost: 2 },
      { profile: "operational", cost: 3 },
      { profile: "operational", cost: 4 },
      { profile: "operational", cost: 5 },
      { profile: "operational", cost: 6 },
      { profile: "operational", cost: 7 },
    ]);
    const p = derivePriors({ cwd: dir }); // recentN defaults to 5
    assert.equal(p.priorRunCount, 5, "windowing must cap priorRunCount at recentN=5, not 7");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
