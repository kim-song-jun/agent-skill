#!/usr/bin/env node
// SessionStart hook (project-scoped). Two jobs:
//   0. (every source) persist this session's id to .agent-skill/runs/current-session.json
//      so Phase 0 can claim run ownership — the skill runtime has no reliable path to session_id.
//   1. (source compact|resume) if an agent-all run is IN-FLIGHT, re-inject a directive naming the
//      next phase to continue from, so the run survives an in-session compaction.
import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";

const HOOK_NAME = "session-resume";
const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12h
const PHASE_SLUG = { 0: "0-preflight", 1: "1-intent", 2: "2-plan", 3: "3-dispatch", 4: "4-gate", 5: "5-pr", 6: "6-loop" };
const PHASE_NAME = { 0: "Preflight", 1: "Intent", 2: "Plan", 3: "Dispatch", 4: "Gate", 5: "PR", 6: "Loop" };

function warn(action, err) {
  const msg = (err && err.message ? String(err.message) : String(err)).split(/\r?\n/, 1)[0].slice(0, 200);
  console.error(`agent-skill hook warning: ${HOOK_NAME}: ${action}: ${msg}`);
}
function atomicWrite(path, text) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf-8") || "{}"); } catch { /* empty/no stdin */ }

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const source = String(payload.source || "");
const sessionId = payload.session_id ? String(payload.session_id) : null;

// Step 0 — record the live session id on EVERY source.
try {
  if (sessionId) {
    const dir = resolve(cwd, ".agent-skill", "runs");
    mkdirSync(dir, { recursive: true });
    atomicWrite(join(dir, "current-session.json"), JSON.stringify({ sessionId, at: new Date().toISOString() }));
  }
} catch (err) { warn("write current-session.json", err); }

// Step 1 — directive only on compact|resume.
if (source !== "compact" && source !== "resume") process.exit(0);

let state;
try { state = JSON.parse(readFileSync(resolve(cwd, ".agent-all-state.json"), "utf-8")); }
catch { process.exit(0); } // absent/unparseable → nothing to resume

try {
  if (!state || state.status !== "running") process.exit(0);
  if (state.sessionId && sessionId && state.sessionId !== sessionId) process.exit(0); // not our run
  const updatedAt = Date.parse(state.updatedAt || "");
  if (Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_AFTER_MS) process.exit(0);
  const phases = Array.isArray(state.phases) ? state.phases : [];
  const completed = phases.map((p) => Number(p.phase)).filter(Number.isFinite);
  const maxPhase = completed.length ? Math.max(...completed) : -1;
  const nextPhase = maxPhase + 1;
  if (nextPhase > 6) process.exit(0);
  const list = completed.length ? [...completed].sort((a, b) => a - b).join(", ") : "none";
  const runId = state.runId ? String(state.runId) : "unknown";
  const directive =
    `⚠️ A /agent-all run (${runId}) is IN PROGRESS — not finished. ` +
    `Completed phases: ${list}. NEXT: Phase ${nextPhase} (${PHASE_NAME[nextPhase]}). ` +
    `This context was just compacted, so your run memory may be incomplete. ` +
    `Re-read the agent-all SKILL and phases/${PHASE_SLUG[nextPhase]}.md, then CONTINUE from Phase ${nextPhase}. ` +
    `Do NOT stop after the plan; do NOT restart from Phase 0. ` +
    `If you intended to start a different task, ignore this and proceed with the new request. ` +
    `Progress SSOT: .agent-all-state.json.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: directive } }) + "\n");
} catch (err) { warn("emit resume directive", err); }
process.exit(0);
