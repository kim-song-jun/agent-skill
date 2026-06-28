import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HANDLER = resolve("plugins/harness-floor-copilot/skills/agent-all-copilot/lib/hooks/pre-tool-use-policy.mjs");

function run(payload) {
  const r = spawnSync(process.execPath, [HANDLER], { input: JSON.stringify(payload), encoding: "utf-8" });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: r.stderr || "" };
}

test("denies a dangerous git command on the bash tool (camelCase preToolUse payload)", () => {
  const r = run({ toolName: "bash", toolArgs: { command: "git stash" } });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /git stash/);
});

test("denies via VS Code / Claude snake_case payload (tool_name=Bash, tool_input)", () => {
  const r = run({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git clean -fd" } });
  const out = JSON.parse(r.stdout);
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /git clean/);
});

test("allows a safe git command — empty stdout = default allow", () => {
  const r = run({ toolName: "bash", toolArgs: { command: "git status" } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("ignores non-shell tools (allow)", () => {
  const r = run({ toolName: "view", toolArgs: { path: "README.md" } });
  assert.equal(r.stdout, "");
});

test("a plain-string toolArgs command is handled", () => {
  const r = run({ toolName: "bash", toolArgs: "git push --force" });
  const out = JSON.parse(r.stdout);
  assert.equal(out.permissionDecision, "deny");
});

test("toolArgs as a JSON-encoded string is parsed (the real Copilot v1.0.63 shape)", () => {
  // Live probe showed v1.0.63 sends toolArgs as a JSON STRING, not an object.
  const deny = run({ toolName: "bash", toolArgs: '{"command":"git stash","description":"stash changes"}' });
  const out = JSON.parse(deny.stdout);
  assert.equal(out.permissionDecision, "deny");
  assert.match(out.permissionDecisionReason, /git stash/);

  const allow = run({ toolName: "bash", toolArgs: '{"command":"git status","description":"show status"}' });
  assert.equal(allow.stdout, "", "a safe command in a JSON-string toolArgs is allowed");
});

test("empty / non-JSON stdin is non-fatal (allow, exit 0)", () => {
  const r = spawnSync(process.execPath, [HANDLER], { input: "not json", encoding: "utf-8" });
  assert.equal(r.status, 0);
  assert.equal((r.stdout || "").trim(), "");
});
