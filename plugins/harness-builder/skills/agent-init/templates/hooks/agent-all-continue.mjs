#!/usr/bin/env node
// Stop hook (project-scoped). Tier-A enforcement: refuse to end the turn while a
// /agent-all run is mid-pipeline, so an in-session compaction can't strand it at Phase 2.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOOK_NAME = "agent-all-continue";
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;  // 12h
const AWAITING_USER_TTL = 10 * 60 * 1000;     // 10m
const PHASE_SLUG = { 0: "0-preflight", 1: "1-intent", 2: "2-plan", 3: "3-dispatch", 4: "4-gate", 5: "5-pr", 6: "6-loop" };
const PHASE_NAME = { 0: "Preflight", 1: "Intent", 2: "Plan", 3: "Dispatch", 4: "Gate", 5: "PR", 6: "Loop" };

function warn(action, err) {
  const msg = (err && err.message ? String(err.message) : String(err)).split(/\r?\n/, 1)[0].slice(0, 200);
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${msg}`);
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf-8") || "{}"); } catch { process.exit(0); }

// Loop guard: if a Stop-block already fired this cycle, allow the stop.
if (payload.stop_hook_active === true) process.exit(0);

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sessionId = payload.session_id ? String(payload.session_id) : null;

let state;
try { state = JSON.parse(readFileSync(resolve(cwd, ".agent-all-state.json"), "utf-8")); }
catch { process.exit(0); } // no run → allow stop

try {
  if (!state || state.status !== "running") process.exit(0);
  if (state.sessionId && sessionId && state.sessionId !== sessionId) process.exit(0); // not our run
  const updatedAt = Date.parse(state.updatedAt || "");
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_AFTER_MS) process.exit(0); // zombie
  const awaitAt = state.awaitingUser && state.awaitingUser.at ? Date.parse(state.awaitingUser.at) : NaN;
  if (Number.isFinite(awaitAt) && Date.now() - awaitAt <= AWAITING_USER_TTL) process.exit(0); // legit pause
  const phases = Array.isArray(state.phases) ? state.phases : [];
  const completed = phases.map((p) => Number(p.phase)).filter(Number.isFinite);
  const maxPhase = completed.length ? Math.max(...completed) : -1;
  const nextPhase = maxPhase + 1;
  if (nextPhase > 6) process.exit(0); // pipeline complete
  const list = completed.length ? [...completed].sort((a, b) => a - b).join(", ") : "none";
  const reason =
    `A /agent-all run (${state.runId || "unknown"}) is still mid-pipeline (completed phases ${list}). ` +
    `Do NOT stop. Continue from Phase ${nextPhase} (${PHASE_NAME[nextPhase]}): ` +
    `re-read the agent-all SKILL and phases/${PHASE_SLUG[nextPhase]}.md and proceed. ` +
    `If the run is truly finished or you must abort, set status to "done"/"aborted" in .agent-all-state.json first.`;
  process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
} catch (err) { warn("evaluate stop", err); }
process.exit(0);
