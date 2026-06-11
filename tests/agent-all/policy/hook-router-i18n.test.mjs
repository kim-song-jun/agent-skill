import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve("plugins/harness-floor/bin/floor-policy-hook.mjs");

function runHook(event, payload, env = {}) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
    env: { ...process.env, AGENT_POLICY_AUDIT: "0", ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("AGENT_ALL_LANGUAGE=ko injects Korean addendum into implementer dispatch", () => {
  const r = runHook(
    "PreToolUse",
    { tool: "Task", parameters: { description: "Implement Task 1: foo", prompt: "do the thing" } },
    { AGENT_ALL_LANGUAGE: "ko" },
  );
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /Decision-Surfacing 프로토콜/);
  assert.doesNotMatch(out.parameters.prompt, /Decision-Surfacing Protocol/);
});

test("AGENT_ALL_LANGUAGE=ko injects Korean reviewer directive into reviewer dispatch", () => {
  const r = runHook(
    "PreToolUse",
    { tool: "Task", parameters: { description: "Review Task 1: foo", prompt: "review please" } },
    { AGENT_ALL_LANGUAGE: "ko" },
  );
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /리뷰 마지막에/);
  // The machine-parsed token MUST stay English regardless of language.
  assert.match(out.parameters.prompt, /VERIFICATION_AUDIT: passed/);
});

test("AGENT_ALL_LANGUAGE=en gives English addendum (explicit override)", () => {
  const r = runHook(
    "PreToolUse",
    { tool: "Task", parameters: { description: "Implement Task 1: foo", prompt: "x" } },
    { AGENT_ALL_LANGUAGE: "en", LANG: "ko_KR.UTF-8" },  // env LANG wouldn't win
  );
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /Decision-Surfacing Protocol/);
});
