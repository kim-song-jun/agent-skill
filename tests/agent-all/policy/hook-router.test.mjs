import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve("plugins/harness-floor/bin/floor-policy-hook.mjs");

function runHook(event, payload) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("PreToolUse on Task with implementer description injects addendum", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo", prompt: "do the thing" },
  });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /Decision-Surfacing Protocol/);
});

test("PreToolUse on non-Task tool is passthrough", () => {
  const r = runHook("PreToolUse", { tool: "Read", parameters: { file_path: "x" } });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out, { tool: "Read", parameters: { file_path: "x" } });
});

test("PostToolUse on Task with DONE+verification passes through", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo" },
    result: "STATUS: DONE\nverification_passed: ok",
  });
  assert.equal(r.code, 0);
});

test("PostToolUse on Task with DONE but no verification rejects (exit non-zero)", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo" },
    result: "STATUS: DONE\nLooks good.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /verification/);
});

test("PostToolUse on reviewer Task without VERIFICATION_AUDIT rejects", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Review Task 1: foo" },
    result: "STATUS: DONE\nverification_passed: ok\nLooks fine.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /VERIFICATION_AUDIT/);
});
