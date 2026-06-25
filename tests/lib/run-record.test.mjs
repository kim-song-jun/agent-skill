import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RUN_RECORD_SCHEMA_VERSION,
  buildRunRecord,
  validateRunRecord,
} from "../../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";

test("buildRunRecord fills defaults and stamps the schema version", () => {
  const r = buildRunRecord({
    runId: "r1", ts: "2026-06-25T00:00:00.000Z", repoFingerprint: "abc",
    source: "agent-all", taskCategory: "backend-api",
    scaffold: { size: "medium", profile: "operational", roster: ["planner", "dev"] },
    outcome: { passed: true, iterations: 2, rolesActuallyInvoked: ["planner", "dev", "security-reviewer"] },
    telemetryRecords: [{ platform: "p", model: "m", totalTokens: 10, costUSD: 0.01 }],
  });
  assert.equal(r.schemaVersion, RUN_RECORD_SCHEMA_VERSION);
  assert.equal(r.scaffold.qaPersonas.length, 0);          // defaulted
  assert.equal(r.outcome.rollbackCount, 0);               // defaulted
  assert.equal(r.outcome.rolesActuallyInvoked.length, 3);
});

test("validateRunRecord rejects wrong schema version", () => {
  assert.throws(() => validateRunRecord({ schemaVersion: "x" }), /schemaVersion/);
});

test("validateRunRecord rejects non-boolean outcome.passed", () => {
  const r = buildRunRecord({ runId: "r", source: "eval-live" });
  r.outcome.passed = "yes";
  assert.throws(() => validateRunRecord(r), /outcome\.passed/);
});

test("validateRunRecord accepts a well-formed record", () => {
  const r = buildRunRecord({ runId: "r", source: "eval-live" });
  assert.equal(validateRunRecord(r), r);
});
