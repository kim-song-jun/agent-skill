#!/usr/bin/env node
// Stop hook (project-scoped). Tier-A enforcement: refuse to end the turn while a
// /agent-all run is mid-pipeline, so an in-session compaction can't strand it.
//
// Orphan handling: a run that dies at Phase 0 (state written, but the turn ended
// before Phase 1 captured a `task`) must NOT trap every future turn-end. The hook
// now models liveness off the run LEASE (15-min heartbeat — the authoritative
// signal, matching run-lease.mjs) plus a "no task = nothing to continue" check,
// and self-heals a provably-dead, safely-owned orphan to status:"aborted".
//
// Concurrency (shared worktree, rules 6-10): `.agent-all-state.json` is one file
// shared by every session and this hook now writes it, so the reap is gated on
// staleness (never touch a <15-min run), a compare-and-swap re-read (never clobber
// a run someone else just rewrote), and a fresh-foreign-lease veto. The lease is
// only ever READ here — never written/released (it self-heals on its own window).
import { readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOOK_NAME = "agent-all-continue";
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;  // 12h — legacy zombie backstop (covers no-lease installs)
const AWAITING_USER_TTL = 10 * 60 * 1000;    // 10m — a legit "waiting on the user" pause
const LEASE_STALE_MS = 15 * 60 * 1000;       // 15m — MUST match run-lease.mjs LEASE_STALE_MS (SSOT there;
                                             //       duplicated because this standalone hook can't import the plugin lib)
const PHASE_SLUG = { 0: "0-preflight", 1: "1-intent", 2: "2-plan", 3: "3-dispatch", 4: "4-gate", 5: "5-pr", 6: "6-loop" };
const PHASE_NAME = { 0: "Preflight", 1: "Intent", 2: "Plan", 3: "Dispatch", 4: "Gate", 5: "PR", 6: "Loop" };

function warn(action, err) {
  const msg = (err && err.message ? String(err.message) : String(err)).split(/\r?\n/, 1)[0].slice(0, 200);
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${msg}`);
}

function buildReason(state, completed, nextPhase) {
  const list = completed.length ? [...completed].sort((a, b) => a - b).join(", ") : "none";
  return (
    `A /agent-all run (${state.runId || "unknown"}) is still mid-pipeline (completed phases ${list}). ` +
    `Do NOT stop. Continue from Phase ${nextPhase} (${PHASE_NAME[nextPhase]}): ` +
    `re-read the agent-all SKILL and phases/${PHASE_SLUG[nextPhase]}.md and proceed. ` +
    `If the run is truly finished or you must abort, set status to "done"/"aborted" in .agent-all-state.json first.`
  );
}

// Pure decision. Returns one of:
//   { action: "allow" }                              — end the turn, write nothing
//   { action: "allow", reap: { runId, updatedAt } }  — end the turn, mark this exact orphan aborted
//   { action: "block", reason }                      — refuse to stop, force the next phase
export function evaluateStop({ state, lease, now, sessionId }) {
  if (!state || state.status !== "running") return { action: "allow" };

  // Lease liveness — the authoritative concurrent-run signal.
  const leaseBeat = lease ? Number(lease.heartbeat) || Number(lease.startedAt) || 0 : 0;
  const leaseExists = leaseBeat > 0;
  const leaseStale = leaseExists && now - leaseBeat > LEASE_STALE_MS;
  const leaseForeignFresh = leaseExists && !leaseStale && !!lease.sessionId && lease.sessionId !== sessionId;

  // Not our run to force-continue.
  if (state.sessionId && sessionId && state.sessionId !== sessionId) return { action: "allow" };
  // Another session is actively running on this worktree — never block ours, never touch theirs.
  if (leaseForeignFresh) return { action: "allow" };

  // Legit pause: the orchestrator yielded the turn to wait on the user.
  const awaitAt = state.awaitingUser && state.awaitingUser.at ? Date.parse(state.awaitingUser.at) : NaN;
  if (Number.isFinite(awaitAt) && now - awaitAt <= AWAITING_USER_TTL) return { action: "allow" };

  const phases = Array.isArray(state.phases) ? state.phases : [];
  const completed = phases.map((p) => Number(p.phase)).filter(Number.isFinite);
  const maxPhase = completed.length ? Math.max(...completed) : -1;
  const nextPhase = maxPhase + 1;
  if (nextPhase > 6) return { action: "allow" }; // pipeline complete

  // --- Orphan detection ---
  const updatedAt = Date.parse(state.updatedAt || "");
  const stateStale = Number.isFinite(updatedAt) && now - updatedAt > LEASE_STALE_MS;
  const zombie = Number.isFinite(updatedAt) && now - updatedAt > STALE_AFTER_MS;
  const noTask = state.task == null || state.task === "";
  const orphanNoTask = noTask && maxPhase <= 0;          // never left preflight, no task → nothing to continue
  const orphan = orphanNoTask || leaseStale || zombie;

  if (orphan) {
    // Reap (write aborted) only the clearly-disposable kinds — never a dead-lease run that
    // has real progress (maxPhase>0); that one is allow-stop only and survives for --resume.
    const reapable = orphanNoTask || zombie;
    // Safe owner: our own run, or an ownerless run (leaseForeignFresh already excluded above).
    const safeOwner = (state.sessionId && sessionId && state.sessionId === sessionId) || state.sessionId == null;
    if (reapable && safeOwner && stateStale) {
      return { action: "allow", reap: { runId: state.runId ?? null, updatedAt: state.updatedAt ?? null } };
    }
    return { action: "allow" }; // orphan, but too fresh / not safe / has work → just unblock, read-only
  }

  return { action: "block", reason: buildReason(state, completed, nextPhase) };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

// CAS reap: re-read immediately before the atomic rename and write only if the on-disk
// record is STILL the exact orphan we evaluated — so a fresh run another session just
// wrote into the same file is never clobbered.
export function reapState({ statePath, expect, now }) {
  const cur = readJson(statePath);
  if (!cur || cur.status !== "running") return false;
  if ((cur.runId ?? null) !== expect.runId || (cur.updatedAt ?? null) !== expect.updatedAt) return false;
  const next = { ...cur, status: "aborted", updatedAt: new Date(now).toISOString(), abortedReason: "orphan-reaped-by-stop-hook" };
  const tmp = `${statePath}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  try { const fd = openSync(tmp, "r+"); fsyncSync(fd); closeSync(fd); } catch {}
  renameSync(tmp, statePath);
  return true;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readFileSync(0, "utf-8") || "{}"); } catch { process.exit(0); }

  // Loop guard: if a Stop-block already fired this cycle, allow the stop.
  if (payload.stop_hook_active === true) process.exit(0);

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const sessionId = payload.session_id ? String(payload.session_id) : null;
  const statePath = resolve(cwd, ".agent-all-state.json");

  const state = readJson(statePath);
  if (!state) process.exit(0); // no run → allow stop
  const lease = readJson(resolve(cwd, ".agent-skill", "runs", "active-lease.json"));
  const now = Date.now();

  let decision;
  try { decision = evaluateStop({ state, lease, now, sessionId }); }
  catch (err) { warn("evaluate stop", err); process.exit(0); }

  if (decision.action === "block") {
    process.stdout.write(JSON.stringify({ decision: "block", reason: decision.reason }) + "\n");
    process.exit(0);
  }
  if (decision.reap) {
    try { reapState({ statePath, expect: decision.reap, now }); }
    catch (err) { warn("reap orphan", err); } // write failure is non-fatal — never block the turn on it
  }
  process.exit(0);
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || "").href;
if (isMain) main();
