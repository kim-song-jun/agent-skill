import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkRunLease,
  acquireRunLease,
  refreshRunLease,
  releaseRunLease,
  LEASE_STALE_MS,
} from "../../../plugins/harness-floor/skills/agent-all/lib/run-lease.mjs";

function fresh() {
  return mkdtempSync(join(tmpdir(), "run-lease-"));
}
const T0 = 1_000_000_000_000;

test("no lease → state 'free'", () => {
  const cwd = fresh();
  try {
    assert.equal(checkRunLease({ cwd, sessionId: "S1", now: T0 }).state, "free");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("acquire then check by the SAME session → 'own'", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "S1", runId: "R1", task: "t", now: T0 });
    const r = checkRunLease({ cwd, sessionId: "S1", now: T0 + 1000 });
    assert.equal(r.state, "own");
    assert.equal(r.lease.sessionId, "S1");
    assert.ok(existsSync(join(cwd, ".agent-skill/runs/active-lease.json")));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("a fresh lease held by ANOTHER session → 'held-by-other'", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "OWNER", runId: "R1", now: T0 });
    const r = checkRunLease({ cwd, sessionId: "OTHER", now: T0 + 5000 });
    assert.equal(r.state, "held-by-other");
    assert.equal(r.lease.sessionId, "OWNER");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("a lease whose heartbeat is older than the stale window → 'stale' (takeable)", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "DEAD", runId: "R1", now: T0 });
    const r = checkRunLease({ cwd, sessionId: "OTHER", now: T0 + LEASE_STALE_MS + 1 });
    assert.equal(r.state, "stale");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("refresh updates the heartbeat for the OWN session and keeps it fresh", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "S1", runId: "R1", now: T0 });
    // Without refresh it would be stale; refresh moves the heartbeat forward.
    const ok = refreshRunLease({ cwd, sessionId: "S1", now: T0 + LEASE_STALE_MS - 1 });
    assert.equal(ok, true);
    const r = checkRunLease({ cwd, sessionId: "OTHER", now: T0 + LEASE_STALE_MS + 1 });
    assert.equal(r.state, "held-by-other", "refreshed heartbeat keeps the lease alive");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("refresh refuses to touch ANOTHER session's lease", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "OWNER", now: T0 });
    assert.equal(refreshRunLease({ cwd, sessionId: "OTHER", now: T0 + 1 }), false);
    assert.equal(checkRunLease({ cwd, sessionId: "X", now: T0 + 2 }).lease.sessionId, "OWNER");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("acquire OVERWRITES a stale lease (takeover) and the new owner holds it", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "DEAD", now: T0 });
    acquireRunLease({ cwd, sessionId: "NEW", runId: "R2", now: T0 + LEASE_STALE_MS + 1 });
    const r = checkRunLease({ cwd, sessionId: "NEW", now: T0 + LEASE_STALE_MS + 2 });
    assert.equal(r.state, "own");
    assert.equal(r.lease.sessionId, "NEW");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("release removes the OWN lease; refuses to remove another session's", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "S1", now: T0 });
    assert.equal(releaseRunLease({ cwd, sessionId: "OTHER" }), false, "cannot release another session's lease");
    assert.ok(existsSync(join(cwd, ".agent-skill/runs/active-lease.json")));
    assert.equal(releaseRunLease({ cwd, sessionId: "S1" }), true);
    assert.equal(checkRunLease({ cwd, sessionId: "S1", now: T0 + 1 }).state, "free");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("lease file is written atomically as schema run-lease/v1", () => {
  const cwd = fresh();
  try {
    acquireRunLease({ cwd, sessionId: "S1", runId: "R1", task: "build x", now: T0 });
    const lease = JSON.parse(readFileSync(join(cwd, ".agent-skill/runs/active-lease.json"), "utf-8"));
    assert.equal(lease.schemaVersion, "run-lease/v1");
    assert.equal(lease.sessionId, "S1");
    assert.equal(lease.heartbeat, T0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
