import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReviewerAudit } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/reviewer-audit-validator.mjs";

test("accepts reviewer output with VERIFICATION_AUDIT: passed", () => {
  const text = "Review complete.\nVERIFICATION_AUDIT: passed";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, true);
});

test("accepts VERIFICATION_AUDIT: failed", () => {
  const text = "Issues found.\nVERIFICATION_AUDIT: failed";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, true);
});

test("accepts VERIFICATION_AUDIT: skipped", () => {
  const text = "VERIFICATION_AUDIT: skipped";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, true);
});

test("rejects when token is missing", () => {
  const text = "Review complete. Looks good.";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, false);
  assert.match(r.reason, /VERIFICATION_AUDIT/);
});

test("rejects when audit value is something else", () => {
  const text = "VERIFICATION_AUDIT: maybe";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, false);
});
