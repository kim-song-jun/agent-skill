# agent-all Compaction-Resilient & Multi-Run Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/agent-all` survive an in-session context compaction (and split-across-sessions runs) so it never stalls mid-pipeline (e.g. Phase 2 done, Phase 3 never entered).

**Architecture:** Add a `status`/`runId`/`sessionId`/`updatedAt`/`awaitingUser` lifecycle to `.agent-all-state.json` (Layer 1), then two project-level hooks installed by `agent-init`: a `SessionStart(compact|resume)` hook that re-injects a "continue from Phase N" directive (Tier B), and a `Stop` hook that refuses to end the turn while a run is mid-pipeline (Tier A). Phase 0 gains a sequential multi-session status-guard + session-ownership claim; Phase 3 gains a PROTECT/task overlap adopt-decision; the SKILL gains a compaction-recovery section.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test` (`node --test`), `execFileSync` to drive real hooks, markdown phase-contract tests, Handlebars settings template + snapshot tests.

## Global Constraints

- This is the `agent-skill` repo. Shared worktree: commit ONLY the files this plan names, with `git add -- <paths>`; never `git add -A`/`stash`/`reset`/branch-switch. Verify each commit with `git show --stat HEAD`.
- Hooks must be **non-fatal**: any error → `console.error("agent-skill hook warning: …")` + `process.exit(0)`. A hook must never crash a session.
- Hooks read the project root as `process.env.CLAUDE_PROJECT_DIR || process.cwd()`.
- State writes are atomic (temp file + `renameSync`).
- Tier defaults (verbatim from spec): `STALE_AFTER_MS = 12h`; `AWAITING_USER_TTL = 10m`; `session-resume` acts on `source ∈ {compact, resume}`; Phase 0 status-guard default = **Abort** on a fresh foreign `running` state, **start fresh** on a stale one; PROTECT/task overlap default = **keep protected**.
- Phase→slug map (used by both hooks, identical): `{0:"0-preflight",1:"1-intent",2:"2-plan",3:"3-dispatch",4:"4-gate",5:"5-pr",6:"6-loop"}`. Phase→name map: `{0:"Preflight",1:"Intent",2:"Plan",3:"Dispatch",4:"Gate",5:"PR",6:"Loop"}`.
- **Concurrent** agent-all runs on one worktree are OUT OF SCOPE (interleaved commits). Only sequential multi-session is supported.
- **Not in this plan (deferred to a release task):** version bump 0.7.7→0.7.8, README `2302/2302` count bump, CHANGELOG, provenance/checksum. The `2302/2302` doc-contract assertion is a README *string* check (`tests/lib/release-doc-contract.test.mjs:235`), so adding test files does NOT break the suite during implementation.
- Run the focused test for each task with `node --test <path>`; run the whole suite with `node --test` from the repo root before the final review.

---

## File Structure

| File | Responsibility | Task |
|------|----------------|------|
| `plugins/harness-floor/skills/agent-all/SKILL.md` | Rule 2 state shape + lifecycle rule; "When done"/"On error" status; new "Compaction recovery" section | 1, 6 |
| `plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs` | SessionStart re-injection + session-id capture (NEW) | 2 |
| `plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs` | Stop-hook mid-pipeline enforcement (NEW) | 3 |
| `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs` | register both hooks | 2, 3 |
| `plugins/harness-floor/skills/agent-all/phases/0-preflight.md` | status init + session claim + multi-session guard | 4 |
| `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md` | PROTECT/task overlap adopt-decision | 5 |
| `tests/agent-all/lib/skill-state-lifecycle-contract.test.mjs` | pin Layer-1 doc wiring (NEW) | 1 |
| `tests/agent-init/session-resume-hook.test.mjs` | real-hook behavior (NEW) | 2 |
| `tests/agent-init/agent-all-continue-hook.test.mjs` | real-hook behavior (NEW) | 3 |
| `tests/agent-all/lib/phase0-multisession-contract.test.mjs` | pin Phase 0 wiring (NEW) | 4 |
| `tests/agent-all/lib/phase3-protect-overlap-contract.test.mjs` | pin Phase 3 wiring (NEW) | 5 |
| `tests/agent-all/lib/skill-compaction-recovery-contract.test.mjs` | pin recovery section (NEW) | 6 |
| `tests/lib/__snapshots__/settings.local.json.hbs__*.snap` | regenerated (8 fixtures) | 2, 3 |

---

## Task 1: SKILL state-lifecycle documentation (Layer 1)

Establishes the `.agent-all-state.json` shape that every later task consumes, and the lifecycle rule the orchestrator follows. Doc-only + a contract test that pins the wiring.

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/SKILL.md` (Rule 2 state-shape line; the `## On error` section ~line 168; the `## When done` section ~line 179)
- Test: `tests/agent-all/lib/skill-state-lifecycle-contract.test.mjs`

