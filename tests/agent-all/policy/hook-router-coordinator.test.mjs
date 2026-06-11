import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve("plugins/harness-floor/bin/floor-policy-hook.mjs");

function runHook(event, payload) {
  return spawnSync(process.execPath, [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: { ...process.env, AGENT_POLICY_AUDIT: "0" },
  });
}

test("PreToolUse on Orchestration Gate injects orchestration audit directive", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "Orchestration Gate Task 3: Shared lockfile", prompt: "inspect wave" },
  });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /ORCHESTRATION_AUDIT: passed/);
  assert.doesNotMatch(out.parameters.prompt, /VERIFICATION_AUDIT: passed/);
  assert.doesNotMatch(out.parameters.prompt, /QA_AUDIT: passed/);
});

test("PostToolUse on Orchestration Gate validates ORCHESTRATION_AUDIT", () => {
  const ok = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Orchestration Gate Task 3: Shared lockfile" },
    result: "HOT files serialized.\nORCHESTRATION_AUDIT: passed",
  });
  assert.equal(ok.status, 0, ok.stderr);

  const missing = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Orchestration Gate Task 3: Shared lockfile" },
    result: "HOT files serialized.",
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /ORCHESTRATION_AUDIT/);
});

test("Spec Review Task stays on the technical reviewer audit route", () => {
  const pre = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "Spec Review Task 3: Shared lockfile", prompt: "review spec" },
  });
  assert.equal(pre.status, 0, pre.stderr);
  const out = JSON.parse(pre.stdout);
  assert.match(out.parameters.prompt, /VERIFICATION_AUDIT: passed/);
  assert.doesNotMatch(out.parameters.prompt, /ORCHESTRATION_AUDIT: passed/);
  assert.doesNotMatch(out.parameters.prompt, /QA_AUDIT: passed/);

  const missing = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Spec Review Task 3: Shared lockfile" },
    result: "Spec matches.",
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /VERIFICATION_AUDIT/);
});
