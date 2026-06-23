import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs";

function runHook(payload, projectDir) {
  try {
    const stdout = execFileSync("node", [HOOK], {
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stdout: stdout.toString() };
  } catch (e) {
    return { code: e.status, stdout: (e.stdout || "").toString() };
  }
}
function project(stateObj) {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  if (stateObj) writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify(stateObj));
  return dir;
}
const running = (extra = {}) => ({
  status: "running", runId: "R1", sessionId: null,
  updatedAt: new Date().toISOString(),
  awaitingUser: null,
  phases: [{ phase: 0 }, { phase: 1 }, { phase: 2 }], ...extra,
});
function blocked(stdout) {
  const out = JSON.parse(stdout);
  return out.decision === "block" ? out : null;
}

test("running + mid-pipeline blocks the stop with a continue directive", () => {
  const dir = project(running());
  const { code, stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(code, 0);
  const out = blocked(stdout);
  assert.ok(out, "must emit decision:block");
  assert.match(out.reason, /Phase 3/);
  assert.match(out.reason, /Do NOT stop/i);
});

test("stop_hook_active true allows the stop (loop guard)", () => {
  const dir = project(running());
  const { stdout } = runHook({ stop_hook_active: true, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("status done allows the stop", () => {
  const dir = project(running({ status: "done" }));
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("fresh awaitingUser allows the stop", () => {
  const dir = project(running({ awaitingUser: { at: new Date().toISOString() } }));
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("stale awaitingUser does NOT allow the stop (blocks)", () => {
  const old = new Date(Date.now() - 11 * 60 * 1000).toISOString(); // > 10m TTL
  const dir = project(running({ awaitingUser: { at: old } }));
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.ok(blocked(stdout), "stale awaitingUser must not suppress enforcement");
});

test("no state file allows the stop", () => {
  const dir = project(null);
  const { code, stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
});

test("nextPhase > 6 allows the stop", () => {
  const dir = project(running({ phases: [{ phase: 6 }] }));
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("stale run (updatedAt > 12h) allows the stop", () => {
  const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  const dir = project(running({ updatedAt: old }));
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("foreign session ownership allows the stop", () => {
  const dir = project(running({ sessionId: "OWNER" }));
  const { stdout } = runHook({ stop_hook_active: false, session_id: "OTHER" }, dir);
  assert.equal(stdout.trim(), "");
});

test("malformed state is non-fatal and allows the stop", () => {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  writeFileSync(join(dir, ".agent-all-state.json"), "{ not json");
  const { code, stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
});
