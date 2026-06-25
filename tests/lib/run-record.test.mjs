import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync as fsWrite, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RUN_RECORD_SCHEMA_VERSION,
  buildRunRecord,
  validateRunRecord,
  safeRunId,
  runRecordPath,
  writeRunRecordAtomic,
  readRunRecords,
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

test("safeRunId sanitizes and falls back to default", () => {
  assert.equal(safeRunId("a/b c"), "a_b_c");
  assert.equal(safeRunId(""), "default");
});

test("runRecordPath places one file per run under runs/records", () => {
  const p = runRecordPath({ cwd: "/x", runId: "feature/1" });
  assert.match(p, /\.agent-skill\/runs\/records\/feature_1\.json$/);
});

test("write then read round-trips; two concurrent runs produce two files", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-record-"));
  try {
    const a = buildRunRecord({ runId: "a", ts: "2026-06-25T00:00:01.000Z", source: "agent-all" });
    const b = buildRunRecord({ runId: "b", ts: "2026-06-25T00:00:02.000Z", source: "eval-live" });
    writeRunRecordAtomic(a, { cwd: dir });
    writeRunRecordAtomic(b, { cwd: dir });
    const files = readdirSync(join(dir, ".agent-skill", "runs", "records")).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 2);
    const all = readRunRecords({ cwd: dir });
    assert.deepEqual(all.map((r) => r.runId), ["a", "b"]); // sorted by ts
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunRecords skips torn/invalid files instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-record-torn-"));
  try {
    writeRunRecordAtomic(buildRunRecord({ runId: "ok", source: "agent-all" }), { cwd: dir });
    const recDir = join(dir, ".agent-skill", "runs", "records");
    fsWrite(join(recDir, "torn.json"), "{ not valid json");
    fsWrite(join(recDir, "wrong.json"), JSON.stringify({ schemaVersion: "other" }));
    const all = readRunRecords({ cwd: dir });
    assert.deepEqual(all.map((r) => r.runId), ["ok"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