**Interfaces:**
- Produces (the documented `state` shape consumed by Tasks 2–5):
  - `status`: `"running" | "done" | "aborted"`
  - `runId`: string
  - `sessionId`: string | null
  - `updatedAt`: ISO 8601 string
  - `awaitingUser`: `{ at: <ISO> } | null`
  - Lifecycle rule: every state write refreshes `updatedAt` and keeps `status:"running"` until "When done" sets `"done"` or an abort sets `"aborted"`; set `awaitingUser:{at}` before yielding the turn for an external user action and clear it on resume.

- [ ] **Step 1: Write the failing contract test**

Create `tests/agent-all/lib/skill-state-lifecycle-contract.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILL = resolve("plugins/harness-floor/skills/agent-all/SKILL.md");
const read = () => readFileSync(SKILL, "utf-8");

test("Rule 2 documents the run-status lifecycle fields", () => {
  const body = read();
  assert.match(body, /status[\s\S]{0,80}running[\s\S]{0,40}done[\s\S]{0,40}aborted/i,
    "state shape must list status: running|done|aborted");
  assert.match(body, /updatedAt/, "state shape must include updatedAt");
  assert.match(body, /sessionId/, "state shape must include sessionId");
  assert.match(body, /awaitingUser/, "state shape must include awaitingUser");
  assert.match(body, /every state write[\s\S]{0,120}updatedAt/i,
    "must state the updatedAt refresh rule");
});

test("When done sets status done; On error sets status aborted", () => {
  const body = read();
  const whenDone = body.slice(body.indexOf("## When done"));
  assert.match(whenDone, /status[\s\S]{0,40}["'`]?done/i, "When done must set status:done");
  const onError = body.slice(body.indexOf("## On error"), body.indexOf("## When done"));
  assert.match(onError, /status[\s\S]{0,40}["'`]?aborted/i, "On error must set status:aborted");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/agent-all/lib/skill-state-lifecycle-contract.test.mjs`
Expected: FAIL (current SKILL.md has no `status`/`updatedAt`/`awaitingUser` wording).

- [ ] **Step 3: Update Rule 2 state shape**

In `SKILL.md` Rule 2, find the sentence that begins **"State lives in `.agent-all-state.json`. Shape: `{phases:[{phase,completedAt}], task, plan, …`"**. Extend the shape and append the lifecycle rule. Replace the opening of that shape with:

```markdown
2. **State lives in `.agent-all-state.json`.** Shape: `{status, runId, sessionId, updatedAt, awaitingUser, phases:[{phase,completedAt}], task, plan, waves[], orchestration, iter, costUSD, costTelemetry, prUrl, decisions:{…}, interactions:{…}}`. `status` is `"running"` from Phase 0 until "When done" sets `"done"` (or an abort sets `"aborted"`); `runId` is the run's id (set at Phase 0, reused verbatim on `--resume`); `sessionId` is the owning Claude session id (claimed at Phase 0 from `.agent-skill/runs/current-session.json`, or null); `updatedAt` is an ISO timestamp; `awaitingUser` is `{at:<ISO>}` while the orchestrator is yielding the turn to wait on an external user action, else null. **Every state write refreshes `updatedAt` and keeps `status:"running"`; set `awaitingUser:{at}` right before yielding for an external user action and clear it (set null) when the run resumes.**
```

(Leave the rest of the existing Rule 2 text — `costTelemetry mirrors…`, `orchestration uses…`, the `resumeCheckpoint` note — unchanged, immediately after.)

- [ ] **Step 4: Update "On error" and "When done"**

In the `## On error` section, append a bullet:

```markdown
- On any abort above, set `status:"aborted"` + refresh `updatedAt` in `.agent-all-state.json` before exiting (atomic write) when the orchestrator still controls the write.
```

In the `## When done` section, append a line at the end:

```markdown
Before exiting, set `status:"done"` + refresh `updatedAt` in `.agent-all-state.json` (atomic write) so the SessionStart/Stop hooks treat the run as finished.
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `node --test tests/agent-all/lib/skill-state-lifecycle-contract.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -- plugins/harness-floor/skills/agent-all/SKILL.md tests/agent-all/lib/skill-state-lifecycle-contract.test.mjs
git commit -m "feat(agent-all): document state run-status lifecycle (status/runId/sessionId/updatedAt/awaitingUser)"
git show --stat HEAD
```

---

## Task 2: `session-resume.mjs` SessionStart hook (Layer 2)

The Tier-B re-injection hook + the session-id capture that Phase 0 (Task 4) relies on. Installed by `agent-init`.

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs`
- Modify: `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs` (SessionStart array)
- Modify (regenerate): `tests/lib/__snapshots__/settings.local.json.hbs__*.snap`
- Test: `tests/agent-init/session-resume-hook.test.mjs`

**Interfaces:**
- Consumes: the `state.json` shape from Task 1 (`status`, `runId`, `sessionId`, `updatedAt`, `phases[].phase`); the hook stdin payload `{source, session_id}`.
- Produces: writes `.agent-skill/runs/current-session.json` = `{sessionId, at}` on every invocation; emits `{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:<string>}}` on stdout when a run is in-flight.

- [ ] **Step 1: Write the failing test**

Create `tests/agent-init/session-resume-hook.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = "plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs";

// Returns { code, stdout } — never throws on non-zero (hooks always exit 0 here).
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
  const dir = mkdtempSync(join(tmpdir(), "sr-"));
  if (stateObj) writeFileSync(join(dir, ".agent-all-state.json"), JSON.stringify(stateObj));
  return dir;
}

const running = (extra = {}) => ({
  status: "running", runId: "R1", sessionId: null,
  updatedAt: new Date().toISOString(),
  phases: [{ phase: 0 }, { phase: 1 }, { phase: 2 }], ...extra,
});

test("compact + running[0,1,2] injects a continue-from-Phase-3 directive", () => {
  const dir = project(running());
  const { code, stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Phase 3/);
  assert.match(ctx, /do NOT stop/i);
  assert.match(ctx, /do NOT restart from Phase 0/i);
  assert.match(ctx, /3-dispatch\.md/);
});

test("every source writes current-session.json", () => {
  const dir = project(running());
  runHook({ source: "clear", session_id: "S9" }, dir);
  const cur = JSON.parse(readFileSync(join(dir, ".agent-skill/runs/current-session.json"), "utf-8"));
  assert.equal(cur.sessionId, "S9");
});

test("clear source emits no directive", () => {
  const dir = project(running());
  const { stdout } = runHook({ source: "clear", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("status done emits no directive", () => {
  const dir = project(running({ status: "done" }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("no state file emits no directive", () => {
  const dir = project(null);
  const { code, stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
});

test("stale updatedAt emits no directive", () => {
  const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  const dir = project(running({ updatedAt: old }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("malformed state is non-fatal (exit 0, no directive)", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-"));
  writeFileSync(join(dir, ".agent-all-state.json"), "{ not json");
  const { code, stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), "");
});

test("nextPhase > 6 emits no directive", () => {
  const dir = project(running({ phases: [{ phase: 6 }] }));
  const { stdout } = runHook({ source: "compact", session_id: "S1" }, dir);
  assert.equal(stdout.trim(), "");
});

test("foreign session ownership: state.sessionId != payload → no directive", () => {
  const dir = project(running({ sessionId: "OWNER" }));
  const { stdout } = runHook({ source: "compact", session_id: "OTHER" }, dir);
  assert.equal(stdout.trim(), "");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/agent-init/session-resume-hook.test.mjs`
Expected: FAIL (hook file does not exist → execFileSync errors / non-zero).

- [ ] **Step 3: Create the hook**

Create `plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs`:

```javascript
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/agent-init/session-resume-hook.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 5: Register the hook in the settings template**

In `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs`, the `SessionStart` array currently holds one entry (`cache-heal.mjs`). Add `session-resume.mjs` after it:

```hbs
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/cache-heal.mjs\"" },
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-resume.mjs\"" }
        ]
      }
    ]
