// tests/agent-all/lib/adversarial-verifier.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { adversarialVerify } from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs";

function fixtureDir(seed) {
  return mkdtempSync(resolve(tmpdir(), `adversarial-verifier-${seed}-`));
}

test("a spurious implementerOutput key is ignored — independence is structural", async () => {
  const dir = fixtureDir("sig-guard");
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "fail" });
  const result = await adversarialVerify({
    diff: "--- a/foo.ts\n+++ b/foo.ts",
    acceptanceCriteria: ["all tests pass"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    implementerOutput: "I SWEAR IT ALL PASSED",   // spurious — must be ignored
    _runner: failRunner,
  });
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed",
    "a passing self-report must NOT override a failing breakCondition");
  assert.equal(result.exitCode, 1);
});

test("bad diff whose break condition FAILS → exitCode 1 and audit 'VERIFICATION_AUDIT: failed'", async () => {
  const dir = fixtureDir("bad-diff");
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "FAIL: required test missing" });
  const result = await adversarialVerify({
    diff: "--- a/tests/foo.test.mjs\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-import { test } from 'node:test';\n-test('foo', () => {});",
    acceptanceCriteria: ["all tests still present and passing"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/foo.test.mjs" } },
    cwd: dir,
    _runner: failRunner,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed");
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "failed");
});

test("good diff whose break condition PASSES → exitCode 0 and audit 'VERIFICATION_AUDIT: passed'", async () => {
  const dir = fixtureDir("good-diff");
  const passRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });
  const result = await adversarialVerify({
    diff: "--- a/src/index.mjs\n+++ b/src/index.mjs\n@@ -1 +1 @@\n-export const VERSION = '1.0.0';\n+export const VERSION = '1.0.1';",
    acceptanceCriteria: ["version bump only — all existing tests still pass"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: passRunner,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.audit, "VERIFICATION_AUDIT: passed");
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "passed");
});

test("evidence conforms to verification-evidence/v1 in both pass and fail cases", async () => {
  const dir = fixtureDir("schema-check");
  for (const [exit, expectedStatus, expectedAudit] of [
    [0, "passed", "VERIFICATION_AUDIT: passed"],
    [1, "failed", "VERIFICATION_AUDIT: failed"],
  ]) {
    const runner = async () => ({ exitCode: exit, stdout: "", stderr: "" });
    const result = await adversarialVerify({
      diff: "+ change",
      acceptanceCriteria: ["tests pass"],
      breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
      cwd: dir,
      _runner: runner,
    });
    assert.equal(result.evidence.schemaVersion, "verification-evidence/v1", `schema for ${expectedStatus}`);
    assert.equal(result.evidence.status, expectedStatus, `status for ${expectedStatus}`);
    assert.equal(result.audit, expectedAudit, `audit literal for ${expectedStatus}`);
  }
});

test("structural signature guard — adversarialVerify must not reference any implementer self-report param", () => {
  assert.ok(
    !/implementer[_-]?output|self[_-]?report/i.test(adversarialVerify.toString()),
    "adversarialVerify must not reference any implementer self-report param — independence is structural",
  );
});

test("explicit `command` takes precedence over breakCondition — the gate runs the resolved FULL command", async () => {
  const dir = fixtureDir("explicit-command");
  let ranCommand = null;
  const recordingRunner = async (command) => { ranCommand = command; return { exitCode: 0, stdout: "", stderr: "" }; };
  const result = await adversarialVerify({
    diff: "informational only",
    acceptanceCriteria: [],
    breakCondition: { adapter: "cli", config: { command: "SCOPED_BREAK_CMD" } },
    command: { adapter: "cli", config: { command: "FULL_GATE_CMD" } },
    cwd: dir,
    _runner: recordingRunner,
  });
  assert.equal(ranCommand, "FULL_GATE_CMD",
    "when `command` is supplied, the gate must run it (the full command), not breakCondition");
  assert.equal(result.audit, "VERIFICATION_AUDIT: passed");
});

test("without `command`, adversarialVerify still runs breakCondition (backward-compatible)", async () => {
  const dir = fixtureDir("no-command");
  let ranCommand = null;
  const recordingRunner = async (command) => { ranCommand = command; return { exitCode: 0, stdout: "", stderr: "" }; };
  await adversarialVerify({
    diff: "informational only",
    acceptanceCriteria: [],
    breakCondition: { adapter: "cli", config: { command: "LEGACY_BREAK_CMD" } },
    cwd: dir,
    _runner: recordingRunner,
  });
  assert.equal(ranCommand, "LEGACY_BREAK_CMD",
    "unchanged callers (command omitted) keep resolving breakCondition");
});

test("real command-runner integration — defaultCommandRunner spawns real child process (no _runner injection)", async () => {
  const dir = fixtureDir("real-runner");

  // 'true' exits 0 → expect passed
  const passResult = await adversarialVerify({
    diff: "informational only",
    acceptanceCriteria: ["exit 0"],
    breakCondition: { adapter: "cli", config: { command: "true" } },
    cwd: dir,
    // _runner intentionally omitted — exercises the real defaultCommandRunner path
  });
  assert.equal(passResult.exitCode, 0, "real 'true' command must exit 0");
  assert.equal(passResult.audit, "VERIFICATION_AUDIT: passed", "real 'true' command must produce passed audit");

  // 'false' exits 1 → expect failed
  const failResult = await adversarialVerify({
    diff: "informational only",
    acceptanceCriteria: ["exit non-zero"],
    breakCondition: { adapter: "cli", config: { command: "false" } },
    cwd: dir,
    // _runner intentionally omitted
  });
  assert.notEqual(failResult.exitCode, 0, "real 'false' command must exit non-zero");
  assert.equal(failResult.audit, "VERIFICATION_AUDIT: failed", "real 'false' command must produce failed audit");
});
