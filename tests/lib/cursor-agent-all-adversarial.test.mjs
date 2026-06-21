// tests/lib/cursor-agent-all-adversarial.test.mjs
// Real adversarialVerify behavior tests against the CURSOR-vendored module.
// Proves the vendored module + cursor registry.mjs wiring actually runs, not
// just exists. Zero fake/shape-only assertions.
// NOTE: the pure-JS module IS real behavior (tests here). The *live Cursor
// background-agent dispatch* of the adversarial step is spec-level and
// live-CLI-unverified (#27) until the Cursor background-agent spike.
// These tests assert module-level contracts only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Import from the CURSOR-vendored path — this is the key proof that the vendor
// landed and the cursor registry.mjs wiring resolves correctly.
import { adversarialVerify } from "../../plugins/harness-floor-cursor/skills/agent-all-cursor/lib/verification-adapters/adversarial-verifier.mjs";

function fixtureDir(seed) {
  return mkdtempSync(resolve(tmpdir(), `cursor-adversarial-${seed}-`));
}

test("cursor-vendored adversarialVerify: failing _runner → VERIFICATION_AUDIT: failed with correct evidence", async () => {
  const dir = fixtureDir("fail");
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "FAIL: test missing" });
  const result = await adversarialVerify({
    diff: "--- a/tests/foo.test.mjs\n+++ /dev/null\n@@ -1 +0,0 @@\n-test('foo', () => {});",
    acceptanceCriteria: ["all tests present and passing"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: failRunner,
  });
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed",
    "cursor adversarialVerify must produce VERIFICATION_AUDIT: failed on exitCode 1");
  assert.equal(result.exitCode, 1);
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "failed");
});

test("cursor-vendored adversarialVerify: passing _runner → VERIFICATION_AUDIT: passed", async () => {
  const dir = fixtureDir("pass");
  const passRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });
  const result = await adversarialVerify({
    diff: "--- a/src/index.mjs\n+++ b/src/index.mjs\n@@ -1 +1 @@\n-const v = 1;\n+const v = 2;",
    acceptanceCriteria: ["version bump only"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: passRunner,
  });
  assert.equal(result.audit, "VERIFICATION_AUDIT: passed");
  assert.equal(result.exitCode, 0);
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "passed");
});

test("cursor-vendored adversarialVerify: spurious implementerOutput key is ignored — independence is structural", async () => {
  const dir = fixtureDir("sig-guard");
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "fail" });
  const result = await adversarialVerify({
    diff: "--- a/foo.ts\n+++ b/foo.ts",
    acceptanceCriteria: ["all tests pass"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    implementerOutput: "I SWEAR IT ALL PASSED",  // spurious — must be ignored
    _runner: failRunner,
  });
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed",
    "a passing self-report must NOT override a failing breakCondition");
  assert.equal(result.exitCode, 1);
});

test("cursor-vendored adversarialVerify: structural signature guard — no implementer self-report param", () => {
  assert.ok(
    !/implementer[_-]?output|self[_-]?report/i.test(adversarialVerify.toString()),
    "adversarialVerify must not reference any implementer self-report param — independence is structural",
  );
});

test("cursor-vendored adversarialVerify: real defaultCommandRunner spawns real child process (no _runner injection)", async () => {
  const dir = fixtureDir("real-runner");

  // 'true' exits 0 → expect passed
  const passResult = await adversarialVerify({
    diff: "informational only",
    acceptanceCriteria: ["exit 0"],
    breakCondition: { adapter: "cli", config: { command: "true" } },
    cwd: dir,
    // _runner intentionally omitted — exercises the real defaultCommandRunner
  });
  assert.equal(passResult.exitCode, 0, "real 'true' command must exit 0");
  assert.equal(passResult.audit, "VERIFICATION_AUDIT: passed", "real 'true' must produce passed audit");

  // 'false' exits 1 → expect failed
  const failResult = await adversarialVerify({
    diff: "informational only",
    acceptanceCriteria: ["exit non-zero"],
    breakCondition: { adapter: "cli", config: { command: "false" } },
    cwd: dir,
    // _runner intentionally omitted
  });
  assert.notEqual(failResult.exitCode, 0, "real 'false' command must exit non-zero");
  assert.equal(failResult.audit, "VERIFICATION_AUDIT: failed", "real 'false' must produce failed audit");
});

test("cursor-vendored adversarialVerify: evidence conforms to verification-evidence/v1 for both pass and fail", async () => {
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
