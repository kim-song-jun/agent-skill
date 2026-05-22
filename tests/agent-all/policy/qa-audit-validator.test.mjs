import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQaAudit } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/qa-audit-validator.mjs";

test("accepts QA reviewer output with QA_AUDIT: passed", () => {
  const text = "Review complete from the persona's perspective.\nQA_AUDIT: passed";
  assert.equal(validateQaAudit(text).ok, true);
});

test("accepts QA_AUDIT: failed", () => {
  const text = "Two scenarios missing.\nQA_AUDIT: failed";
  assert.equal(validateQaAudit(text).ok, true);
});

test("accepts QA_AUDIT: skipped (e.g., internal refactor with no user-visible change)", () => {
  const text = "QA_AUDIT: skipped — refactor, no user-facing change";
  assert.equal(validateQaAudit(text).ok, true);
});

test("rejects when token missing entirely", () => {
  const text = "Looks good from the user's side.";
  const r = validateQaAudit(text);
  assert.equal(r.ok, false);
  assert.match(r.reason, /QA_AUDIT/);
});

test("rejects when audit value is something else", () => {
  const text = "QA_AUDIT: maybe";
  assert.equal(validateQaAudit(text).ok, false);
});

test("rejects case-mismatched token (machine contract is strict)", () => {
  const text = "qa_audit: passed";
  assert.equal(validateQaAudit(text).ok, false);
});
