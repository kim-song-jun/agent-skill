/**
 * DEFECT G2 — Real behavioral tests for adversarialAuditBlocks() pure block function.
 * Tests the actual string-contract behavior; no mocks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  adversarialAuditBlocks,
  ADVERSARIAL_ROLE,
} from "../../../plugins/harness-floor/skills/agent-all/lib/policy/audit-tokens.mjs";

test("adversarialAuditBlocks: VERIFICATION_AUDIT: failed => blocked=true", () => {
  const result = adversarialAuditBlocks("VERIFICATION_AUDIT: failed");
  assert.equal(result.blocked, true);
  assert.equal(result.verdict, "failed");
  assert.equal(result.role, ADVERSARIAL_ROLE);
});

test("adversarialAuditBlocks: VERIFICATION_AUDIT: passed => blocked=false", () => {
  const result = adversarialAuditBlocks("VERIFICATION_AUDIT: passed");
  assert.equal(result.blocked, false);
  assert.equal(result.verdict, "passed");
  assert.equal(result.role, ADVERSARIAL_ROLE);
});

test("adversarialAuditBlocks: VERIFICATION_AUDIT: skipped => blocked=false", () => {
  const result = adversarialAuditBlocks("VERIFICATION_AUDIT: skipped");
  assert.equal(result.blocked, false);
  assert.equal(result.verdict, "skipped");
  assert.equal(result.role, ADVERSARIAL_ROLE);
});

test("adversarialAuditBlocks: no token => blocked=false, verdict=null (distinguishes from passed)", () => {
  const result = adversarialAuditBlocks("no token here — reviewer did not emit audit");
  assert.equal(result.blocked, false);
  assert.equal(result.verdict, null, "missing token returns null verdict, not 'passed'");
  assert.equal(result.role, ADVERSARIAL_ROLE);
});

test("adversarialAuditBlocks: multi-line report with VERIFICATION_AUDIT: failed buried in prose => blocked=true", () => {
  const multiLineReport = [
    "## Adversarial Verification Report",
    "",
    "Re-derived verdict independently from diff and wave tip commit.",
    "",
    "### Evidence",
    "- Diff shows missing error handling in src/auth.ts:42",
    "- Test suite does not cover the failure path",
    "- Build output shows no regression tests added",
    "",
    "### Verdict",
    "VERIFICATION_AUDIT: failed",
    "",
    "The implementation does not meet the acceptance criteria.",
  ].join("\n");

  const result = adversarialAuditBlocks(multiLineReport);
  assert.equal(result.blocked, true, "buried VERIFICATION_AUDIT: failed in multi-line prose must still block");
  assert.equal(result.verdict, "failed");
});

test("adversarialAuditBlocks: null/undefined input => blocked=false gracefully", () => {
  assert.equal(adversarialAuditBlocks(null).blocked, false);
  assert.equal(adversarialAuditBlocks(undefined).blocked, false);
  assert.equal(adversarialAuditBlocks("").blocked, false);
});

test("ADVERSARIAL_ROLE matches the gate-plan dispatch role", () => {
  assert.equal(ADVERSARIAL_ROLE, "verification-reviewer-adversarial");
});
