#!/usr/bin/env node
// SessionStart hook (project-scoped). Jobs:
//   0. (every source) persist this session's id to .agent-skill/runs/current-session.json
//      so Phase 0 can claim run ownership — the skill runtime has no reliable path to session_id.
//   A. (every source) git-integrity check: warn if .git/HEAD is missing/malformed — the
//      signature of the shared-worktree incident (a concurrent session or crash clobbering
//      the repo, e.g. `git clean -fd` / `reset --hard` / a direct .git/HEAD delete). Advisory.
//   1. (source compact|resume) if an agent-all run is IN-FLIGHT, re-inject a directive naming the
//      next phase to continue from, so the run survives an in-session compaction.
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync, statSync } from "node:fs";
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

function integrityMsg(detail) {
  return `⚠️ GIT INTEGRITY: ${detail} in this worktree — a concurrent session or crash may have clobbered the repo `
    + `(the known shared-worktree incident: .git/HEAD + tracked files deleted). STOP before any git operation: run `
    + `'git status'; if HEAD is gone, restore it (e.g. write 'ref: refs/heads/main' into .git/HEAD) from a known-good `
    + `state. Do not commit or push until the repo is healthy.`;
}

// Inline (no lib import — hooks must be self-contained on installed layouts). Returns a warning
// string only when .git EXISTS but its HEAD is missing/malformed; "" for healthy or non-git dirs.
function gitIntegrityWarning(cwd) {
  try {
    const dotgit = resolve(cwd, ".git");
    if (!existsSync(dotgit)) return ""; // not a git project — never false-positive
    let gitDir = dotgit;
    if (statSync(dotgit).isFile()) {
      // worktree/submodule: .git is a "gitdir: <path>" pointer
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotgit, "utf-8"));
      if (!m) return "";
      gitDir = resolve(cwd, m[1]);
      if (!existsSync(gitDir)) return integrityMsg(`the linked git dir (${m[1]}) is missing`);
    }
    let head;
    try {
      head = readFileSync(join(gitDir, "HEAD"), "utf-8").trim();
    } catch {
      return integrityMsg(".git/HEAD is missing");
    }
    if (!/^(ref:\s*refs\/|[0-9a-f]{7,40}\s*$)/m.test(head)) return integrityMsg(".git/HEAD is malformed");
    return "";
  } catch {
    return ""; // an integrity-check error must never break SessionStart
  }
}

function computeResumeDirective(cwd, sessionId) {
  let state;
  try {
    state = JSON.parse(readFileSync(resolve(cwd, ".agent-all-state.json"), "utf-8"));
  } catch {
    return ""; // absent/unparseable → nothing to resume
  }
  try {
    if (!state || state.status !== "running") return "";
    if (state.sessionId && sessionId && state.sessionId !== sessionId) return ""; // not our run
    const updatedAt = Date.parse(state.updatedAt || "");
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt > STALE_AFTER_MS) return "";
    const phases = Array.isArray(state.phases) ? state.phases : [];
    const completed = phases.map((p) => Number(p.phase)).filter(Number.isFinite);
    const maxPhase = completed.length ? Math.max(...completed) : -1;
    const nextPhase = maxPhase + 1;
    if (nextPhase > 6) return "";
    const list = completed.length ? [...completed].sort((a, b) => a - b).join(", ") : "none";
    const runId = state.runId ? String(state.runId) : "unknown";
    // Optional semantic-memory pointer: the project wiki page for this task (recorded by
    // Phase 2 as state.wikiPage). Points at the WHY (plan, decisions, rationale) — a pointer,
    // not a context dump. Omitted when the wiki auto-loop is off or the page isn't recorded yet.
    const wikiLine = state.wikiPage
      ? `Relevant wiki: ${state.wikiPage} (recorded plan, decisions & rationale). `
      : "";
    return (
      `⚠️ A /agent-all run (${runId}) is IN PROGRESS — not finished. ` +
      `Completed phases: ${list}. NEXT: Phase ${nextPhase} (${PHASE_NAME[nextPhase]}). ` +
      `This context was just compacted, so your run memory may be incomplete. ` +
      `Re-read the agent-all SKILL and phases/${PHASE_SLUG[nextPhase]}.md, then CONTINUE from Phase ${nextPhase}. ` +
      `Do NOT stop after the plan; do NOT restart from Phase 0. ` +
      `If you intended to start a different task, ignore this and proceed with the new request. ` +
      wikiLine +
      `Progress SSOT: .agent-all-state.json.`
    );
  } catch (err) {
    warn("emit resume directive", err);
    return "";
  }
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

// Step A — git integrity (every source). Step 1 — resume directive (compact|resume only).
const integrityCtx = gitIntegrityWarning(cwd);
const resumeCtx = (source === "compact" || source === "resume") ? computeResumeDirective(cwd, sessionId) : "";

const additionalContext = [integrityCtx, resumeCtx].filter(Boolean).join(" ");
if (additionalContext) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }) + "\n");
}
process.exit(0);
