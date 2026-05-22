import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDecisionPayload } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs";

test("accepts a well-formed NEEDS_DECISIONS payload", () => {
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "Add OAuth" },
    decisions: [{
      id: "d1",
      title: "Token storage",
      context: "Cookies vs localStorage",
      options: [
        { label: "Cookie", description: "secure httpOnly" },
        { label: "localStorage", description: "matches JWT pattern" },
      ],
      recommended_index: 0,
      reasoning: "Aligns with existing session pattern",
    }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("rejects payload with fewer than 2 options", () => {
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [{
      id: "d1", title: "X", context: "X",
      options: [{ label: "only", description: "x" }],
      recommended_index: 0, reasoning: "x",
    }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /at least 2 options/);
});

test("rejects payload with more than 4 options", () => {
  const opts = Array.from({ length: 5 }, (_, i) => ({ label: `o${i}`, description: "x" }));
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [{ id: "d1", title: "X", context: "X", options: opts, recommended_index: 0, reasoning: "x" }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /at most 4 options/);
});

test("rejects payload where recommended_index is out of range", () => {
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [{
      id: "d1", title: "X", context: "X",
      options: [{ label: "a", description: "x" }, { label: "b", description: "y" }],
      recommended_index: 5, reasoning: "x",
    }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /recommended_index/);
});

test("accepts NO_DECISIONS as a degenerate but valid status", () => {
  const payload = { status: "NO_DECISIONS", scope: { task_id: "t1", task_title: "X" } };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, true);
});
