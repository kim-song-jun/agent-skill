import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateStop, reapState } from "../../plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs";

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
  assert.match(out.reason, /phases\/3-dispatch\.md/);
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

// ── Orphan handling: evaluateStop logic matrix (pure function, no I/O) ──────────
const NOW = Date.parse("2026-06-29T12:00:00Z");
const MIN = 60 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();
const ev = (state, lease = null, sessionId = "S1") => evaluateStop({ state, lease, now: NOW, sessionId });
const orphan = (extra = {}) => ({
  status: "running", runId: "AA1", sessionId: null, task: null,
  updatedAt: ago(20 * MIN), awaitingUser: null, phases: [{ phase: 0 }], ...extra,
});

test("REGRESSION: fresh no-task phase-0 orphan does NOT block (the trap) and is not reaped", () => {
  // The exact case the user hit: status:running, task:null, sessionId:null, phase 0, ~5m stale.
  const d = ev(orphan({ updatedAt: ago(5 * MIN) }));
  assert.equal(d.action, "allow", "must not block — there is no task to continue");
  assert.ok(!d.reap, "too fresh (<15m) → unblock read-only, never auto-abort a possibly-live run");
});

test("stale no-task orphan (ownerless) → allow + reap that exact run", () => {
  const d = ev(orphan());
  assert.equal(d.action, "allow");
  assert.deepEqual(d.reap, { runId: "AA1", updatedAt: ago(20 * MIN) });
});

test("stale no-task orphan owned by us → allow + reap", () => {
  const d = ev(orphan({ runId: "AA2", sessionId: "S1" }), null, "S1");
  assert.equal(d.action, "allow");
  assert.equal(d.reap?.runId, "AA2");
});

test("fresh foreign lease over a stale orphan → allow, never reap (concurrency veto)", () => {
  const d = ev(orphan(), { sessionId: "C", heartbeat: NOW });
  assert.equal(d.action, "allow");
  assert.ok(!d.reap, "another session is live on this worktree — must not touch its state");
});

test("dead-lease run WITH real progress → allow, but not reaped (work survives for --resume)", () => {
  const state = { status: "running", runId: "AA3", sessionId: null, task: "build X",
    updatedAt: ago(20 * MIN), awaitingUser: null, phases: [{ phase: 0 }, { phase: 1 }, { phase: 2 }] };
  const d = ev(state, { sessionId: "C", heartbeat: NOW - 20 * MIN }); // lease stale (epoch ms, real format)
  assert.equal(d.action, "allow", "dead lease → stop force-continuing");
  assert.ok(!d.reap, "maxPhase>0 → do not destroy real work after just 15m");
});

test("12h zombie (ownerless) → allow + reap even with progress", () => {
  const state = { status: "running", runId: "AA4", sessionId: null, task: "x",
    updatedAt: ago(13 * 60 * MIN), awaitingUser: null, phases: [{ phase: 2 }] };
  const d = ev(state);
  assert.equal(d.action, "allow");
  assert.equal(d.reap?.runId, "AA4");
});

test("PRESERVED: healthy mid-pipeline run still blocks from the next phase", () => {
  const state = { status: "running", runId: "AA5", sessionId: null, task: "x",
    updatedAt: new Date(NOW).toISOString(), awaitingUser: null, phases: [{ phase: 0 }, { phase: 1 }, { phase: 2 }] };
  const d = ev(state);
  assert.equal(d.action, "block");
  assert.match(d.reason, /Phase 3/);
});

// ── reapState CAS contract (prevents clobbering a run someone else rewrote) ─────
test("reapState writes aborted when the on-disk record still matches", () => {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ status: "running", runId: "R1", updatedAt: "U1", phases: [{ phase: 0 }] }));
  const ok = reapState({ statePath, expect: { runId: "R1", updatedAt: "U1" }, now: NOW });
  assert.equal(ok, true);
  const after = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(after.status, "aborted");
  assert.equal(after.abortedReason, "orphan-reaped-by-stop-hook");
});

test("reapState SKIPS the write when the record changed (CAS miss → no clobber)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  const statePath = join(dir, ".agent-all-state.json");
  // A different/fresh run now occupies the file (e.g. another session started one).
  writeFileSync(statePath, JSON.stringify({ status: "running", runId: "R2", updatedAt: "U2", phases: [{ phase: 0 }] }));
  const ok = reapState({ statePath, expect: { runId: "R1", updatedAt: "U1" }, now: NOW });
  assert.equal(ok, false);
  const after = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(after.status, "running", "the newer run must be left untouched");
  assert.equal(after.runId, "R2");
});

// ── End-to-end (subprocess): the actual file write / no-write side effects ──────
function projectWithLease(stateObj, leaseObj) {
  const dir = mkdtempSync(join(tmpdir(), "ac-"));
  writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify(stateObj));
  if (leaseObj) {
    mkdirSync(join(dir, ".agent-skill", "runs"), { recursive: true });
    writeFileSync(join(dir, ".agent-skill", "runs", "active-lease.json"), JSON.stringify(leaseObj));
  }
  return dir;
}

test("E2E: stale no-task orphan is self-healed to aborted on disk", () => {
  const state = { status: "running", runId: "AA1", sessionId: null, task: null,
    updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), awaitingUser: null, phases: [{ phase: 0 }] };
  const dir = projectWithLease(state, null);
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "", "allow the stop");
  const after = JSON.parse(readFileSync(join(dir, ".agent-all-state.json"), "utf-8"));
  assert.equal(after.status, "aborted");
});

test("E2E: fresh foreign lease leaves the orphan file untouched", () => {
  const state = { status: "running", runId: "AA1", sessionId: null, task: null,
    updatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(), awaitingUser: null, phases: [{ phase: 0 }] };
  const lease = { sessionId: "C", heartbeat: Date.now() }; // fresh, another session
  const dir = projectWithLease(state, lease);
  const { stdout } = runHook({ stop_hook_active: false, session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "", "allow the stop");
  const after = JSON.parse(readFileSync(join(dir, ".agent-all-state.json"), "utf-8"));
  assert.equal(after.status, "running", "must not reap another live session's run");
});
