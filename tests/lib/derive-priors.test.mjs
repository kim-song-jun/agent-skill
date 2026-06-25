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
    runId: `r${i}`, ts: `2026-06-25T00:00:0${i}.000Z`, source: "agent-all",
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
