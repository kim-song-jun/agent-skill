import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCoordinatorAudit } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/coordinator-audit-validator.mjs";

test("accepts coordinator output with ORCHESTRATION_AUDIT: passed", () => {
  assert.deepEqual(validateCoordinatorAudit("HOT files serialized.\nORCHESTRATION_AUDIT: passed"), {
    ok: true,
    status: "passed",
  });
});

test("accepts ORCHESTRATION_AUDIT: failed", () => {
  assert.deepEqual(validateCoordinatorAudit("package.json owner conflict.\nORCHESTRATION_AUDIT: failed"), {
    ok: true,
    status: "failed",
  });
});

test("accepts ORCHESTRATION_AUDIT: skipped", () => {
  assert.deepEqual(validateCoordinatorAudit("No shared files.\nORCHESTRATION_AUDIT: skipped"), {
    ok: true,
    status: "skipped",
  });
});

test("rejects missing or invalid ORCHESTRATION_AUDIT", () => {
  assert.equal(validateCoordinatorAudit("looks fine").ok, false);
  assert.equal(validateCoordinatorAudit("ORCHESTRATION_AUDIT: maybe").ok, false);
});
