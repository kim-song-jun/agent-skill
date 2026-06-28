// run-lease.mjs — a worktree-level lease so two concurrent /agent-all runs on the
// same repo coordinate instead of silently clobbering each other. One active run
// per worktree: Phase 0 checks the lease and surfaces a decision if another, live
// session holds it; a lease whose heartbeat has gone stale is takeable (the holder
// died). Atomic tmp+rename writes, consistent with the rest of the harness.
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";

// A run whose heartbeat is older than this is treated as abandoned (takeable).
export const LEASE_STALE_MS = 15 * 60 * 1000; // 15 minutes

function leasePath(cwd) {
  return join(cwd, ".agent-skill", "runs", "active-lease.json");
}

function readLease(path) {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function atomicWriteJson(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}

// Returns the lease state relative to `sessionId` at time `now`:
//   "free"          — no lease
//   "own"           — held by this session (may also be `stale` if our heartbeat lapsed)
//   "stale"         — held by another session whose heartbeat is older than the window (takeable)
//   "held-by-other" — held by another session, still fresh (a real concurrent run)
export function checkRunLease({ cwd, sessionId, now = Date.now(), staleMs = LEASE_STALE_MS }) {
  const lease = readLease(leasePath(cwd));
  if (!lease) return { state: "free", lease: null };
  const beat = Number(lease.heartbeat) || Number(lease.startedAt) || 0;
  const ageMs = now - beat;
  const stale = ageMs > staleMs;
  if (lease.sessionId === sessionId) return { state: "own", lease, stale, ageMs };
  if (stale) return { state: "stale", lease, stale: true, ageMs };
  return { state: "held-by-other", lease, stale: false, ageMs };
}

export function acquireRunLease({ cwd, sessionId, runId = null, task = null, now = Date.now() }) {
  const lease = {
    schemaVersion: "run-lease/v1",
    sessionId,
    runId,
    task,
    startedAt: now,
    heartbeat: now,
  };
  atomicWriteJson(leasePath(cwd), lease);
  return lease;
}

export function refreshRunLease({ cwd, sessionId, now = Date.now() }) {
  const path = leasePath(cwd);
  const lease = readLease(path);
  if (!lease || lease.sessionId !== sessionId) return false; // never touch another session's lease
  lease.heartbeat = now;
  atomicWriteJson(path, lease);
  return true;
}

export function releaseRunLease({ cwd, sessionId }) {
  const path = leasePath(cwd);
  const lease = readLease(path);
  if (lease && lease.sessionId !== sessionId) return false; // never release another session's lease
  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch {
      return false;
    }
  }
  return true;
}
