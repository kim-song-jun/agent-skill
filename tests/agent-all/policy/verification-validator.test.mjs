import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVerification } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/verification-validator.mjs";

test("accepts a DONE report that includes verification_passed token", () => {
  const text = "STATUS: DONE\nFiles changed: foo.js\nverification_passed: 5/5 tests";
  const r = validateVerification(text);
  assert.equal(r.ok, true);
});

test("rejects a DONE report without verification_passed token", () => {
  const text = "STATUS: DONE\nFiles changed: foo.js";
  const r = validateVerification(text);
  assert.equal(r.ok, false);
  assert.match(r.reason, /verification/);
});

test("ignores reports with non-DONE statuses", () => {
  const text = "STATUS: BLOCKED\nReason: needs context";
  const r = validateVerification(text);
  assert.equal(r.ok, true);
});

test("accepts case-insensitive token match", () => {
  const text = "STATUS: done\nVERIFICATION_PASSED: ok";
  const r = validateVerification(text);
  assert.equal(r.ok, true);
});