```

- [ ] **Step 6: Regenerate the settings snapshots and confirm**

```bash
UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs
node --test tests/lib/render.test.mjs
```
Expected: second run PASS. `git status` shows updated `tests/lib/__snapshots__/settings.local.json.hbs__*.snap` files (all 8 — the SessionStart entry is ungated).

- [ ] **Step 7: Commit**

```bash
git add -- plugins/harness-builder/skills/agent-init/templates/hooks/session-resume.mjs \
  plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs \
  tests/agent-init/session-resume-hook.test.mjs \
  tests/lib/__snapshots__/
git commit -m "feat(agent-init): session-resume SessionStart hook (compaction re-injection + session-id capture)"
git show --stat HEAD
```

---

## Task 3: `agent-all-continue.mjs` Stop hook (Layer 3)

Tier-A enforcement: block the orchestrator from ending the turn while a run is mid-pipeline.

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs`
- Modify: `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs` (Stop array)
- Modify (regenerate): `tests/lib/__snapshots__/settings.local.json.hbs__*.snap`
- Test: `tests/agent-init/agent-all-continue-hook.test.mjs`

**Interfaces:**
- Consumes: state.json shape from Task 1 (`status`, `runId`, `sessionId`, `updatedAt`, `awaitingUser`, `phases[].phase`); stdin payload `{stop_hook_active, session_id}`.
- Produces: emits `{decision:"block", reason:<string>}` on stdout to force continuation; otherwise exits 0 silently (allows the stop).

