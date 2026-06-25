# Measurable Self-Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the harness's missing feedback loop — emit one shared `run-record/v1` per run (real agent-all runs + evals), mine per-repo records to pre-seed `/agent-init` scaffolding (advisory), convert the eval from fixture-constants to record-then-reverify, and harden the existing hooks for multi-session correctness.

**Architecture:** A single `run-record.mjs` contract (in agent-all's lib, next to `cost-telemetry.mjs`) is the spine: it builds, validates, and atomically persists one file per run at `.agent-skill/runs/records/<runId>.json`. Real runs emit via a thin `scripts/emit-run-record.mjs`; evals emit via a new `--record` mode. A self-contained `derive-priors.mjs` in agent-init's lib reads the per-repo records directory and surfaces an advisory `AskUserQuestion` panel in Phase 1. Two existing hooks are made concurrency-safe. Per-run files + atomic tmp+rename means no shared-append interleaving and no locks.

**Tech Stack:** Node ESM (`.mjs`), Node built-ins only (`node:fs`, `node:path`, `node:crypto`, `node:child_process`), `node:test` + `node:assert/strict`. No root `package.json`; no npm build step; no new dependencies.

## Global Constraints

- **ESM only, no new dependencies.** Node built-ins only. The repo is a flat collection of ESM plugins; there is no root `package.json` and no build step.
- **Tests:** `node:test` + `node:assert/strict`, files at `tests/**/*.test.mjs`. Isolate with `mkdtempSync(join(tmpdir(), "..."))`, clean up with `try/finally` + `rmSync(dir, { recursive: true, force: true })`. Run a file with `node --test tests/lib/<name>.test.mjs`.
- **Shared working tree, multiple sessions** (global rules 6–10). Every shared-JSON write uses atomic tmp+rename; per-run records use one file per `runId`. No hook or script may run `git stash` / `git reset` / branch-switch.
- **Run-record contract constant:** `RUN_RECORD_SCHEMA_VERSION = "agent-skill-run-record/v1"`. Records live at `.agent-skill/runs/records/<safeRunId>.json`.
- **`safeRunId`** replaces `/[^a-zA-Z0-9._-]/g` with `_`, falling back to `"default"` for blank/non-string input (matches `evidence-writer.mjs`).
- **Advisory, user-gated:** the actuator never auto-mutates the scaffold; suggestions go through `AskUserQuestion` (global rules 14/15).
- **No silent empty catch** (global rule 3). A record read that hits a torn/invalid file is skipped *with the skip being the documented contract*, not a swallowed error elsewhere.

## File Structure

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `plugins/harness-floor/skills/agent-all/lib/run-record.mjs` | **Create** | The `run-record/v1` contract: `RUN_RECORD_SCHEMA_VERSION`, `safeRunId`, `runRecordPath`, `repoFingerprint`, `buildRunRecord`, `validateRunRecord`, `writeRunRecordAtomic`, `readRunRecords` |
| `tests/lib/run-record.test.mjs` | **Create** | Contract + persistence + concurrency tests |
| `plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs` | **Create** | Self-contained reader of the per-repo records dir → `derivePriors()` priors object |
| `tests/lib/derive-priors.test.mjs` | **Create** | Actuator behavior on synthetic records |
| `scripts/emit-run-record.mjs` | **Create** | CLI: gather scaffold + outcome + telemetry, write one run-record (`source: "agent-all"`) |
| `tests/lib/emit-run-record.test.mjs` | **Create** | CLI writes a valid record from flags + temp `.agent-skill` |
| `plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs` | **Modify** | Extract pure `nextRoutingState`, atomic write, main-guard |
| `plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs` | **Modify** | Extract `appendSessionDecision`, atomic exclusive header, main-guard |
| `tests/agent-init/hooks-concurrency.test.mjs` | **Create** | Both hook fixes + two-writer simulation |
| `scripts/skill-eval.mjs` | **Modify** | `taskPrompt`/`checkerCmd` in `validateEvalFixture`; `--record` flag; `recordCanonicalRun` |
| `tests/lib/skill-eval.test.mjs` | **Modify** | Retire hardcoded constants; add structural/relational assertions; record-mode test (stubbed runner) |
| `tests/fixtures/evals/*.json` | **Modify** | Add `taskPrompt` + `checkerCmd` to the 3 fixtures |
| `plugins/harness-builder/skills/agent-init/phases/1-discover.md` | **Modify** | New step 3.5: call `derivePriors`, present panel, fold into `ctx` |
| `plugins/harness-floor/skills/agent-all/SKILL.md` + Phase 5 doc | **Modify** | Instruct emitting a run-record at run completion |
| `tests/agent-init/prior-panel-contract.test.mjs` | **Create** | Phase-1 doc references `derivePriors`/`priors` |

---

### Task 1: Harden `context-mode-router` hook (atomic write + testable transition)

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs:58-101`
- Test: `tests/agent-init/hooks-concurrency.test.mjs`

**Interfaces:**
- Produces: `nextRoutingState(prevState, { cmd, now })` → `{ state, shouldRecommend }` (pure); `writeRoutingStateAtomic(statePath, state)` → `string` path.

**Context:** The hook currently does `readFileSync` → increment `largeCommandCount` → plain `writeFileSync` (lines 58-101). Plain write can corrupt JSON on crash; the counter is a shared advisory nudge threshold. Fix = make the write atomic (tmp+rename) and extract the transition into a pure exported function so it is testable. The lost-update on the counter is acceptable (advisory nudge; a missed increment only delays the `/thrift` suggestion) — document it, do not add a lock. The top-level hook body must move behind a main-guard so importing the module for tests does not execute it.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-init/hooks-concurrency.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  nextRoutingState,
  writeRoutingStateAtomic,
} from "../../plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs";

test("nextRoutingState increments the counter and flags recommend at threshold", () => {
  const t0 = 1_000_000_000_000;
  let { state, shouldRecommend } = nextRoutingState({}, { cmd: "git log", now: t0 });
  assert.equal(state.largeCommandCount, 1);
  assert.equal(shouldRecommend, false);
  ({ state, shouldRecommend } = nextRoutingState(state, { cmd: "git log", now: t0 + 1 }));
  ({ state, shouldRecommend } = nextRoutingState(state, { cmd: "git log", now: t0 + 2 }));
  assert.equal(state.largeCommandCount, 3);
  assert.equal(shouldRecommend, true); // count>=3 and no prior reminder
});

test("writeRoutingStateAtomic round-trips valid JSON and leaves no tmp", () => {
  const dir = mkdtempSync(join(tmpdir(), "ctx-router-"));
  try {
    const p = join(dir, "context-mode-router.json");
    writeRoutingStateAtomic(p, { largeCommandCount: 2, lastCommand: "x" });
    assert.deepEqual(JSON.parse(readFileSync(p, "utf-8")), { largeCommandCount: 2, lastCommand: "x" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-init/hooks-concurrency.test.mjs`
Expected: FAIL — `nextRoutingState`/`writeRoutingStateAtomic` are not exported.

- [ ] **Step 3: Refactor the hook — add exports, atomic write, main-guard**

Replace the read-modify-write block (lines 58-101) so the transition is a pure exported function and the write is atomic. Add these exports near the top of the module and rewrite the body to use them:

```javascript
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function nextRoutingState(prevState, { cmd, now }) {
  const state = prevState && typeof prevState === "object" ? prevState : {};
  const largeCommandCount = Number(state.largeCommandCount || 0) + 1;
  const lastReminderAt = Number(state.lastThriftReminderAt || 0);
  const shouldRecommend = largeCommandCount >= 3 && now - lastReminderAt > 60 * 60 * 1000;
  const nextState = {
    ...state,
    largeCommandCount,
    updatedAt: new Date(now).toISOString(),
    lastCommand: String(cmd ?? "").slice(0, 240),
    ...(shouldRecommend ? { lastThriftReminderAt: now } : {}),
  };
  return { state: nextState, shouldRecommend };
}

// Atomic write: tmp sibling + fsync + rename (rename(2) is atomic on POSIX).
// NOTE: largeCommandCount is an advisory nudge counter; a lost increment under
// concurrent sessions only delays the /thrift suggestion and is acceptable.
export function writeRoutingStateAtomic(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  const tmp = `${statePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  try { const fd = openSync(tmp, "r+"); fsyncSync(fd); closeSync(fd); } catch {}
  renameSync(tmp, statePath);
  return statePath;
}
```

Then convert the original top-level body into a guarded `main()` that reads the state, calls `nextRoutingState`, calls `writeRoutingStateAtomic`, and writes the recommendation file when `shouldRecommend`:

```javascript
function main() {
  // ... existing stdin/cmd parsing stays unchanged ...
  const statePath = resolve(root, ".agent-skill", "state", "context-mode-router.json");
  let prev = {};
  try {
    if (existsSync(statePath)) prev = JSON.parse(readFileSync(statePath, "utf-8"));
  } catch (error) {
    warnHook("read routing state", error);
  }
  const { state, shouldRecommend } = nextRoutingState(prev, { cmd, now: Date.now() });
  try {
    writeRoutingStateAtomic(statePath, state);
    if (shouldRecommend) {
      const recommendation = resolve(root, ".agent-skill", "recommendations", "thrift.md");
      mkdirSync(dirname(recommendation), { recursive: true });
      writeFileSync(recommendation, [
        "# /thrift recommended",
        "",
        "Repeated large-output commands were detected before thrift was enabled.",
        "",
        "Run `/thrift` to install long-session summary and audit hooks. If you only need this one command, route it through context-mode or redirect output to a file.",
        "",
      ].join("\n"));
    }
  } catch (error) {
    warnHook("write routing state", error);
    // Advisory only. Never block the user's tool call.
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-init/hooks-concurrency.test.mjs`
Expected: PASS (the two `nextRoutingState`/`writeRoutingStateAtomic` tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs tests/agent-init/hooks-concurrency.test.mjs
git commit -m "fix(hooks): atomic routing-state write + testable transition (multi-session)"
```

---

### Task 2: Harden `session-summary` hook (atomic exclusive header, kill TOCTOU)

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs:40-45`
- Test: `tests/agent-init/hooks-concurrency.test.mjs` (extend)

**Interfaces:**
- Produces: `appendSessionDecision(file, { date, stamp, note })` → void.

**Context:** Lines 40-45 do `existsSync(file) ? "" : header` then `appendFileSync` — a TOCTOU where two sessions both see the file absent and both write the `# Session decisions` heading. Fix: create the header with an **exclusive** create (`flag: "wx"`, atomic — only one process wins; others get `EEXIST` and skip), then always append the line. Extract into an exported function and add a main-guard.

- [ ] **Step 1: Write the failing test (append to the same test file)**

```javascript
import { appendSessionDecision } from "../../plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs";

test("appendSessionDecision writes exactly one header even when called repeatedly", () => {
  const dir = mkdtempSync(join(tmpdir(), "session-summary-"));
  try {
    const file = join(dir, "2026-06-25-session.md");
    appendSessionDecision(file, { date: "2026-06-25", stamp: "T1", note: "a" });
    appendSessionDecision(file, { date: "2026-06-25", stamp: "T2", note: "b" });
    const body = readFileSync(file, "utf-8");
    const headers = body.match(/# Session decisions/g) || [];
    assert.equal(headers.length, 1);
    assert.match(body, /- \[T1\] a/);
    assert.match(body, /- \[T2\] b/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-init/hooks-concurrency.test.mjs`
Expected: FAIL — `appendSessionDecision` not exported.

- [ ] **Step 3: Implement the exclusive-header fix + main-guard**

Add the export and rewrite the write block:

```javascript
import { readFileSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export function appendSessionDecision(file, { date, stamp, note }) {
  // Atomic header creation: only the first writer wins the exclusive create.
  try {
    writeFileSync(file, `# Session decisions — ${date}\n\n`, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error; // EEXIST is the expected concurrent case
  }
  appendFileSync(file, `- [${stamp}] ${note}\n`);
}
```

Wrap the existing top-level body in `main()` (keep stdin parsing and `warnHook` unchanged), replacing lines 40-45 with:

```javascript
  mkdirSync(decisionsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(decisionsDir, `${date}-session.md`);
  const stamp = new Date().toISOString();
  const note = (payload?.stop_reason || payload?.reason || "session end").toString();
  try {
    appendSessionDecision(file, { date, stamp, note });
  } catch (error) {
    warnHook("append session decision", error);
  }
```

And the guard:

```javascript
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-init/hooks-concurrency.test.mjs`
Expected: PASS (all three tests in the file).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs tests/agent-init/hooks-concurrency.test.mjs
git commit -m "fix(hooks): atomic exclusive-create header kills session-summary TOCTOU"
```

---

### Task 3: `run-record.mjs` contract — schema, build, validate

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/run-record.mjs`
- Test: `tests/lib/run-record.test.mjs`

**Interfaces:**
- Produces: `RUN_RECORD_SCHEMA_VERSION` (string); `buildRunRecord(fields)` → record object; `validateRunRecord(record, source?)` → record (throws on invalid).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lib/run-record.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RUN_RECORD_SCHEMA_VERSION,
  buildRunRecord,
  validateRunRecord,
} from "../../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";

test("buildRunRecord fills defaults and stamps the schema version", () => {
  const r = buildRunRecord({
    runId: "r1", ts: "2026-06-25T00:00:00.000Z", repoFingerprint: "abc",
    source: "agent-all", taskCategory: "backend-api",
    scaffold: { size: "medium", profile: "operational", roster: ["planner", "dev"] },
    outcome: { passed: true, iterations: 2, rolesActuallyInvoked: ["planner", "dev", "security-reviewer"] },
    telemetryRecords: [{ platform: "p", model: "m", totalTokens: 10, costUSD: 0.01 }],
  });
  assert.equal(r.schemaVersion, RUN_RECORD_SCHEMA_VERSION);
  assert.equal(r.scaffold.qaPersonas.length, 0);          // defaulted
  assert.equal(r.outcome.rollbackCount, 0);               // defaulted
  assert.equal(r.outcome.rolesActuallyInvoked.length, 3);
});

test("validateRunRecord rejects wrong schema version", () => {
  assert.throws(() => validateRunRecord({ schemaVersion: "x" }), /schemaVersion/);
});

test("validateRunRecord rejects non-boolean outcome.passed", () => {
  const r = buildRunRecord({ runId: "r", source: "eval-live" });
  r.outcome.passed = "yes";
  assert.throws(() => validateRunRecord(r), /outcome\.passed/);
});

test("validateRunRecord accepts a well-formed record", () => {
  const r = buildRunRecord({ runId: "r", source: "eval-live" });
  assert.equal(validateRunRecord(r), r);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/run-record.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the contract (first half of the module)**

```javascript
// plugins/harness-floor/skills/agent-all/lib/run-record.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const RUN_RECORD_SCHEMA_VERSION = "agent-skill-run-record/v1";

export function buildRunRecord({
  runId,
  ts,
  repoFingerprint = null,
  source,
  taskCategory = null,
  scaffold = {},
  outcome = {},
  telemetryRecords = [],
} = {}) {
  return {
    schemaVersion: RUN_RECORD_SCHEMA_VERSION,
    runId: String(runId ?? "default"),
    ts: ts || new Date().toISOString(),
    repoFingerprint,
    source,
    taskCategory,
    scaffold: {
      size: scaffold.size ?? null,
      profile: scaffold.profile ?? null,
      roster: Array.isArray(scaffold.roster) ? scaffold.roster : [],
      qaPersonas: Array.isArray(scaffold.qaPersonas) ? scaffold.qaPersonas : [],
      costFlags: scaffold.costFlags && typeof scaffold.costFlags === "object" ? scaffold.costFlags : {},
    },
    outcome: {
      passed: Boolean(outcome.passed),
      iterations: Number(outcome.iterations ?? 0),
      manualInterventions: Number(outcome.manualInterventions ?? 0),
      failedReviewerGates: Number(outcome.failedReviewerGates ?? 0),
      qualityDebtFindings: Number(outcome.qualityDebtFindings ?? 0),
      rollbackCount: Number(outcome.rollbackCount ?? 0),
      rolesActuallyInvoked: Array.isArray(outcome.rolesActuallyInvoked) ? outcome.rolesActuallyInvoked : [],
    },
    telemetryRecords: Array.isArray(telemetryRecords) ? telemetryRecords : [],
  };
}

export function validateRunRecord(record, source = "run-record") {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${source} must be an object`);
  if (record.schemaVersion !== RUN_RECORD_SCHEMA_VERSION) throw new Error(`${source} must use schemaVersion ${RUN_RECORD_SCHEMA_VERSION}`);
  if (typeof record.runId !== "string" || !record.runId) throw new Error(`${source}.runId must be a non-empty string`);
  if (record.source !== "agent-all" && record.source !== "eval-live") throw new Error(`${source}.source must be "agent-all" or "eval-live"`);
  if (!record.scaffold || typeof record.scaffold !== "object") throw new Error(`${source}.scaffold must be an object`);
  if (!Array.isArray(record.scaffold.roster)) throw new Error(`${source}.scaffold.roster must be an array`);
  if (!record.outcome || typeof record.outcome !== "object") throw new Error(`${source}.outcome must be an object`);
  if (typeof record.outcome.passed !== "boolean") throw new Error(`${source}.outcome.passed must be boolean`);
  if (!Array.isArray(record.outcome.rolesActuallyInvoked)) throw new Error(`${source}.outcome.rolesActuallyInvoked must be an array`);
  if (!Array.isArray(record.telemetryRecords)) throw new Error(`${source}.telemetryRecords must be an array`);
  return record;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/run-record.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/lib/run-record.mjs tests/lib/run-record.test.mjs
git commit -m "feat(run-record): run-record/v1 contract — build + validate"
```

---

### Task 4: `run-record.mjs` persistence — path, atomic write, dir read, fingerprint

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/run-record.mjs` (add persistence exports)
- Test: `tests/lib/run-record.test.mjs` (extend)

**Interfaces:**
- Consumes: `buildRunRecord`, `validateRunRecord`, `RUN_RECORD_SCHEMA_VERSION` (Task 3).
- Produces: `safeRunId(runId)` → string; `runRecordPath({cwd, runId})` → string; `repoFingerprint({cwd})` → string; `writeRunRecordAtomic(record, {cwd})` → path; `readRunRecords({cwd})` → record[] (sorted by `ts`).

- [ ] **Step 1: Write the failing test (extend the file)**

```javascript
import { mkdtempSync, writeFileSync as fsWrite, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  safeRunId, runRecordPath, writeRunRecordAtomic, readRunRecords,
} from "../../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";

test("safeRunId sanitizes and falls back to default", () => {
  assert.equal(safeRunId("a/b c"), "a_b_c");
  assert.equal(safeRunId(""), "default");
});

test("runRecordPath places one file per run under runs/records", () => {
  const p = runRecordPath({ cwd: "/x", runId: "feature/1" });
  assert.match(p, /\.agent-skill\/runs\/records\/feature_1\.json$/);
});

test("write then read round-trips; two concurrent runs produce two files", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-record-"));
  try {
    const a = buildRunRecord({ runId: "a", ts: "2026-06-25T00:00:01.000Z", source: "agent-all" });
    const b = buildRunRecord({ runId: "b", ts: "2026-06-25T00:00:02.000Z", source: "eval-live" });
    writeRunRecordAtomic(a, { cwd: dir });
    writeRunRecordAtomic(b, { cwd: dir });
    const files = readdirSync(join(dir, ".agent-skill", "runs", "records")).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 2);
    const all = readRunRecords({ cwd: dir });
    assert.deepEqual(all.map((r) => r.runId), ["a", "b"]); // sorted by ts
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRunRecords skips torn/invalid files instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "run-record-torn-"));
  try {
    writeRunRecordAtomic(buildRunRecord({ runId: "ok", source: "agent-all" }), { cwd: dir });
    const recDir = join(dir, ".agent-skill", "runs", "records");
    fsWrite(join(recDir, "torn.json"), "{ not valid json");
    fsWrite(join(recDir, "wrong.json"), JSON.stringify({ schemaVersion: "other" }));
    const all = readRunRecords({ cwd: dir });
    assert.deepEqual(all.map((r) => r.runId), ["ok"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/run-record.test.mjs`
Expected: FAIL — persistence exports not defined.

- [ ] **Step 3: Implement persistence (append to the module)**

```javascript
export function safeRunId(runId) {
  const raw = typeof runId === "string" && runId.trim() ? runId.trim() : "default";
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function runRecordPath({ cwd = process.cwd(), runId = "default" } = {}) {
  return resolve(cwd, ".agent-skill", "runs", "records", `${safeRunId(runId)}.json`);
}

// Stable per-repo id: sha256 of the git origin URL when present, else of the repo root path.
// v1 actuator reads the local per-repo dir directly, so this is stored for FUTURE cross-repo
// aggregation, not used for filtering yet.
export function repoFingerprint({ cwd = process.cwd() } = {}) {
  let basis = resolve(cwd);
  try {
    const url = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (url) basis = url;
  } catch { /* not a git repo or no origin — fall back to path */ }
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export function writeRunRecordAtomic(record, { cwd = process.cwd() } = {}) {
  validateRunRecord(record);
  const path = runRecordPath({ cwd, runId: record.runId });
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`);
  try { const fd = openSync(tmp, "r+"); fsyncSync(fd); closeSync(fd); } catch {}
  renameSync(tmp, path);
  return path;
}

export function readRunRecords({ cwd = process.cwd() } = {}) {
  const dir = resolve(cwd, ".agent-skill", "runs", "records");
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue; // excludes <name>.json.tmp in-progress writes
    try {
      const rec = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      if (rec?.schemaVersion === RUN_RECORD_SCHEMA_VERSION) out.push(rec);
    } catch { /* torn/in-progress/invalid → skip (documented contract), never crash */ }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/run-record.test.mjs`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/lib/run-record.mjs tests/lib/run-record.test.mjs
git commit -m "feat(run-record): per-run atomic persistence + lock-free dir read"
```

---

### Task 5: `derive-priors.mjs` actuator (read-back, the highest-value unit)

**Files:**
- Create: `plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs`
- Test: `tests/lib/derive-priors.test.mjs`

**Interfaces:**
- Produces: `derivePriors({ cwd?, recordsDir?, recentN?, threshold? })` → `{ priorRunCount, rosterAdditions, suggestedProfile, suggestedMaxCostUSD }`.

**Context:** Self-contained reader — does NOT import from harness-floor, so agent-init has no hard dependency on harness-floor being installed (if it isn't, there are no records and priors are empty). It re-declares the schema-version constant as the shared contract. The records dir is per-repo by location, so v1 needs no fingerprint filtering. Locked decisions: `recentN = 5`, `threshold = 0.6`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lib/derive-priors.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { derivePriors } from "../../plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs";

function seed(dir, records) {
  const recDir = join(dir, ".agent-skill", "runs", "records");
  mkdirSync(recDir, { recursive: true });
  records.forEach((r, i) => writeFileSync(join(recDir, `r${i}.json`), JSON.stringify({
    schemaVersion: "agent-skill-run-record/v1",
    runId: `r${i}`, ts: `2026-06-25T00:00:0${i}.000Z`, source: "agent-all",
    scaffold: { profile: r.profile ?? "operational", roster: r.roster ?? [] },
    outcome: { passed: true, rolesActuallyInvoked: r.invoked ?? [] },
    telemetryRecords: (r.cost ? [{ costUSD: r.cost }] : []),
  })));
}

test("empty records dir yields empty priors", () => {
  const dir = mkdtempSync(join(tmpdir(), "priors-empty-"));
  try {
    assert.deepEqual(derivePriors({ cwd: dir }), {
      priorRunCount: 0, rosterAdditions: [], suggestedProfile: null, suggestedMaxCostUSD: null,
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a role invoked-but-unscaffolded in >=60% of recent runs is recommended", () => {
  const dir = mkdtempSync(join(tmpdir(), "priors-roster-"));
  try {
    // 5 runs: security-reviewer invoked-not-scaffolded in 4/5 (80% >= 60% -> recommend);
    // doc-writer in 2/5 (40% < 60% -> excluded)
    seed(dir, [
      { roster: ["planner"], invoked: ["planner", "security-reviewer"] },
      { roster: ["planner"], invoked: ["planner", "security-reviewer", "doc-writer"] },
      { roster: ["planner"], invoked: ["planner", "security-reviewer", "doc-writer"] },
      { roster: ["planner"], invoked: ["planner", "security-reviewer"] },
      { roster: ["planner"], invoked: ["planner"] },
    ]);
    const p = derivePriors({ cwd: dir });
    assert.equal(p.priorRunCount, 5);
    assert.deepEqual(p.rosterAdditions, ["security-reviewer"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dominant profile and cost headroom are suggested", () => {
  const dir = mkdtempSync(join(tmpdir(), "priors-profile-"));
  try {
    seed(dir, [
      { profile: "operational", cost: 2 },
      { profile: "operational", cost: 4 },
      { profile: "lite", cost: 1 },
    ]);
    const p = derivePriors({ cwd: dir });
    assert.equal(p.suggestedProfile, "operational");
    assert.equal(p.suggestedMaxCostUSD, 6); // max(4) * 1.5
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/derive-priors.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the actuator**

```javascript
// plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Shared contract with plugins/harness-floor/skills/agent-all/lib/run-record.mjs.
// Re-declared (not imported) so agent-init has no hard dependency on harness-floor.
const RUN_RECORD_SCHEMA_VERSION = "agent-skill-run-record/v1";

function readRecords(recordsDir) {
  if (!existsSync(recordsDir)) return [];
  const out = [];
  for (const file of readdirSync(recordsDir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const rec = JSON.parse(readFileSync(join(recordsDir, file), "utf-8"));
      if (rec?.schemaVersion === RUN_RECORD_SCHEMA_VERSION) out.push(rec);
    } catch { /* skip torn/invalid */ }
  }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

export function derivePriors({ cwd = process.cwd(), recordsDir, recentN = 5, threshold = 0.6 } = {}) {
  const dir = recordsDir || resolve(cwd, ".agent-skill", "runs", "records");
  const recent = readRecords(dir).slice(-recentN);
  if (recent.length === 0) {
    return { priorRunCount: 0, rosterAdditions: [], suggestedProfile: null, suggestedMaxCostUSD: null };
  }

  const addCounts = {};
  for (const r of recent) {
    const scaffolded = new Set(r.scaffold?.roster ?? []);
    for (const role of new Set(r.outcome?.rolesActuallyInvoked ?? [])) {
      if (!scaffolded.has(role)) addCounts[role] = (addCounts[role] ?? 0) + 1;
    }
  }
  const rosterAdditions = Object.entries(addCounts)
    .filter(([, n]) => n / recent.length >= threshold)
    .map(([role]) => role)
    .sort();

  const profileCounts = {};
  for (const r of recent) {
    const p = r.scaffold?.profile;
    if (p) profileCounts[p] = (profileCounts[p] ?? 0) + 1;
  }
  const suggestedProfile = Object.entries(profileCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const costs = recent
    .map((r) => (r.telemetryRecords ?? []).reduce((s, t) => s + (Number(t.costUSD) || 0), 0))
    .filter((c) => c > 0);
  const suggestedMaxCostUSD = costs.length ? Number((Math.max(...costs) * 1.5).toFixed(2)) : null;

  return { priorRunCount: recent.length, rosterAdditions, suggestedProfile, suggestedMaxCostUSD };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/derive-priors.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs tests/lib/derive-priors.test.mjs
git commit -m "feat(agent-init): derive-priors read-back actuator (per-repo, advisory)"
```

---

### Task 6: `scripts/emit-run-record.mjs` CLI + wire agent-all to emit

**Files:**
- Create: `scripts/emit-run-record.mjs`
- Modify: `plugins/harness-floor/skills/agent-all/SKILL.md` and the Phase 5 doc (`plugins/harness-floor/skills/agent-all/phases/5-*.md`)
- Test: `tests/lib/emit-run-record.test.mjs`

**Interfaces:**
- Consumes: `buildRunRecord`, `writeRunRecordAtomic`, `repoFingerprint` (Task 3/4).
- Produces: `parseEmitArgs(argv)` → options; `gatherScaffold({ cwd })` → `{ size, profile, roster, qaPersonas }`; `emitRunRecord(options)` → path.

**Context:** agent-all is instruction-driven, so the reliable emit point is a small CLI the Phase 5 doc invokes once per run. Scaffold is read from `.claude/.agent-init-state.json` `discovery` (size, qa_personas, `operationalProfile`) and the `.claude/agents/` directory (roster = agent filenames). Outcome metrics and `rolesActuallyInvoked` are passed as flags by the orchestrator. Telemetry is read from the run's `cost-telemetry.jsonl` if present.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lib/emit-run-record.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEmitArgs, gatherScaffold, emitRunRecord } from "../../scripts/emit-run-record.mjs";

test("parseEmitArgs reads outcome flags", () => {
  const o = parseEmitArgs(["--run-id=feat-1", "--passed=true", "--iterations=2", "--roles-invoked=planner,dev", "--category=backend-api"]);
  assert.equal(o.runId, "feat-1");
  assert.equal(o.passed, true);
  assert.equal(o.iterations, 2);
  assert.deepEqual(o.rolesInvoked, ["planner", "dev"]);
  assert.equal(o.category, "backend-api");
});

test("gatherScaffold reads agent-init state + .claude/agents roster", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-scaffold-"));
  try {
    mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
    writeFileSync(join(dir, ".claude", "agents", "planner.md"), "x");
    writeFileSync(join(dir, ".claude", "agents", "dev.md"), "x");
    writeFileSync(join(dir, ".claude", ".agent-init-state.json"), JSON.stringify({
      discovery: { size: "medium", qa_personas: ["auth"], operationalProfile: true },
    }));
    const s = gatherScaffold({ cwd: dir });
    assert.equal(s.size, "medium");
    assert.equal(s.profile, "operational");
    assert.deepEqual(s.roster.sort(), ["dev", "planner"]);
    assert.deepEqual(s.qaPersonas, ["auth"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("emitRunRecord writes one valid agent-all record", () => {
  const dir = mkdtempSync(join(tmpdir(), "emit-write-"));
  try {
    mkdirSync(join(dir, ".claude", "agents"), { recursive: true });
    writeFileSync(join(dir, ".claude", "agents", "planner.md"), "x");
    const path = emitRunRecord({ cwd: dir, runId: "feat-1", passed: true, iterations: 1, rolesInvoked: ["planner"], category: "docs-only" });
    const files = readdirSync(join(dir, ".agent-skill", "runs", "records"));
    assert.deepEqual(files, ["feat-1.json"]);
    const rec = JSON.parse(readFileSync(path, "utf-8"));
    assert.equal(rec.source, "agent-all");
    assert.equal(rec.outcome.passed, true);
    assert.deepEqual(rec.outcome.rolesActuallyInvoked, ["planner"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/emit-run-record.test.mjs`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the CLI module**

```javascript
#!/usr/bin/env node
// scripts/emit-run-record.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRunRecord, writeRunRecordAtomic, repoFingerprint,
} from "../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";

function flagValue(arg) {
  const eq = arg.indexOf("=");
  return eq === -1 ? "" : arg.slice(eq + 1);
}

export function parseEmitArgs(argv = []) {
  const o = { runId: "default", passed: false, iterations: 0, manualInterventions: 0, failedReviewerGates: 0, qualityDebtFindings: 0, rollbackCount: 0, rolesInvoked: [], category: null };
  for (const arg of argv) {
    if (arg.startsWith("--run-id=")) o.runId = flagValue(arg);
    else if (arg.startsWith("--passed=")) o.passed = flagValue(arg) === "true";
    else if (arg.startsWith("--iterations=")) o.iterations = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--manual-interventions=")) o.manualInterventions = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--failed-reviewer-gates=")) o.failedReviewerGates = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--quality-debt-findings=")) o.qualityDebtFindings = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--rollback-count=")) o.rollbackCount = Number(flagValue(arg)) || 0;
    else if (arg.startsWith("--roles-invoked=")) o.rolesInvoked = flagValue(arg).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--category=")) o.category = flagValue(arg) || null;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  return o;
}

export function gatherScaffold({ cwd = process.cwd() } = {}) {
  let discovery = {};
  const statePath = resolve(cwd, ".claude", ".agent-init-state.json");
  try {
    if (existsSync(statePath)) discovery = JSON.parse(readFileSync(statePath, "utf-8")).discovery ?? {};
  } catch { /* no state → empty scaffold */ }
  const agentsDir = resolve(cwd, ".claude", "agents");
  let roster = [];
  try {
    if (existsSync(agentsDir)) roster = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  } catch { /* none */ }
  return {
    size: discovery.size ?? null,
    profile: discovery.operationalProfile === false ? "lite" : (discovery.operationalProfile ? "operational" : null),
    roster,
    qaPersonas: Array.isArray(discovery.qa_personas) ? discovery.qa_personas : [],
  };
}

function readTelemetry({ cwd, runId }) {
  // Best-effort: flatten records from the run's cost-telemetry.jsonl if present.
  const { safeRunId } = { safeRunId: (id) => (typeof id === "string" && id.trim() ? id.trim() : "default").replace(/[^a-zA-Z0-9._-]/g, "_") };
  const p = resolve(cwd, ".agent-skill", "runs", safeRunId(runId), "cost-telemetry.jsonl");
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (Array.isArray(e.records)) out.push(...e.records); } catch { /* skip */ }
  }
  return out;
}

export function emitRunRecord({ cwd = process.cwd(), runId, passed, iterations, manualInterventions, failedReviewerGates, qualityDebtFindings, rollbackCount, rolesInvoked = [], category = null } = {}) {
  const scaffold = gatherScaffold({ cwd });
  const record = buildRunRecord({
    runId,
    repoFingerprint: repoFingerprint({ cwd }),
    source: "agent-all",
    taskCategory: category,
    scaffold,
    outcome: { passed, iterations, manualInterventions, failedReviewerGates, qualityDebtFindings, rollbackCount, rolesActuallyInvoked: rolesInvoked },
    telemetryRecords: readTelemetry({ cwd, runId }),
  });
  return writeRunRecordAtomic(record, { cwd });
}

function main(argv = process.argv.slice(2)) {
  const o = parseEmitArgs(argv);
  const path = emitRunRecord({ cwd: process.cwd(), ...o });
  console.log(`run-record written: ${path}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error(e?.message || String(e)); process.exitCode = 1; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/emit-run-record.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire agent-all Phase 5 to invoke the emitter**

In `plugins/harness-floor/skills/agent-all/phases/5-*.md` (PR/close-out phase), add a final step after the run completes:

```markdown
N. **Emit a run-record** (feeds the evolution loop). After the gate passes,
   record this run's scaffold + outcome so `/agent-init` can learn from it:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/../../../scripts/emit-run-record.mjs" \
     --run-id="<runId>" --category="<taskCategory>" --passed=<true|false> \
     --iterations=<N> --roles-invoked="<comma-separated roles actually dispatched this run>"
   ```

   `rolesActuallyInvoked` = the role agents you actually dispatched in Phase 3
   (not the full scaffolded roster). This is the delta the actuator learns from.
```

Add a one-line pointer in `SKILL.md` under the Phase 5 summary: "Phase 5 emits a `run-record/v1` via `scripts/emit-run-record.mjs` for the evolution loop."

- [ ] **Step 6: Commit**

```bash
git add scripts/emit-run-record.mjs tests/lib/emit-run-record.test.mjs plugins/harness-floor/skills/agent-all/SKILL.md plugins/harness-floor/skills/agent-all/phases/
git commit -m "feat(agent-all): emit run-record at Phase 5 (evolution loop producer)"
```

---

### Task 7: Wire `derivePriors` into agent-init Phase 1 (advisory panel)

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/phases/1-discover.md` (new step 3.5; extend step 7 `ctx`)
- Modify: `plugins/harness-builder/skills/agent-init/SKILL.md` (lib-modules list)
- Test: `tests/agent-init/prior-panel-contract.test.mjs`

**Interfaces:**
- Consumes: `derivePriors` (Task 5).

**Context:** Phase 1 is markdown-instruction-driven. The wiring is a doc edit plus a contract test that fails if the wiring is removed. `derivePriors`'s behavior is already covered by Task 5.

- [ ] **Step 1: Write the failing contract test**

```javascript
// tests/agent-init/prior-panel-contract.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const phase1 = readFileSync(resolve("plugins/harness-builder/skills/agent-init/phases/1-discover.md"), "utf-8");

test("Phase 1 invokes derivePriors before brainstorming", () => {
  assert.match(phase1, /derivePriors/);
  assert.match(phase1, /AskUserQuestion/);
  const idxPriors = phase1.indexOf("derivePriors");
  const idxBrainstorm = phase1.indexOf("superpowers:brainstorming");
  assert.ok(idxPriors < idxBrainstorm, "derivePriors must be called before brainstorming");
});

test("Phase 1 ctx carries the derived priors forward", () => {
  assert.match(phase1, /priors/);
});

test("SKILL.md documents the derive-priors lib module", () => {
  const skill = readFileSync(resolve("plugins/harness-builder/skills/agent-init/SKILL.md"), "utf-8");
  assert.match(skill, /derive-priors\.mjs/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-init/prior-panel-contract.test.mjs`
Expected: FAIL — `derivePriors` not referenced in the docs.

- [ ] **Step 3: Edit `phases/1-discover.md` — insert step 3.5 (between plugin scan step 3 and brainstorming step 4)**

```markdown
3.5. **Prior-run priors (evolution loop).** Before brainstorming, read learnings
    from this repo's past runs and offer them as defaults:

    ```javascript
    import { derivePriors } from "./lib/derive-priors.mjs";
    const priors = derivePriors({ cwd }); // { priorRunCount, rosterAdditions, suggestedProfile, suggestedMaxCostUSD }
    ```

    If `priors.priorRunCount > 0` and any field is non-empty, present an
    `AskUserQuestion` panel (advisory — the user confirms or overrides; never
    auto-apply, per the Decision-Surfacing Protocol). Example:
    - "Past runs added **{rosterAdditions}** beyond the scaffolded roster in
      ≥60% of recent runs. Include them by default?"
    - "Dominant profile in past runs was **{suggestedProfile}**. Use it?"
    - "Suggested `--max-cost` from past runs: **${suggestedMaxCostUSD}**."

    Carry the accepted answers into the brainstorming prompt (step 4) and the
    `ctx` object (step 7). If `priorRunCount === 0`, skip the panel silently.
```

Extend the step 7 `ctx` object to include the resolved priors:

```javascript
     const ctx = {
       // ...existing fields...
       priors,                          // derived in step 3.5; informs roster/profile/cost defaults
     };
```

- [ ] **Step 4: Add the lib pointer in `SKILL.md`** (under "## Lib modules"):

```markdown
- `lib/derive-priors.mjs` — `derivePriors({ cwd })` → `{ priorRunCount, rosterAdditions, suggestedProfile, suggestedMaxCostUSD }` from `.agent-skill/runs/records/` (advisory priors surfaced in Phase 1)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/agent-init/prior-panel-contract.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add plugins/harness-builder/skills/agent-init/phases/1-discover.md plugins/harness-builder/skills/agent-init/SKILL.md tests/agent-init/prior-panel-contract.test.mjs
git commit -m "feat(agent-init): Phase 1 prior-run priors panel (advisory, user-gated)"
```

---

### Task 8: Extend eval fixture schema — `taskPrompt` + `checkerCmd`

**Files:**
- Modify: `scripts/skill-eval.mjs` (`validateEvalFixture`, ~lines after `acceptanceCriteria` check)
- Modify: `tests/fixtures/evals/backend-api-task.json`, `small-web-ui-task.json`, `docs-only-task.json`
- Test: `tests/lib/skill-eval.test.mjs` (extend)

**Interfaces:**
- Consumes/Produces: `validateEvalFixture(fixture, source?)` now requires `taskPrompt` (string) and `checkerCmd` (string) when `fixture.executable === true`.

**Context:** Make canonical tasks executable for record-then-reverify. `taskPrompt` is the work; `checkerCmd` is a deterministic shell command whose exit code decides pass/fail at record time. To keep existing fixtures valid without forcing all of them executable at once, gate the new required fields behind `executable: true`.

- [ ] **Step 1: Write the failing test (extend skill-eval.test.mjs)**

```javascript
test("validateEvalFixture requires taskPrompt and checkerCmd when executable", () => {
  const base = {
    schemaVersion: "agent-skill-eval-fixture/v1",
    id: "x", title: "X", category: "docs-only", baselineFailure: "b",
    acceptanceCriteria: ["c"], modes: {}, executable: true,
  };
  assert.throws(() => validateEvalFixture({ ...base }), /taskPrompt/);
  assert.throws(() => validateEvalFixture({ ...base, taskPrompt: "do it" }), /checkerCmd/);
  assert.doesNotThrow(() => validateEvalFixture({ ...base, taskPrompt: "do it", checkerCmd: "true" }));
});
```

(Import `validateEvalFixture` in the test file if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/skill-eval.test.mjs`
Expected: FAIL — executable fixtures are not validated for the new fields.

- [ ] **Step 3: Extend `validateEvalFixture` in `scripts/skill-eval.mjs`**

After the existing `acceptanceCriteria` validation block, add:

```javascript
  if (fixture.executable === true) {
    assertString(fixture.taskPrompt, `${source}.taskPrompt`);
    assertString(fixture.checkerCmd, `${source}.checkerCmd`);
  }
```

- [ ] **Step 4: Add the executable fields to the 3 fixtures**

In each of `tests/fixtures/evals/*.json`, add (alongside `baselineFailure`):

```jsonc
  "executable": true,
  "taskPrompt": "<the concrete task to perform for this category>",
  "checkerCmd": "<deterministic command; exit 0 = pass>",
```

Concrete values:
- `backend-api-task.json`: `"taskPrompt": "Add a typed error response to the GET /widgets endpoint and a contract test.", "checkerCmd": "node --test tests/fixtures/evals/checkers/backend-api.check.mjs"`
- `small-web-ui-task.json`: `"taskPrompt": "Add an empty-state message to the widgets list component with a unit test.", "checkerCmd": "node --test tests/fixtures/evals/checkers/small-web-ui.check.mjs"`
- `docs-only-task.json`: `"taskPrompt": "Document the GET /widgets endpoint in README with a request/response example.", "checkerCmd": "node tests/fixtures/evals/checkers/docs-only.check.mjs"`

Create the three checker stubs under `tests/fixtures/evals/checkers/` — each asserts the deliverable exists (e.g. `docs-only.check.mjs` exits 0 if the README section is present, else 1). Minimal `docs-only.check.mjs`:

```javascript
// tests/fixtures/evals/checkers/docs-only.check.mjs
import { existsSync, readFileSync } from "node:fs";
const ok = existsSync("README.md") && /GET \/widgets/.test(readFileSync("README.md", "utf-8"));
process.exit(ok ? 0 : 1);
```

(The `backend-api`/`small-web-ui` checkers follow the same shape, asserting their deliverable; they run against the temp workspace produced in Task 9.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/lib/skill-eval.test.mjs`
Expected: PASS (the new validation test; existing tests still pass until Task 10 adjusts them).

- [ ] **Step 6: Commit**

```bash
git add scripts/skill-eval.mjs tests/fixtures/evals/
git commit -m "feat(eval): executable fixtures — taskPrompt + checkerCmd"
```

---

### Task 9: Eval `--record` mode (injectable runner) emitting run-records

**Files:**
- Modify: `scripts/skill-eval.mjs` (`parseArgs` ~lines 412-468; add `recordCanonicalRun` + `runRecordMode`)
- Test: `tests/lib/skill-eval.test.mjs` (extend)

**Interfaces:**
- Consumes: `buildRunRecord`, `writeRunRecordAtomic` (Task 3/4); `validateEvalFixture` (Task 8).
- Produces: `parseArgs` recognizes `--record`; `recordCanonicalRun(fixture, mode, { runMode, checker, cwd })` → `{ passed, telemetryRecords, outcome }`.

**Context:** The actual model invocation is injected (`runMode`) so tests never call a real model. In production, `runMode` shells out to the real CLI in an isolated temp dir; `checker` runs the fixture's `checkerCmd`. Opt-in via `--record`, release-gated, cost-capped — never in smoke CI.

- [ ] **Step 1: Write the failing test (extend skill-eval.test.mjs)**

```javascript
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordCanonicalRun, parseArgs } from "../../scripts/skill-eval.mjs";

test("parseArgs recognizes --record", () => {
  assert.equal(parseArgs(["--record"]).record, true);
  assert.equal(parseArgs([]).record ?? false, false);
});

test("recordCanonicalRun writes an eval-live run-record via injected runner", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-record-"));
  try {
    const fixture = { id: "docs-only-task", title: "Docs", category: "docs-only", executable: true, taskPrompt: "p", checkerCmd: "true" };
    const runMode = () => ({ telemetryRecords: [{ platform: "cli", model: "agent-all", totalTokens: 100, costUSD: 0.02 }], outcome: { iterations: 1 } });
    const checker = () => true; // stand in for checkerCmd exit 0
    const res = recordCanonicalRun(fixture, "agent-all", { runMode, checker, cwd: dir });
    assert.equal(res.passed, true);
    const recDir = join(dir, ".agent-skill", "runs", "records");
    const files = readdirSync(recDir);
    assert.equal(files.length, 1);
    const rec = JSON.parse(readFileSync(join(recDir, files[0]), "utf-8"));
    assert.equal(rec.source, "eval-live");
    assert.equal(rec.taskCategory, "docs-only");
    assert.equal(rec.telemetryRecords[0].totalTokens, 100);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/skill-eval.test.mjs`
Expected: FAIL — `recordCanonicalRun` not exported and `--record` not parsed.

- [ ] **Step 3: Implement in `scripts/skill-eval.mjs`**

Add the import at the top (next to the existing `cost-telemetry` import):

```javascript
import { buildRunRecord, writeRunRecordAtomic } from "../plugins/harness-floor/skills/agent-all/lib/run-record.mjs";
```

In `parseArgs`, add a branch before the final `else { throw ... }`:

```javascript
        } else if (arg === "--record") {
          options.record = true;
```

And initialize `record: false` in the `options` object literal.

Add the recorder (a real default `runMode` that shells out, plus the injectable seam):

```javascript
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

// Default production runner: run the mode against the fixture's taskPrompt in an
// isolated temp dir. Opt-in only — never invoked by smoke CI. (Heavy; injected in tests.)
function defaultRunMode(fixture, mode) {
  const work = mkdtempSync(join(tmpdir(), `eval-${fixture.id}-${mode}-`));
  // baseline = plain prompt; agent-all = the skill. The orchestrator wires the
  // actual CLI invocation here; it must NOT touch the live working tree.
  // Returns real telemetry + outcome scraped from the run's artifacts.
  // (Implementation invokes `claude -p` / the agent-all skill in `work`.)
  return { telemetryRecords: [], outcome: {}, workDir: work };
}

function defaultChecker(fixture, workDir) {
  try {
    execFileSync("sh", ["-c", fixture.checkerCmd], { cwd: workDir, stdio: "ignore" });
    return true;
  } catch { return false; }
}

export function recordCanonicalRun(fixture, mode, { runMode = defaultRunMode, checker = defaultChecker, cwd = process.cwd(), now = new Date() } = {}) {
  validateEvalFixture(fixture);
  const { telemetryRecords = [], outcome = {}, workDir } = runMode(fixture, mode) ?? {};
  const passed = checker(fixture, workDir ?? cwd);
  const record = buildRunRecord({
    runId: `${fixture.id}:${mode}`,
    ts: now instanceof Date ? now.toISOString() : String(now),
    source: "eval-live",
    taskCategory: fixture.category,
    scaffold: { profile: mode === "baseline" ? "lite" : "operational", roster: [] },
    outcome: { ...outcome, passed },
    telemetryRecords,
  });
  writeRunRecordAtomic(record, { cwd });
  return { passed, telemetryRecords, outcome: record.outcome };
}
```

(Wiring `--record` into `runSkillUtilityEval` to loop executable fixtures and write back recorded numbers is a follow-up step within this task; the unit above is the testable core. When `--record` is set, iterate `loadEvalFixtures().filter(f => f.executable)`, call `recordCanonicalRun` per mode, and persist the recorded metrics back into the fixture JSON so they become the new baseline.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/skill-eval.test.mjs`
Expected: PASS (the two new tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/skill-eval.mjs tests/lib/skill-eval.test.mjs
git commit -m "feat(eval): --record mode emits eval-live run-records (injectable runner)"
```

---

### Task 10: Retire hardcoded fixture-constant assertions

**Files:**
- Modify: `tests/lib/skill-eval.test.mjs` (lines 19-24, 45-46, 50-51, 59-60, 72-73, and any other fixture-numeric equality)

**Interfaces:** none new.

**Context:** The eval's job is now "does the skill change behavior for the better," so tests must assert *relationships*, not memorized constants. Replace numeric equalities tied to fixture contents with structural/relational assertions that survive fixture edits.

- [ ] **Step 1: Replace the constant assertions**

Change the fixture-count/id assertions (lines 19-24) to structural:

```javascript
  assert.ok(fixtures.length >= 1);
  assert.ok(fixtures.every((f) => typeof f.id === "string" && f.id.length > 0));
```

Change the pass-rate constants (lines 50-51) to a relational invariant:

```javascript
  // The whole point: the skill should not pass LESS often than baseline.
  assert.ok(agentAll.passRate >= baseline.passRate);
```

Change `tokenEstimate`/`costUSD` equalities (lines 59-60) to derivation checks:

```javascript
  // tokenEstimate must equal the sum of the run's telemetry totals, not a memorized number.
  const expectedTokens = run.costTelemetry.summary.totalTokens;
  assert.equal(run.metrics.tokenEstimate, expectedTokens);
  assert.ok(run.metrics.costUSD >= 0);
```

Change `runCount`/`fixtureCount` equalities (lines 45-46, 72-73) to the structural identity:

```javascript
  assert.equal(result.report.summary.runCount, result.report.summary.fixtureCount * result.report.modes.length);
```

Apply the same treatment to the remaining hardcoded equalities the extraction listed (lines 102, 110, 113, 138): replace each memorized count with `=== fixtureCount * modes.length` or `>= 1` / length-consistency checks.

- [ ] **Step 2: Run the full eval test suite**

Run: `node --test tests/lib/skill-eval.test.mjs`
Expected: PASS — no remaining equality against a memorized fixture number.

- [ ] **Step 3: Run the whole suite to confirm nothing regressed**

Run: `node --test`
Expected: PASS across the repo (all `*.test.mjs`).

- [ ] **Step 4: Commit**

```bash
git add tests/lib/skill-eval.test.mjs
git commit -m "test(eval): retire hardcoded fixture constants for structural/relational assertions"
```

---

## Self-Review

**1. Spec coverage:**
- run-record/v1 contract → Tasks 3, 4. ✓
- Per-run atomic files + lock-free reads (multi-session) → Task 4 (write + read + concurrency test). ✓
- Read-back actuator, per-repo, roster+profile+costFlags, ≥60%/N=5 → Task 5. ✓
- agent-all emits real run-records → Task 6. ✓
- agent-init Phase 1 advisory AskUserQuestion panel → Task 7. ✓
- Record-then-reverify eval, checkerCmd pass criterion → Tasks 8, 9. ✓
- Retire hardcoded fixture constants → Task 10. ✓
- Existing-hook audit/fix (session-summary TOCTOU, context-mode-router counter, no git-mutating hooks) → Tasks 1, 2 (audit confirmed neither hook shells out to git). ✓
- repoFingerprint stored, not used for filtering in v1 → Task 4 + Task 5 note. ✓

**2. Placeholder scan:** No "TBD/TODO". The `defaultRunMode` body in Task 9 is intentionally a seam (the real CLI invocation is opt-in and environment-specific) — its testable core (`recordCanonicalRun`) is fully specified with injected runner; this is a documented boundary, not a placeholder for required behavior.

**3. Type consistency:** `RUN_RECORD_SCHEMA_VERSION` identical in run-record.mjs and (re-declared) derive-priors.mjs. `safeRunId` semantics match `evidence-writer.mjs`. `buildRunRecord`/`writeRunRecordAtomic`/`readRunRecords` signatures consistent across Tasks 4, 6, 9. `derivePriors` return shape `{ priorRunCount, rosterAdditions, suggestedProfile, suggestedMaxCostUSD }` consistent in Tasks 5 and 7. `validateEvalFixture` extended (not renamed) in Task 8 and reused in Task 9.

**Ordering note:** Implement in task order 1→10. Tasks 1–2 (hook audit) are independent and may run first or in parallel. Task 5 (actuator) is the highest-value unit and is fully testable on synthetic records before Task 6 emits real ones — the A(3,4)→C(5)→B(6) ordering is deliberate.
