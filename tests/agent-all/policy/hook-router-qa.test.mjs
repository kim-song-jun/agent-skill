import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve("plugins/harness-floor/bin/floor-policy-hook.mjs");

function runHook(event, payload, env = {}) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: { ...process.env, AGENT_ALL_LANGUAGE: "en", AGENT_POLICY_AUDIT: "0", ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("PreToolUse on 'QA Review Task' injects user-side QA directive", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "QA Review Task 1: Add OAuth", prompt: "the diff" },
  });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /QA team/);
  assert.match(out.parameters.prompt, /persona's perspective/);
  assert.match(out.parameters.prompt, /QA_AUDIT: passed/);
  // Must not pull in the technical-reviewer directive
  assert.doesNotMatch(out.parameters.prompt, /VERIFICATION_AUDIT: passed/);
});

test("PreToolUse on plain 'Review Task' keeps existing Verification directive", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "Review Task 1: Add OAuth", prompt: "the diff" },
  });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /VERIFICATION_AUDIT: passed/);
  assert.doesNotMatch(out.parameters.prompt, /QA team/);
});

test("PreToolUse on persona review tasks injects Verification directive", () => {
  for (const description of [
    "Spec Review Task 1: Add OAuth",
    "Verification Review Task 1: Add OAuth",
    "Security Review Task 1: Add OAuth",
    "Data Review Task 1: Add OAuth",
  ]) {
    const r = runHook("PreToolUse", {
      tool: "Task",
      parameters: { description, prompt: "the diff" },
    });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.parameters.prompt, /VERIFICATION_AUDIT: passed/);
    assert.doesNotMatch(out.parameters.prompt, /QA team/);
  }
});

test("PostToolUse on QA Review accepts QA_AUDIT: passed", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "QA Review Task 1: foo" },
    result: "Walked the persona flow. QA_AUDIT: passed",
  });
  assert.equal(r.code, 0);
});

test("PostToolUse on QA Review rejects when QA_AUDIT token is missing", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "QA Review Task 1: foo" },
    result: "Looks fine.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /QA_AUDIT/);
});

test("PostToolUse on persona review tasks rejects when VERIFICATION_AUDIT token is missing", () => {
  for (const description of [
    "Spec Review Task 1: foo",
    "Verification Review Task 1: foo",
    "Security Review Task 1: foo",
    "Data Review Task 1: foo",
  ]) {
    const r = runHook("PostToolUse", {
      tool: "Task",
      parameters: { description },
      result: "Looks fine.",
    });
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /VERIFICATION_AUDIT/);
  }
});

test("PostToolUse on QA Review does NOT look for VERIFICATION_AUDIT", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "QA Review Task 1: foo" },
    // intentionally only emits VERIFICATION_AUDIT — QA path should reject because QA_AUDIT missing
    result: "Some review text. VERIFICATION_AUDIT: passed",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /QA_AUDIT/);
});

test("Korean QA directive uses Korean prose but English token", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "QA Review Task 1: foo", prompt: "x" },
  }, { AGENT_ALL_LANGUAGE: "ko" });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /QA 팀/);
  // Token must stay English for machine parsing
  assert.match(out.parameters.prompt, /QA_AUDIT: passed/);
});