- [ ] **Step 1: Write the failing test**

Create `tests/agent-init/agent-all-continue-hook.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/agent-init/agent-all-continue-hook.test.mjs`
Expected: FAIL (hook file does not exist).

- [ ] **Step 3: Create the hook**

Create `plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs`:

```javascript
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
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/agent-init/agent-all-continue-hook.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Register the hook in the settings template**

In `settings.local.json.hbs`, the `Stop` array currently holds `session-summary.mjs`. Add `agent-all-continue.mjs`:

```hbs
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-summary.mjs\"" },
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-all-continue.mjs\"" }
        ]
      }
    ],
```

- [ ] **Step 6: Regenerate the settings snapshots and confirm**

```bash
UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs
node --test tests/lib/render.test.mjs
```
Expected: second run PASS; updated `__snapshots__/settings.local.json.hbs__*.snap` (all 8 — Stop entry is ungated).

- [ ] **Step 7: Commit**

```bash
git add -- plugins/harness-builder/skills/agent-init/templates/hooks/agent-all-continue.mjs \
  plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs \
  tests/agent-init/agent-all-continue-hook.test.mjs \
  tests/lib/__snapshots__/
git commit -m "feat(agent-init): agent-all-continue Stop hook (Tier-A mid-pipeline enforcement)"
git show --stat HEAD
```

---

## Task 4: Phase 0 status init + session claim + multi-session guard (Layers 1+5)

Phase 0 sets `status:"running"`/`runId`/`updatedAt`, claims `sessionId` from `current-session.json`, and guards against starting on top of a foreign `running` state.

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/phases/0-preflight.md` (step 5 area and step 9)
- Test: `tests/agent-all/lib/phase0-multisession-contract.test.mjs`

**Interfaces:**
- Consumes: `.agent-skill/runs/current-session.json` (written by Task 2 hook); `state.status`, `state.updatedAt` from Task 1 shape.
- Produces: documented Phase 0 behavior — set `state.runId`/`state.status`/`state.sessionId`/`state.updatedAt`; the status-guard `agent-interaction/v1` decision.

- [ ] **Step 1: Write the failing contract test**

Create `tests/agent-all/lib/phase0-multisession-contract.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/phases/0-preflight.md"), "utf-8");

test("Phase 0 initializes run-status fields", () => {
  const body = read();
  assert.match(body, /status[\s\S]{0,30}["'`]running/i, "sets status:running");
  assert.match(body, /state\.runId|runId[\s\S]{0,20}=/i, "persists runId to state");
  assert.match(body, /updatedAt/, "sets updatedAt");
});

test("Phase 0 claims session ownership from current-session.json", () => {
  const body = read();
  assert.match(body, /current-session\.json/, "reads current-session.json");
  assert.match(body, /state\.sessionId|sessionId/, "records sessionId on state");
});

test("Phase 0 guards against a foreign running state (sequential multi-session)", () => {
  const body = read();
  assert.match(body, /status[\s\S]{0,40}running[\s\S]{0,400}(foreign|another run|in progress|concurrent)/i,
    "detects a pre-existing running state from another run");
  assert.match(body, /agent-interaction/i, "surfaces a decision (no silent auto-proceed)");
  assert.match(body, /Abort/i, "default arm is Abort on a fresh foreign running state");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/agent-all/lib/phase0-multisession-contract.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the session claim + multi-session guard before step 9**

In `0-preflight.md`, the existing step 5 reads `.agent-all-state.json`. Insert a new sub-step **5c** immediately after step 5b (before step 6):

```markdown
   **5c. (session ownership + sequential multi-session guard).**
   Claim this session's ownership and refuse to clobber another run.
   ```javascript
   import { readFileSync } from "node:fs";
   import { join } from "node:path";
   // The session-resume.mjs SessionStart hook writes this on every session entry.
   let currentSessionId = null;
   try {
     currentSessionId = JSON.parse(readFileSync(join(cwd, ".agent-skill/runs/current-session.json"), "utf-8")).sessionId ?? null;
   } catch { /* hook hasn't run yet (first install) — single-session assumption */ }

   // Guard: a pre-existing RUNNING state that this invocation is not resuming.
   if (!flags.resume && state.status === "running") {
     const updatedAt = Date.parse(state.updatedAt || "");
     const stale = Number.isFinite(updatedAt) && (Date.now() - updatedAt) > 12 * 60 * 60 * 1000;
     if (stale) {
       // Dead prior run — default to start fresh (offer resume).
       // agent-interaction/v1: ["Start fresh (default)", "Resume that run"]
     } else {
       // Fresh foreign running state — likely another in-progress run (possibly a concurrent session,
       // which is UNSAFE on a shared worktree: interleaved commits). Do NOT auto-proceed (rule 14).
       // agent-interaction/v1 decision: ["Abort (default)", "Resume that run", "Start fresh (overwrites state — only if the other run is truly dead)"].
       // On Abort → exit 0 with: "Another /agent-all run (<runId>) appears in progress (updated <updatedAt>). Concurrent runs on one worktree are unsafe; finish or abort it first, or run --resume."
     }
   }
   ```
```

- [ ] **Step 4: Initialize the status fields at step 9**

In `0-preflight.md`, replace step 9 with:

```markdown
9. Generate/confirm `runId` (reuse the recalled checkpoint's runId on `--resume`; otherwise a fresh collision-resistant id) and push `{phase: 0, completedAt: "<iso>"}` to state. Set `state.status = "running"`, `state.runId = runId`, `state.sessionId = currentSessionId` (from 5c, may be null), `state.updatedAt = "<iso>"`, and initialize `state.awaitingUser = null`. Use atomic write (temp + rename). Create `.agent-all-state.json` with `{"status":"running","runId":runId,"sessionId":currentSessionId,"updatedAt":"<iso>","awaitingUser":null,"phases": [], "decisions": {}, "interactions": {}}` if missing. The `decisions` and `interactions` maps are populated by Phase 3b (decision-surfacing) and keyed by canonical task id (`AS-TASK-*`) when available.
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `node --test tests/agent-all/lib/phase0-multisession-contract.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add -- plugins/harness-floor/skills/agent-all/phases/0-preflight.md \
  tests/agent-all/lib/phase0-multisession-contract.test.mjs
git commit -m "feat(agent-all): Phase 0 status init + session claim + sequential multi-session guard"
git show --stat HEAD
```

---

## Task 5: Phase 3 PROTECT/task overlap adopt-decision (Layer 4)

When a pre-existing dirty (protected) file is also a task target, surface an adopt-vs-keep-protected decision instead of letting the file-guard silently block the agent's own edit.

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md` (after step 1, the plan-parse)
- Test: `tests/agent-all/lib/phase3-protect-overlap-contract.test.mjs`

**Interfaces:**
- Consumes: `state.dirtySnapshot` (from v0.7.7 PROTECT mode), the parsed plan `tasks[].files`, `AGENT_ALL_DIRTY_SNAPSHOT` env, `awaitingUser` convention (Task 1).
- Produces: documented overlap detection + adopt/keep decision that mutates `state.dirtySnapshot` and re-exports `AGENT_ALL_DIRTY_SNAPSHOT` on adopt.

- [ ] **Step 1: Write the failing contract test**

Create `tests/agent-all/lib/phase3-protect-overlap-contract.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/phases/3-dispatch.md"), "utf-8");

test("Phase 3 detects dirtySnapshot ∩ plan target files", () => {
  const body = read();
  assert.match(body, /overlap/i, "computes an overlap set");
  assert.match(body, /dirtySnapshot[\s\S]{0,200}(target|Create|Modify|plan)/i,
    "intersects the protected set with the plan's target files");
});

test("Phase 3 surfaces an adopt vs keep-protected decision (default keep)", () => {
  const body = read();
  assert.match(body, /agent-interaction/i, "uses a decision (no auto-approve)");
  assert.match(body, /adopt/i, "offers adopt (un-protect + commit together)");
  assert.match(body, /keep protected[\s\S]{0,80}default/i, "default arm is keep-protected");
  assert.match(body, /AGENT_ALL_DIRTY_SNAPSHOT/, "re-exports the env contract after adopt");
  assert.match(body, /awaitingUser/, "marks awaitingUser while the decision is pending");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/agent-all/lib/phase3-protect-overlap-contract.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the overlap adopt-decision after step 1**

In `3-dispatch.md`, after step 1 (the plan-parse that produces `tasks` with `files`) and before step 2 (`buildWaves`), insert:

```markdown
1b. **PROTECT / task-target overlap (only when `state.dirtySnapshot?.length`).** A pre-existing
   uncommitted file is read-only under PROTECT mode (the Edit|Write file-guard blocks it). If the
   plan must modify one, resolve the conflict explicitly rather than letting the agent hit a silent block.
   ```javascript
   import { writeFileSync, renameSync } from "node:fs";
   const targets = new Set(tasks.flatMap(t => t.files ?? []));
   const overlap = (state.dirtySnapshot ?? []).filter(p => targets.has(p));
   if (overlap.length) {
     // Set awaitingUser before yielding for the decision (Stop hook must not force-continue here).
     // state.awaitingUser = { at: <iso> }; atomic write.
     // agent-interaction/v1 decision per overlapping file (rule 14 — no auto-approve):
     //   - "Keep protected (default)": file stays read-only; re-scope the task to not touch it, or abort if impossible.
     //   - "Adopt into this run": remove the file from state.dirtySnapshot, rewrite the snapshot file
     //     at AGENT_ALL_DIRTY_SNAPSHOT (atomic temp+rename), and re-export
     //     process.env.AGENT_ALL_DIRTY_SNAPSHOT so the file-guard now permits the edit; Phase 3c may
     //     then stage+commit it together with the run's own changes.
     // Clear awaitingUser (set null) once resolved; refresh updatedAt.
   }
   ```
   The mutated `state.dirtySnapshot` persists in state and the existing Phase-3 checkpoint, so the
   SessionStart/Stop hooks operate on the current protected set after a compaction.
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/agent-all/lib/phase3-protect-overlap-contract.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -- plugins/harness-floor/skills/agent-all/phases/3-dispatch.md \
  tests/agent-all/lib/phase3-protect-overlap-contract.test.mjs
git commit -m "feat(agent-all): Phase 3 PROTECT/task overlap adopt-decision"
git show --stat HEAD
```

---

## Task 6: SKILL "Compaction recovery" section (Layer 6)

The in-context Tier-B backstop: tells the orchestrator how to self-heal after a compaction even if the hook directive is missing.

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/SKILL.md` (add a new section after the `## Rules` section)
- Test: `tests/agent-all/lib/skill-compaction-recovery-contract.test.mjs`

**Interfaces:**
- Consumes: the state shape from Task 1.
- Produces: a documented recovery procedure (no code interface).

- [ ] **Step 1: Write the failing contract test**

Create `tests/agent-all/lib/skill-compaction-recovery-contract.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = () => readFileSync(resolve("plugins/harness-floor/skills/agent-all/SKILL.md"), "utf-8");

test("SKILL documents in-session compaction recovery", () => {
  const body = read();
  assert.match(body, /## Compaction recovery/i, "has a Compaction recovery section");
  assert.match(body, /session-resume/i, "references the re-injection hook directive");
  assert.match(body, /max\(.*phase.*\)|max phase|max\(phases/i, "self-heal: resume after max completed phase");
  assert.match(body, /never restart from Phase 0/i, "forbids Phase 0 restart on a running state");
  assert.match(body, /do not stop after[\s\S]{0,40}plan|never stop after Phase 2/i, "forbids stopping after the plan");
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/agent-all/lib/skill-compaction-recovery-contract.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Add the section**

In `SKILL.md`, immediately after the `## Rules` section (before `## Lib modules`), insert:

```markdown
## Compaction recovery (in-session)

An **in-session compaction** (auto when the window fills, or a manual `/compact`) is NOT session
death — the process keeps running, so `--resume` never re-runs Phase 0. A compaction can summarize
away your place in the pipeline and the phase instructions, stranding you (classically: plan written,
Phase 3 never entered).

Two installed hooks make this recoverable; obey them:

1. **`session-resume.mjs` (SessionStart, compact/resume)** re-injects a directive naming the next
   phase. When you see it, do exactly that: re-read this SKILL and the named `phases/<N>-*.md`, then
   continue from Phase `<N>`.
2. **`agent-all-continue.mjs` (Stop)** blocks you from ending the turn while `status:"running"` and the
   pipeline is unfinished. If your turn is force-continued with a "still mid-pipeline" reason, resume
   the named phase — do not argue with it.

Self-heal even without a directive: if you are unsure where you are mid-run, read
`.agent-all-state.json` and resume **after `max(phases[*].phase)`**. Trust `state.json` over your own
recollection (the subagent-driven-development "Durable Progress" principle). On a `status:"running"`
state: **never restart from Phase 0**, and **do not stop after the plan** — Phase 2 completing means
Phase 3 is next.
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/agent-all/lib/skill-compaction-recovery-contract.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: all tests PASS (the new test files + regenerated snapshots all green; no regressions).

- [ ] **Step 6: Commit**

```bash
git add -- plugins/harness-floor/skills/agent-all/SKILL.md \
  tests/agent-all/lib/skill-compaction-recovery-contract.test.mjs
git commit -m "feat(agent-all): SKILL compaction-recovery section (Tier-B self-heal backstop)"
git show --stat HEAD
```

---

## After all tasks

- **Live verification (DoD):** in a real project with the hooks installed (`/agent-init` operational profile, or copy the two `.mjs` into `.claude/hooks/` + register), start an `/agent-all` run, let it reach Phase 2, then run `/compact`. Confirm: (a) the post-compaction window shows the "continue from Phase 3" directive, (b) a forced premature yield is blocked by the Stop hook, (c) the run proceeds into Phase 3. Also exercise: a plan that targets a dirty file → the adopt/keep decision appears; a second run on a fresh `running` state → the Phase 0 guard fires.
- **Release (separate, gated):** bump 0.7.7→0.7.8 across plugin manifests, README badges + `2302/2302`→new count, CHANGELOG ×2, `release-doc-contract` escaped-regex version asserts, `sync-lib --check`, provenance/checksum; add a RELEASE CHECKLIST note that existing operational installs must re-run `/agent-init` to get the two new hooks (the same re-init v0.7.7 already requires). Do this only after live verification and explicit user go-ahead.

## Notes for the implementer

- The two hooks are deliberately self-contained (each carries its own phase maps + state read) — they install standalone into `.claude/hooks/` with no shared import, matching `cache-heal.mjs`/`session-summary.mjs`.
- `Date.now()`/`new Date()` are fine in hooks (the Workflow-script restriction does not apply here).
- Existing stale doc (NOT in scope): `SKILL.md` `## On error` still says "Dirty git tree → abort", superseded by v0.7.7 PROTECT mode. Leave it unless a reviewer rules otherwise — fixing it is a separate v0.7.7 doc-drift cleanup.
- Phase-contract tests assert the markdown *describes* the wiring (the orchestrator is the runtime). They must fail on the pre-change doc — verify the red in Step 2 of each doc task, never skip it.
- No existing test breaks from adding these files: the README `2302/2302` is a string check (release-time bump), and `tests/lib/claude-native-release-contract.test.mjs` syntax-checks an *inclusion* list of hooks (not an exact set). Optional hardening (do it in Task 3 if quick): add the two new hook paths to that test's `for (const rel of [...])` list so they're syntax-gated alongside the others — `git add` that test file in the Task 3 commit if you do.
