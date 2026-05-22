# Decision-Surfacing + Policy-Hook Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured decision-surfacing protocol so subagents do a scoping pass before code, return decision payloads, and the main thread asks the user via AskUserQuestion (CC) or stdin (other CLIs). Enforce via a single pair of hooks that also opportunistically validates verification-before-completion and reviewer-audit cross-check.

**Architecture:** Canonical lib in `plugins/harness-floor/skills/agent-all/lib/{decisions,policy}/`; hook entry script at `plugins/harness-floor/bin/floor-policy-hook.mjs`; phase 3 of `/agent-all` splits into 3a (scoping) / 3b (ask) / 3c (impl). Vendored copies pushed to per-platform ports via `scripts/sync-lib.mjs`. Cursor/Gemini/VSCode get soft prompt-only enforcement (no hooks). Documentation work is done **after** implementation, all in one pass (per user instruction).

**Tech Stack:** Pure Node ESM (no host dependencies), `node:test` for tests, AskUserQuestion (Claude Code), JSON state file in `.agent-all-state.json`, `.agent-all.json` for opt-out config.

**Reference spec:** `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`

---

## Progress (handoff — 2026-05-21)

Phases A, B, C, D **complete**. 12 of 29 tasks landed on `feat/decision-surfacing-policy-hooks`. Full repo suite **1279/1279 passing** (added 33 new tests). Resume from **Task 13**.

| Task | Status | Commit |
|---|---|---|
| 1 — Schema validator | ✅ done (5/5 tests) | `4fcdee5` |
| 2 — AskUserQuestion renderer | ✅ done (3/3 tests) | `0ab1e83` + `790718e` (plan bug: AskUserQuestion enforces 12-char header limit; impl uses `slice(0, 12)`, test asserts truncated value `"Token storag"`) |
| 3 — Non-TTY resolver | ✅ done (2/2 tests) | `62d1c48` |
| 4 — Addendum prompt text | ✅ done | `9b3c622` |
| 5 — Verification validator | ✅ done (4/4 tests) | `31b308f` |
| 6 — Reviewer-audit validator | ✅ done (5/5 tests) | `b27e760` |
| 7 — floor-policy hook (Pre+Post router) | ✅ done (5/5 tests) | `4213dc9` |
| 8 — Hook install/uninstall wiring | ✅ done (3/3 tests) | `605a5a6` |
| 9 — Decision-router (wave coord) | ✅ done (3/3 tests) | `067b21b` |
| 10 — Phase 3 3a/3b/3c doc rewrite | ✅ done | `36e414e` |
| 11 — config-loader policy opt-out (`.agent-all.json` `policy` key) | ✅ done (3/3 tests) | `fbf9b0a`. **Plan deviation:** reused existing `loadConfig(path)` API instead of introducing `loadAgentAllConfig(dir)` — added `policy` to `DEFAULTS` so deepMerge handles overrides naturally. |
| 12 — `decisions: {}` in initial state shape (`.agent-all-state.json`) | ✅ done | `d280ab6` |
| Regression fix — vendored config + restored 3-dispatch.md safety-net substrings (`STATUS: blocked, REASON: verification failed`, etc.) | ✅ done | `8d2639b` |
| 13 onward | pending | — |

**Notes for resume:**
- Task 13 (`sync-lib.mjs`) needs care: the current sync covers `render.mjs` only. Extending it to vendor `lib/decisions/` and `lib/policy/` may surface new test failures (vendored-byte-identical rule) — re-run `node --test` after each port's emit update.
- A minor asymmetry exists between the two validators: `verification-validator.mjs` matches case-insensitively (`/STATUS:\s*DONE\b/i`, `/verification_passed/i`), but `reviewer-audit-validator.mjs` is case-sensitive (`/VERIFICATION_AUDIT:\s*(passed|failed|skipped)\b/`). Subagent flagged in Task 6 report. Not a blocker; tighten the reviewer prompt to always emit lowercase, or widen the regex if a downstream task unifies the contract.
- Phase E Tasks 14-18 (per-platform port emit) read each port's `bin/install.mjs` first to find the emit pattern. Don't blind-copy the plan's snippets — match the existing emitter shape.

---

## Phase A — Decision payload primitives

### Task 1: Schema validator

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs`
- Test: `tests/agent-all/decisions/schema.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/decisions/schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDecisionPayload } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs";

test("accepts a well-formed NEEDS_DECISIONS payload", () => {
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "Add OAuth" },
    decisions: [{
      id: "d1",
      title: "Token storage",
      context: "Cookies vs localStorage",
      options: [
        { label: "Cookie", description: "secure httpOnly" },
        { label: "localStorage", description: "matches JWT pattern" },
      ],
      recommended_index: 0,
      reasoning: "Aligns with existing session pattern",
    }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("rejects payload with fewer than 2 options", () => {
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [{
      id: "d1", title: "X", context: "X",
      options: [{ label: "only", description: "x" }],
      recommended_index: 0, reasoning: "x",
    }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /at least 2 options/);
});

test("rejects payload with more than 4 options", () => {
  const opts = Array.from({ length: 5 }, (_, i) => ({ label: `o${i}`, description: "x" }));
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [{ id: "d1", title: "X", context: "X", options: opts, recommended_index: 0, reasoning: "x" }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /at most 4 options/);
});

test("rejects payload where recommended_index is out of range", () => {
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [{
      id: "d1", title: "X", context: "X",
      options: [{ label: "a", description: "x" }, { label: "b", description: "y" }],
      recommended_index: 5, reasoning: "x",
    }],
  };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /recommended_index/);
});

test("accepts NO_DECISIONS as a degenerate but valid status", () => {
  const payload = { status: "NO_DECISIONS", scope: { task_id: "t1", task_title: "X" } };
  const result = validateDecisionPayload(payload);
  assert.equal(result.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/decisions/schema.test.mjs`
Expected: FAIL with `Cannot find module 'schema.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs
const VALID_STATUSES = new Set(["NEEDS_DECISIONS", "NO_DECISIONS"]);

export function validateDecisionPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    errors.push("payload must be an object");
    return { ok: false, errors };
  }
  if (!VALID_STATUSES.has(payload.status)) {
    errors.push(`status must be one of ${[...VALID_STATUSES].join(", ")}`);
  }
  if (!payload.scope || typeof payload.scope.task_id !== "string") {
    errors.push("scope.task_id required");
  }
  if (payload.status === "NEEDS_DECISIONS") {
    if (!Array.isArray(payload.decisions) || payload.decisions.length === 0) {
      errors.push("decisions array required and non-empty");
    } else {
      payload.decisions.forEach((d, i) => {
        if (!d.id) errors.push(`decisions[${i}].id required`);
        if (!d.title) errors.push(`decisions[${i}].title required`);
        if (!Array.isArray(d.options)) {
          errors.push(`decisions[${i}].options must be array`);
          return;
        }
        if (d.options.length < 2) errors.push(`decisions[${i}] must have at least 2 options`);
        if (d.options.length > 4) errors.push(`decisions[${i}] must have at most 4 options (AskUserQuestion limit)`);
        if (typeof d.recommended_index !== "number" || d.recommended_index < 0 || d.recommended_index >= d.options.length) {
          errors.push(`decisions[${i}].recommended_index out of range`);
        }
        if (!d.reasoning) errors.push(`decisions[${i}].reasoning required`);
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/decisions/schema.test.mjs`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/decisions/schema.test.mjs plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs
git commit -m "feat(decisions): JSON schema validator for NEEDS_DECISIONS payload"
```

---

### Task 2: AskUserQuestion renderer

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/decisions/renderer.mjs`
- Test: `tests/agent-all/decisions/renderer.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/decisions/renderer.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToAskUserQuestion } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/renderer.mjs";

test("renders single decision to AskUserQuestion arg shape", () => {
  const decision = {
    id: "d1",
    title: "Token storage",
    context: "Existing uses cookies",
    options: [
      { label: "Cookie", description: "secure httpOnly" },
      { label: "localStorage", description: "matches JWT" },
    ],
    recommended_index: 0,
    reasoning: "Aligns with existing pattern",
  };
  const args = renderToAskUserQuestion(decision, { taskTitle: "Add OAuth" });
  assert.equal(args.questions.length, 1);
  const q = args.questions[0];
  assert.match(q.question, /Token storage/);
  assert.match(q.question, /Add OAuth/);
  assert.equal(q.header, "Token storage");
  assert.equal(q.multiSelect, false);
  assert.equal(q.options.length, 2);
  // Recommended option must be first per AskUserQuestion convention
  assert.match(q.options[0].label, /Recommended/);
  assert.match(q.options[0].label, /Cookie/);
});

test("preserves option order when recommended_index is not 0", () => {
  const decision = {
    id: "d1", title: "X", context: "X",
    options: [
      { label: "A", description: "x" },
      { label: "B", description: "y" },
      { label: "C", description: "z" },
    ],
    recommended_index: 2, reasoning: "x",
  };
  const args = renderToAskUserQuestion(decision, { taskTitle: "T" });
  assert.match(args.questions[0].options[0].label, /Recommended.*C/);
  assert.equal(args.questions[0].options[1].label, "A");
  assert.equal(args.questions[0].options[2].label, "B");
});

test("includes reasoning in question text", () => {
  const decision = {
    id: "d1", title: "X", context: "ctx-text",
    options: [{ label: "A", description: "x" }, { label: "B", description: "y" }],
    recommended_index: 0, reasoning: "reason-text",
  };
  const args = renderToAskUserQuestion(decision, { taskTitle: "T" });
  assert.match(args.questions[0].question, /reason-text/);
  assert.match(args.questions[0].question, /ctx-text/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/decisions/renderer.test.mjs`
Expected: FAIL with `Cannot find module 'renderer.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/skills/agent-all/lib/decisions/renderer.mjs
export function renderToAskUserQuestion(decision, { taskTitle }) {
  const recIdx = decision.recommended_index;
  const reordered = [
    decision.options[recIdx],
    ...decision.options.filter((_, i) => i !== recIdx),
  ];
  const options = reordered.map((opt, i) => ({
    label: i === 0 ? `(Recommended) ${opt.label}` : opt.label,
    description: opt.description,
  }));
  return {
    questions: [{
      question: `[${taskTitle}] ${decision.title}\n\nContext: ${decision.context}\n\nReasoning for recommendation: ${decision.reasoning}`,
      header: decision.title.slice(0, 12),
      multiSelect: false,
      options,
    }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/decisions/renderer.test.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/decisions/renderer.test.mjs plugins/harness-floor/skills/agent-all/lib/decisions/renderer.mjs
git commit -m "feat(decisions): renderer maps payload → AskUserQuestion args"
```

---

### Task 3: Non-TTY auto-resolver

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/decisions/non-tty-resolver.mjs`
- Test: `tests/agent-all/decisions/non-tty-resolver.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/decisions/non-tty-resolver.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { autoResolveAndLog } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/non-tty-resolver.mjs";

test("picks recommended index for each decision and writes state file", () => {
  const dir = mkdtempSync(join(tmpdir(), "ntr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], decisions: {} }));
  const payload = {
    status: "NEEDS_DECISIONS",
    scope: { task_id: "t1", task_title: "X" },
    decisions: [
      { id: "d1", title: "T1", context: "C1",
        options: [{ label: "A", description: "" }, { label: "B", description: "" }],
        recommended_index: 1, reasoning: "R1" },
      { id: "d2", title: "T2", context: "C2",
        options: [{ label: "X", description: "" }, { label: "Y", description: "" }],
        recommended_index: 0, reasoning: "R2" },
    ],
  };
  const resolved = autoResolveAndLog(payload, { statePath, now: () => "2026-05-21T00:00:00Z" });
  assert.deepEqual(resolved, { d1: 1, d2: 0 });
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(state.decisions.t1.d1.chosen_index, 1);
  assert.equal(state.decisions.t1.d1.auto_resolved, true);
  assert.equal(state.decisions.t1.d1.timestamp, "2026-05-21T00:00:00Z");
  assert.equal(state.decisions.t1.d2.chosen_index, 0);
});

test("returns empty when payload is NO_DECISIONS", () => {
  const dir = mkdtempSync(join(tmpdir(), "ntr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], decisions: {} }));
  const resolved = autoResolveAndLog(
    { status: "NO_DECISIONS", scope: { task_id: "t1", task_title: "X" } },
    { statePath, now: () => "2026-05-21T00:00:00Z" }
  );
  assert.deepEqual(resolved, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/decisions/non-tty-resolver.test.mjs`
Expected: FAIL with `Cannot find module 'non-tty-resolver.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/skills/agent-all/lib/decisions/non-tty-resolver.mjs
import { readFileSync, writeFileSync } from "node:fs";

export function autoResolveAndLog(payload, { statePath, now = () => new Date().toISOString() }) {
  if (payload.status !== "NEEDS_DECISIONS") return {};
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  state.decisions = state.decisions || {};
  const taskId = payload.scope.task_id;
  state.decisions[taskId] = state.decisions[taskId] || {};
  const resolved = {};
  const ts = now();
  for (const d of payload.decisions) {
    state.decisions[taskId][d.id] = {
      chosen_index: d.recommended_index,
      auto_resolved: true,
      reasoning: d.reasoning,
      timestamp: ts,
    };
    resolved[d.id] = d.recommended_index;
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return resolved;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/decisions/non-tty-resolver.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/decisions/non-tty-resolver.test.mjs plugins/harness-floor/skills/agent-all/lib/decisions/non-tty-resolver.mjs
git commit -m "feat(decisions): non-TTY resolver auto-picks recommended and logs"
```

---

### Task 4: Addendum prompt text

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/decisions/addendum.md`

- [ ] **Step 1: Write the addendum prompt text**

```markdown
<!-- plugins/harness-floor/skills/agent-all/lib/decisions/addendum.md -->
## Decision-Surfacing Protocol (injected by floor-policy hook)

**Phase 3a (Scoping Pass) — current phase:**

This invocation is a SCOPING PASS. You MUST NOT write or edit any files in this turn. Your only job:

1. Read the task description and any referenced files.
2. Identify **architectural decisions** and **spec ambiguities** the implementation will hit. Examples: library choice, file layout, abstraction boundary, conflict between spec text and existing code.
3. Return a JSON payload between fenced ` ```decision-payload ` blocks.

**Payload schema:**

```decision-payload
{
  "status": "NEEDS_DECISIONS",
  "scope": { "task_id": "<task-id>", "task_title": "<title>" },
  "decisions": [
    {
      "id": "d1",
      "title": "short label",
      "context": "1-3 sentences explaining what makes this a decision",
      "options": [
        { "label": "option A", "description": "tradeoff/consequence" },
        { "label": "option B", "description": "tradeoff/consequence" }
      ],
      "recommended_index": 0,
      "reasoning": "why this option is recommended"
    }
  ]
}
```

**Constraints:**
- `options.length` MUST be 2 to 4. If you see 5+ viable choices, condense to top 3 + a final "Other (clarify in follow-up)" option.
- `recommended_index` MUST be present and in range. The recommendation is mandatory — never punt.
- If you genuinely find no architecture/spec decisions worth surfacing, return `{"status": "NO_DECISIONS", "scope": {...}}` instead.

**After this scoping pass:** the controller will ask the user, then re-dispatch you in Phase 3c with the answers injected as `## User Decisions` in the prompt. You will then implement normally.

**Report format:** Return the JSON payload, nothing else. Verification + STATUS markers come in Phase 3c.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/lib/decisions/addendum.md
git commit -m "feat(decisions): scoping-pass prompt addendum text"
```

---

## Phase B — Policy validators

### Task 5: Verification-before-completion validator

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/policy/verification-validator.mjs`
- Test: `tests/agent-all/policy/verification-validator.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/policy/verification-validator.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVerification } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/verification-validator.mjs";

test("accepts a DONE report that includes verification_passed token", () => {
  const text = "STATUS: DONE\nFiles changed: foo.js\nverification_passed: 5/5 tests";
  const r = validateVerification(text);
  assert.equal(r.ok, true);
});

test("rejects a DONE report without verification_passed token", () => {
  const text = "STATUS: DONE\nFiles changed: foo.js";
  const r = validateVerification(text);
  assert.equal(r.ok, false);
  assert.match(r.reason, /verification/);
});

test("ignores reports with non-DONE statuses", () => {
  const text = "STATUS: BLOCKED\nReason: needs context";
  const r = validateVerification(text);
  assert.equal(r.ok, true);
});

test("accepts case-insensitive token match", () => {
  const text = "STATUS: done\nVERIFICATION_PASSED: ok";
  const r = validateVerification(text);
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/policy/verification-validator.test.mjs`
Expected: FAIL with `Cannot find module 'verification-validator.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/skills/agent-all/lib/policy/verification-validator.mjs
export function validateVerification(text) {
  if (!/STATUS:\s*DONE\b/i.test(text)) return { ok: true };
  if (/verification_passed/i.test(text)) return { ok: true };
  return {
    ok: false,
    reason: "Implementer claimed STATUS: DONE without a verification_passed log line. Re-run with verification-before-completion.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/policy/verification-validator.test.mjs`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/policy/verification-validator.test.mjs plugins/harness-floor/skills/agent-all/lib/policy/verification-validator.mjs
git commit -m "feat(policy): verification-before-completion validator"
```

---

### Task 6: Reviewer-audit validator

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/policy/reviewer-audit-validator.mjs`
- Test: `tests/agent-all/policy/reviewer-audit-validator.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/policy/reviewer-audit-validator.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReviewerAudit } from "../../../plugins/harness-floor/skills/agent-all/lib/policy/reviewer-audit-validator.mjs";

test("accepts reviewer output with VERIFICATION_AUDIT: passed", () => {
  const text = "Review complete.\nVERIFICATION_AUDIT: passed";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, true);
});

test("accepts VERIFICATION_AUDIT: failed", () => {
  const text = "Issues found.\nVERIFICATION_AUDIT: failed";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, true);
});

test("accepts VERIFICATION_AUDIT: skipped", () => {
  const text = "VERIFICATION_AUDIT: skipped";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, true);
});

test("rejects when token is missing", () => {
  const text = "Review complete. Looks good.";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, false);
  assert.match(r.reason, /VERIFICATION_AUDIT/);
});

test("rejects when audit value is something else", () => {
  const text = "VERIFICATION_AUDIT: maybe";
  const r = validateReviewerAudit(text);
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/policy/reviewer-audit-validator.test.mjs`
Expected: FAIL with `Cannot find module 'reviewer-audit-validator.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/skills/agent-all/lib/policy/reviewer-audit-validator.mjs
const TOKEN_RE = /VERIFICATION_AUDIT:\s*(passed|failed|skipped)\b/;

export function validateReviewerAudit(text) {
  if (TOKEN_RE.test(text)) return { ok: true };
  return {
    ok: false,
    reason: "Reviewer must include a line `VERIFICATION_AUDIT: passed|failed|skipped`. Token missing or value invalid.",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/policy/reviewer-audit-validator.test.mjs`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/policy/reviewer-audit-validator.test.mjs plugins/harness-floor/skills/agent-all/lib/policy/reviewer-audit-validator.mjs
git commit -m "feat(policy): reviewer-audit cross-check validator"
```

---

## Phase C — Hook entry script + installation

### Task 7: floor-policy-hook script (PreToolUse + PostToolUse router)

**Files:**
- Create: `plugins/harness-floor/bin/floor-policy-hook.mjs`
- Test: `tests/agent-all/policy/hook-router.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/policy/hook-router.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK = resolve("plugins/harness-floor/bin/floor-policy-hook.mjs");

function runHook(event, payload) {
  const result = spawnSync("node", [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("PreToolUse on Task with implementer description injects addendum", () => {
  const r = runHook("PreToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo", prompt: "do the thing" },
  });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.parameters.prompt, /Decision-Surfacing Protocol/);
});

test("PreToolUse on non-Task tool is passthrough", () => {
  const r = runHook("PreToolUse", { tool: "Read", parameters: { file_path: "x" } });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out, { tool: "Read", parameters: { file_path: "x" } });
});

test("PostToolUse on Task with DONE+verification passes through", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo" },
    result: "STATUS: DONE\nverification_passed: ok",
  });
  assert.equal(r.code, 0);
});

test("PostToolUse on Task with DONE but no verification rejects (exit non-zero)", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Implement Task 1: foo" },
    result: "STATUS: DONE\nLooks good.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /verification/);
});

test("PostToolUse on reviewer Task without VERIFICATION_AUDIT rejects", () => {
  const r = runHook("PostToolUse", {
    tool: "Task",
    parameters: { description: "Review Task 1: foo" },
    result: "STATUS: DONE\nverification_passed: ok\nLooks fine.",
  });
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /VERIFICATION_AUDIT/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/policy/hook-router.test.mjs`
Expected: FAIL with `Cannot find module 'floor-policy-hook.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/bin/floor-policy-hook.mjs
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVerification } from "../skills/agent-all/lib/policy/verification-validator.mjs";
import { validateReviewerAudit } from "../skills/agent-all/lib/policy/reviewer-audit-validator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ADDENDUM = readFileSync(
  resolve(here, "../skills/agent-all/lib/decisions/addendum.md"),
  "utf-8",
);

const REVIEWER_DIRECTIVE = `\n\n---\nAt the END of your review, output one literal line:\n\`VERIFICATION_AUDIT: passed\` if the implementer's report contained a verification log,\n\`VERIFICATION_AUDIT: failed\` if it did not,\n\`VERIFICATION_AUDIT: skipped\` only if verification was not applicable.\n`;

const VERIFICATION_DIRECTIVE = `\n\n---\nBefore reporting \`STATUS: DONE\`, you MUST run the project's tests (via superpowers:verification-before-completion) and include a literal \`verification_passed\` line in your report. Without it, the post-tool-use hook will reject the report and re-dispatch.\n`;

function isImplementerDispatch(params) {
  return typeof params?.description === "string" && /^implement task/i.test(params.description);
}
function isReviewerDispatch(params) {
  return typeof params?.description === "string" && /^review task/i.test(params.description);
}

async function readStdin() {
  return new Promise((res) => {
    let buf = "";
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => res(buf));
  });
}

async function main() {
  const event = process.argv[2];
  const raw = await readStdin();
  const payload = JSON.parse(raw);

  if (payload.tool !== "Task") {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  const params = payload.parameters || {};
  const isImpl = isImplementerDispatch(params);
  const isRev = isReviewerDispatch(params);
  if (!isImpl && !isRev) {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  if (event === "PreToolUse") {
    if (isImpl) {
      params.prompt = `${params.prompt || ""}\n\n${ADDENDUM}${VERIFICATION_DIRECTIVE}`;
    } else if (isRev) {
      params.prompt = `${params.prompt || ""}${REVIEWER_DIRECTIVE}`;
    }
    process.stdout.write(JSON.stringify({ ...payload, parameters: params }));
    process.exit(0);
  }

  if (event === "PostToolUse") {
    const text = payload.result || "";
    if (isImpl) {
      const v = validateVerification(text);
      if (!v.ok) {
        process.stderr.write(v.reason);
        process.exit(2);
      }
    }
    if (isRev) {
      const v = validateReviewerAudit(text);
      if (!v.ok) {
        process.stderr.write(v.reason);
        process.exit(2);
      }
    }
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write(`floor-policy-hook error: ${e.message}`);
  process.exit(1);
});
```

- [ ] **Step 4: Make script executable**

```bash
chmod +x plugins/harness-floor/bin/floor-policy-hook.mjs
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/agent-all/policy/hook-router.test.mjs`
Expected: PASS (5/5)

- [ ] **Step 6: Commit**

```bash
git add tests/agent-all/policy/hook-router.test.mjs plugins/harness-floor/bin/floor-policy-hook.mjs
git commit -m "feat(policy): unified floor-policy hook (Pre+Post on Task)"
```

---

### Task 8: Hook installation wiring

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs` (or wherever install runs) — add new helper
- Create: `plugins/harness-floor/bin/install-floor-policy.mjs` — install/uninstall the hook
- Test: `tests/agent-all/policy/install.test.mjs`

- [ ] **Step 1: Read current install pattern**

```bash
grep -n "settings.local.json" plugins/harness-floor/ -r | head -5
```

(This is exploratory; the next step writes a test against a known-good shape.)

- [ ] **Step 2: Write the failing test**

```javascript
// tests/agent-all/policy/install.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFloorPolicy, uninstallFloorPolicy } from "../../../plugins/harness-floor/bin/install-floor-policy.mjs";

test("install adds PreToolUse + PostToolUse entries with sentinel paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  mkdirSync(join(dir, ".claude"));
  const settings = join(dir, ".claude/settings.local.json");
  writeFileSync(settings, JSON.stringify({ hooks: {} }));
  installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/floor-policy-hook.mjs" });
  const s = JSON.parse(readFileSync(settings, "utf-8"));
  const pre = (s.hooks.PreToolUse || []).find((h) => h.command?.includes("floor-policy-"));
  const post = (s.hooks.PostToolUse || []).find((h) => h.command?.includes("floor-policy-"));
  assert.ok(pre, "PreToolUse entry missing");
  assert.ok(post, "PostToolUse entry missing");
  assert.match(pre.command, /floor-policy-/);
  assert.match(post.command, /floor-policy-/);
});

test("install is idempotent (no duplicates)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  mkdirSync(join(dir, ".claude"));
  const settings = join(dir, ".claude/settings.local.json");
  writeFileSync(settings, JSON.stringify({ hooks: {} }));
  installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/h.mjs" });
  installFloorPolicy({ projectDir: dir, hookScriptAbsPath: "/abs/path/h.mjs" });
  const s = JSON.parse(readFileSync(settings, "utf-8"));
  const pre = (s.hooks.PreToolUse || []).filter((h) => h.command?.includes("floor-policy-"));
  assert.equal(pre.length, 1);
});

test("uninstall removes only floor-policy entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "ifp-"));
  mkdirSync(join(dir, ".claude"));
  const settings = join(dir, ".claude/settings.local.json");
  writeFileSync(settings, JSON.stringify({
    hooks: { PreToolUse: [{ command: "other-hook" }, { command: "floor-policy-pre h.mjs" }] }
  }));
  uninstallFloorPolicy({ projectDir: dir });
  const s = JSON.parse(readFileSync(settings, "utf-8"));
  const pre = s.hooks.PreToolUse;
  assert.equal(pre.length, 1);
  assert.equal(pre[0].command, "other-hook");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/agent-all/policy/install.test.mjs`
Expected: FAIL with `Cannot find module 'install-floor-policy.mjs'`

- [ ] **Step 4: Write minimal implementation**

```javascript
// plugins/harness-floor/bin/install-floor-policy.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SENTINEL_PRE = "floor-policy-pre";
const SENTINEL_POST = "floor-policy-post";

function loadSettings(dir) {
  const p = join(dir, ".claude/settings.local.json");
  if (!existsSync(p)) return { path: p, json: { hooks: {} } };
  return { path: p, json: JSON.parse(readFileSync(p, "utf-8")) };
}

function ensureHooks(json) {
  json.hooks = json.hooks || {};
  json.hooks.PreToolUse = json.hooks.PreToolUse || [];
  json.hooks.PostToolUse = json.hooks.PostToolUse || [];
  return json;
}

export function installFloorPolicy({ projectDir, hookScriptAbsPath }) {
  const { path, json } = loadSettings(projectDir);
  ensureHooks(json);
  const preCmd = `${SENTINEL_PRE} node ${hookScriptAbsPath} PreToolUse`;
  const postCmd = `${SENTINEL_POST} node ${hookScriptAbsPath} PostToolUse`;
  if (!json.hooks.PreToolUse.some((h) => h.command?.includes(SENTINEL_PRE))) {
    json.hooks.PreToolUse.push({ matcher: "Task", command: preCmd });
  }
  if (!json.hooks.PostToolUse.some((h) => h.command?.includes(SENTINEL_POST))) {
    json.hooks.PostToolUse.push({ matcher: "Task", command: postCmd });
  }
  writeFileSync(path, JSON.stringify(json, null, 2));
}

export function uninstallFloorPolicy({ projectDir }) {
  const { path, json } = loadSettings(projectDir);
  ensureHooks(json);
  json.hooks.PreToolUse = json.hooks.PreToolUse.filter((h) => !h.command?.includes("floor-policy-"));
  json.hooks.PostToolUse = json.hooks.PostToolUse.filter((h) => !h.command?.includes("floor-policy-"));
  writeFileSync(path, JSON.stringify(json, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  const projectDir = process.argv[3] || process.cwd();
  const scriptPath = new URL("./floor-policy-hook.mjs", import.meta.url).pathname;
  if (cmd === "install") installFloorPolicy({ projectDir, hookScriptAbsPath: scriptPath });
  else if (cmd === "uninstall") uninstallFloorPolicy({ projectDir });
  else { console.error("usage: install-floor-policy.mjs install|uninstall [dir]"); process.exit(1); }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/agent-all/policy/install.test.mjs`
Expected: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add tests/agent-all/policy/install.test.mjs plugins/harness-floor/bin/install-floor-policy.mjs
git commit -m "feat(policy): install/uninstall floor-policy hook in settings.local.json"
```

---

## Phase D — Harness wiring

### Task 9: decision-router (wave coordinator)

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/lib/decision-router.mjs`
- Test: `tests/agent-all/decisions/decision-router.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/decisions/decision-router.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeWaveDecisions } from "../../../plugins/harness-floor/skills/agent-all/lib/decision-router.mjs";

function payload(taskId, decisions) {
  return { status: decisions.length ? "NEEDS_DECISIONS" : "NO_DECISIONS",
           scope: { task_id: taskId, task_title: taskId },
           decisions };
}
function dec(id, recIdx) {
  return { id, title: id, context: "ctx",
           options: [{ label: "A", description: "" }, { label: "B", description: "" }],
           recommended_index: recIdx, reasoning: "r" };
}

test("non-TTY mode resolves all decisions to recommended and returns answer map", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ decisions: {} }));
  const result = await routeWaveDecisions({
    payloads: [payload("t1", [dec("d1", 0), dec("d2", 1)]), payload("t2", [dec("d1", 1)])],
    statePath, isTTY: false,
    askUser: async () => { throw new Error("should not call user in non-TTY"); },
  });
  assert.deepEqual(result.answers.t1, { d1: 0, d2: 1 });
  assert.deepEqual(result.answers.t2, { d1: 1 });
});

test("TTY mode calls askUser sequentially per task, per decision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ decisions: {} }));
  const calls = [];
  const result = await routeWaveDecisions({
    payloads: [payload("t1", [dec("d1", 0)]), payload("t2", [dec("d1", 0)])],
    statePath, isTTY: true,
    askUser: async (q) => { calls.push(q.questions[0].header); return 1; }, // user picks index 1 each time
  });
  assert.deepEqual(calls.length, 2);
  assert.equal(result.answers.t1.d1, 1);
  assert.equal(result.answers.t2.d1, 1);
});

test("NO_DECISIONS payloads produce empty answer maps", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dr-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ decisions: {} }));
  const result = await routeWaveDecisions({
    payloads: [payload("t1", [])],
    statePath, isTTY: true,
    askUser: async () => { throw new Error("should not call"); },
  });
  assert.deepEqual(result.answers.t1, {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/decisions/decision-router.test.mjs`
Expected: FAIL with `Cannot find module 'decision-router.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// plugins/harness-floor/skills/agent-all/lib/decision-router.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { autoResolveAndLog } from "./decisions/non-tty-resolver.mjs";
import { renderToAskUserQuestion } from "./decisions/renderer.mjs";

export async function routeWaveDecisions({ payloads, statePath, isTTY, askUser }) {
  const answers = {};
  for (const p of payloads) {
    const taskId = p.scope.task_id;
    if (p.status === "NO_DECISIONS" || !p.decisions || p.decisions.length === 0) {
      answers[taskId] = {};
      continue;
    }
    if (!isTTY) {
      answers[taskId] = autoResolveAndLog(p, { statePath });
      continue;
    }
    answers[taskId] = {};
    for (const decision of p.decisions) {
      const args = renderToAskUserQuestion(decision, { taskTitle: p.scope.task_title });
      const chosenLabel = await askUser(args);
      const originalIdx = mapBackToOriginalIndex(decision, chosenLabel);
      answers[taskId][decision.id] = originalIdx;
      persistAnswer(statePath, taskId, decision.id, originalIdx, false);
    }
  }
  return { answers };
}

function mapBackToOriginalIndex(decision, chosen) {
  // chosen is the index user picked in the *reordered* (recommended-first) list.
  // The first slot was recommended_index; the rest were the others in original order.
  if (typeof chosen === "number") {
    if (chosen === 0) return decision.recommended_index;
    const others = decision.options.map((_, i) => i).filter((i) => i !== decision.recommended_index);
    return others[chosen - 1];
  }
  return decision.recommended_index;
}

function persistAnswer(statePath, taskId, decisionId, idx, autoResolved) {
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  state.decisions = state.decisions || {};
  state.decisions[taskId] = state.decisions[taskId] || {};
  state.decisions[taskId][decisionId] = {
    chosen_index: idx, auto_resolved: autoResolved, timestamp: new Date().toISOString(),
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/decisions/decision-router.test.mjs`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/decisions/decision-router.test.mjs plugins/harness-floor/skills/agent-all/lib/decision-router.mjs
git commit -m "feat(decisions): wave decision-router (TTY + non-TTY paths)"
```

---

### Task 10: Update phases/3-dispatch.md to 3a / 3b / 3c

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`

- [ ] **Step 1: Replace dispatch phase content**

Read existing content at `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`, then replace the body (after `# Phase 3 — Dispatch`) with:

```markdown
# Phase 3 — Dispatch (3a Scoping → 3b Ask → 3c Implement)

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`
- `config.policy.decisionSurfacing` (default true)

## Steps

1. Parse the plan file. Extract task list using:
   ```javascript
   const text = readFileSync(plan.path, "utf-8");
   const headings = [...text.matchAll(/^### Task (\d+):\s*(.+)$/gm)];
   const tasks = headings.map((m, i) => {
     const next = headings[i + 1]?.index ?? text.length;
     const section = text.slice(m.index, next);
     const files = [...section.matchAll(/^- (?:Create|Modify):\s*`([^`]+)`/gm)].map(x => x[1]);
     const role = (/role:\s*(\w[\w-]*)/i.exec(section) ?? [])[1] ?? "dev";
     return { id: parseInt(m[1], 10), title: m[2].trim(), files, role };
   });
   ```

2. Build waves: `const waves = buildWaves(tasks, config.waves[waveSize])` from `lib/wave-builder.mjs`.

3. For each wave, run sub-phases **3a → 3b → 3c**:

### 3a — Scoping (parallel)

a. Dispatch one Task subagent per task in the wave with description `Implement Task N: <title>` and a prompt containing the mini-plan ONLY (no addendum text — the `floor-policy` PreToolUse hook injects the scoping addendum + verification directive automatically).
b. Collect each return as a JSON payload between ` ```decision-payload ` fences. Parse with `lib/decisions/schema.mjs` `validateDecisionPayload`. If `result.ok === false`, treat as `NO_DECISIONS` and log a warning.

### 3b — Ask (sequential UI per task)

a. If `config.policy.decisionSurfacing === false`, skip 3b entirely and use empty answer map for all tasks.
b. Call `lib/decision-router.mjs` `routeWaveDecisions({ payloads, statePath, isTTY, askUser })`.
   - `isTTY = process.stdout.isTTY && !flags.yes && iteration === 1`. Loop iteration > 1 forces non-TTY.
   - `askUser` invokes `AskUserQuestion` with the renderer's args. The returned index is mapped back through the router.
c. Persist `state.decisions` to `.agent-all-state.json` after every individual answer (resumable).

### 3c — Implementation (parallel re-dispatch)

a. For each task, build a fresh prompt: the original mini-plan PLUS a section `## User Decisions for This Task` listing `decision.title → chosen option label + description`.
b. Re-dispatch implementer subagent. PostToolUse hook validates `STATUS: DONE` came with `verification_passed` line.
c. Phase 4 (Gate) reviewer subagents likewise get the `Review Task N: <title>` description; PreToolUse hook injects the `VERIFICATION_AUDIT` directive; PostToolUse hook validates the token's presence.

4. Capture wave result: `{index: i, tasks: [{id, status, commits, decisions: state.decisions[id]}], status: "completed"|"incomplete"}`.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If a 3a scoping subagent returns invalid JSON or a payload that fails schema validation: treat as `NO_DECISIONS` for that task and log a warning to `state.warnings`.
- If a 3c implementer reports BLOCKED for >1 task in a wave: mark wave `incomplete`. Phase 4 will decide whether to retry or abort.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Per-subagent verification (safety net)

Now enforced by the `floor-policy` hook (Pre+Post on `Task`). The hook auto-injects:

- For implementer dispatches (`description: "Implement Task ..."`): scoping-pass addendum + verification directive.
- For reviewer dispatches (`description: "Review Task ..."`): `VERIFICATION_AUDIT` directive.

PostToolUse validates each. A failing implementer (claims DONE without verification log) or failing reviewer (omits `VERIFICATION_AUDIT:` line) is rejected — the controller must re-dispatch with the hook's error message visible.

## Output to user

Print per wave:
```
Wave <i> — scoping <N>/<N>, ask <K>/<N>, implement <M>/<N>
```
Print decision summary in non-TTY mode:
```
[wave i] auto-resolved 5 decisions across 3 tasks → docs/agent-all/iter-<n>/decisions.md
```
```

- [ ] **Step 2: Verify formatting renders**

Run: `head -10 plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`
Expected: First line is `# Phase 3 — Dispatch (3a Scoping → 3b Ask → 3c Implement)`

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/3-dispatch.md
git commit -m "docs(agent-all): phase 3 split into 3a scoping / 3b ask / 3c implement"
```

---

### Task 11: config-loader supports `policy` opt-out

**Files:**
- Modify: `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`
- Test: `tests/agent-all/lib/config-loader-policy.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/agent-all/lib/config-loader-policy.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentAllConfig } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

test("defaults all policy flags to true when .agent-all.json has no policy key", () => {
  const dir = mkdtempSync(join(tmpdir(), "clp-"));
  writeFileSync(join(dir, ".agent-all.json"), JSON.stringify({ breakCondition: "npm test" }));
  const cfg = loadAgentAllConfig(dir);
  assert.equal(cfg.policy.decisionSurfacing, true);
  assert.equal(cfg.policy.verification, true);
  assert.equal(cfg.policy.reviewerAudit, true);
});

test("respects explicit policy flags", () => {
  const dir = mkdtempSync(join(tmpdir(), "clp-"));
  writeFileSync(join(dir, ".agent-all.json"), JSON.stringify({
    breakCondition: "npm test",
    policy: { decisionSurfacing: false, verification: true, reviewerAudit: false },
  }));
  const cfg = loadAgentAllConfig(dir);
  assert.equal(cfg.policy.decisionSurfacing, false);
  assert.equal(cfg.policy.verification, true);
  assert.equal(cfg.policy.reviewerAudit, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/agent-all/lib/config-loader-policy.test.mjs`
Expected: FAIL (either `loadAgentAllConfig` not exported, or `policy` undefined)

- [ ] **Step 3: Read existing config-loader and add policy merge**

Open `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`. Locate the return statement of `loadAgentAllConfig` (or equivalent). Add policy normalization. If the function does not currently exist as named, add this export:

```javascript
// Append to plugins/harness-floor/skills/agent-all/lib/config-loader.mjs
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_POLICY = {
  decisionSurfacing: true,
  verification: true,
  reviewerAudit: true,
};

export function loadAgentAllConfig(projectDir) {
  const p = join(projectDir, ".agent-all.json");
  const raw = existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : {};
  return {
    ...raw,
    policy: { ...DEFAULT_POLICY, ...(raw.policy || {}) },
  };
}
```

(If the file already has `loadAgentAllConfig` defined for other purposes, merge — do not duplicate. Use `git diff` to verify.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/agent-all/lib/config-loader-policy.test.mjs`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/lib/config-loader-policy.test.mjs plugins/harness-floor/skills/agent-all/lib/config-loader.mjs
git commit -m "feat(config): .agent-all.json policy opt-out flags (default all true)"
```

---

### Task 12: State file schema bump (`.agent-all-state.json` decisions key)

**Files:**
- Modify: state-file templates (search `phases/0-preflight.md` or wherever state is initialized)
- Test: extend integration test in Task 21

- [ ] **Step 1: Find state file initialization**

```bash
grep -rn "agent-all-state.json" plugins/harness-floor/ | head -5
```

- [ ] **Step 2: Add `decisions: {}` to initial state shape**

Whatever file currently creates `.agent-all-state.json` (likely `phases/0-preflight.md` references its shape, or a `lib/state.mjs`): add `decisions: {}` to the initial object literal. If the shape is documented in the phase markdown, update both:

```javascript
const initialState = {
  phase: 0,
  phases: [],
  waves: [],
  decisions: {},        // NEW — per-task decision answers populated by Phase 3b
  warnings: [],
  startedAt: new Date().toISOString(),
};
```

- [ ] **Step 3: Verify no existing test relied on absence of `decisions`**

```bash
grep -rn "\.agent-all-state" tests/ | head
```

Update any that hard-asserted the full state shape (likely none — they tend to spot-check fields).

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-floor/
git commit -m "feat(state): add 'decisions' key to .agent-all-state.json initial shape"
```

---

## Phase E — Per-platform port vendoring

### Task 13: Extend `scripts/sync-lib.mjs` to vendor `decisions/` + `policy/`

**Files:**
- Modify: `scripts/sync-lib.mjs`

- [ ] **Step 1: Read current sync-lib.mjs structure**

Run: `cat scripts/sync-lib.mjs | head -80`. Note the `SOURCE_LIB`, `VENDORED_LIBS`, and `VENDORED_RENDER_ONLY` arrays.

- [ ] **Step 2: Add a new source + targets for decisions+policy libs**

Append after the existing `VENDORED_RENDER_ONLY` block:

```javascript
const DECISION_SOURCE = resolve(
  repoRoot,
  "plugins/harness-floor/skills/agent-all/lib",
);

const DECISION_FILES = [
  "decisions/schema.mjs",
  "decisions/renderer.mjs",
  "decisions/non-tty-resolver.mjs",
  "decisions/addendum.md",
  "policy/verification-validator.mjs",
  "policy/reviewer-audit-validator.mjs",
];

const DECISION_VENDORED_TARGETS = [
  "plugins/harness-floor-cursor/lib",
  "plugins/harness-floor-copilot/lib",
  "plugins/harness-floor-codex/lib",
  "plugins/harness-floor-gemini/lib",
].map((p) => resolve(repoRoot, p));
```

Then in the main sync loop, add a second pass that copies each file in `DECISION_FILES` from `DECISION_SOURCE/<file>` to each `DECISION_VENDORED_TARGETS/<file>`, mirroring the existing pattern (use `mkdirSync({ recursive: true })` before `writeFileSync`).

- [ ] **Step 3: Run sync to populate vendored copies**

```bash
node scripts/sync-lib.mjs
```

Expected output includes lines like `copied lib/decisions/schema.mjs → harness-floor-cursor/lib/decisions/schema.mjs`.

- [ ] **Step 4: Run `--check` mode to confirm parity**

```bash
node scripts/sync-lib.mjs --check
```

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-lib.mjs plugins/harness-floor-{cursor,copilot,codex,gemini}/lib/
git commit -m "feat(sync-lib): vendor decisions/ + policy/ libs to per-platform ports"
```

---

### Task 14: Cursor port emits decision-protocol rule

**Files:**
- Modify: `plugins/harness-floor-cursor/bin/install.mjs` (or equivalent emitter)
- Create (emitted by emitter, but commit the emitter changes): logic to write `.cursor/rules/decision-protocol.mdc` into target project

- [ ] **Step 1: Read current Cursor emitter pattern**

Run: `cat plugins/harness-floor-cursor/bin/install.mjs | head -60`. Identify how it writes `.cursor/rules/*.mdc` for other rules.

- [ ] **Step 2: Add emit for decision-protocol rule**

In the emitter function, add a block that writes `<targetDir>/.cursor/rules/decision-protocol.mdc` with content:

```markdown
---
description: Decision-surfacing protocol for Cursor agent subagents
globs: ["**"]
alwaysApply: false
---

# Decision-Surfacing Protocol (soft-enforced on Cursor)

When you (Cursor agent) dispatch a sub-task or are dispatched as a sub-task for implementation work:

1. **Scoping Pass first.** Before writing/editing any file, identify:
   - architectural decisions (library/API choice, file layout, abstraction)
   - spec ambiguities (cases where the spec contradicts or omits behavior)

2. **Surface them as a JSON payload** in your reply, between ` ```decision-payload ` fences. Schema:
   ```json
   {
     "status": "NEEDS_DECISIONS",
     "scope": { "task_id": "...", "task_title": "..." },
     "decisions": [
       { "id": "d1", "title": "...", "context": "...",
         "options": [{"label":"...","description":"..."}, ...],
         "recommended_index": 0, "reasoning": "..." }
     ]
   }
   ```

3. **Constraints:** 2-4 options; recommended_index required; if no real decisions, return `{"status":"NO_DECISIONS","scope":{...}}`.

4. **No file edits in the scoping pass.** Wait for the user to choose, then proceed.

**Limitation:** Cursor does not have a tool-call hook system. This rule is prompt-only — a non-compliant subagent cannot be blocked. The verdict still surfaces in the next-step review.
```

- [ ] **Step 3: Write a smoke test for the emitter**

```javascript
// tests/lib/harness-floor-cursor-emit.test.mjs (extend existing if present)
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("Cursor emitter writes decision-protocol.mdc", () => {
  const dir = mkdtempSync(join(tmpdir(), "cur-"));
  const r = spawnSync("node", ["plugins/harness-floor-cursor/bin/install.mjs", dir, "--theme=floor"]);
  assert.equal(r.status, 0);
  const p = join(dir, ".cursor/rules/decision-protocol.mdc");
  assert.ok(existsSync(p), "decision-protocol.mdc missing");
  assert.match(readFileSync(p, "utf-8"), /NEEDS_DECISIONS/);
});
```

- [ ] **Step 4: Run test, verify install + commit**

```bash
node --test tests/lib/harness-floor-cursor-emit.test.mjs
git add plugins/harness-floor-cursor/ tests/lib/harness-floor-cursor-emit.test.mjs
git commit -m "feat(cursor-port): emit decision-protocol.mdc rule (soft-enforce)"
```

---

### Task 15: Copilot CLI port emits hook JSON

**Files:**
- Modify: `plugins/harness-floor-copilot/bin/install.mjs`
- Test: `tests/lib/harness-floor-copilot-emit.test.mjs`

- [ ] **Step 1: Add emit logic for `.github/hooks/decision-protocol.json`**

In the emitter, after existing hook emits, append:

```javascript
const decisionHook = {
  name: "floor-policy-decision-protocol",
  event: "pre-tool-use",
  matcher: { tool: "Task" },
  command: `node ${join(targetDir, "node_modules/.bin/floor-policy-hook.mjs")} PreToolUse`,
};
writeFileSync(
  join(targetDir, ".github/hooks/decision-protocol.json"),
  JSON.stringify(decisionHook, null, 2)
);
```

And ensure the post-tool-use entry also gets emitted (mirror).

- [ ] **Step 2: Write smoke test (mirror Task 14's pattern)**

```javascript
test("Copilot emitter writes decision-protocol hook JSONs", () => {
  const dir = mkdtempSync(join(tmpdir(), "cop-"));
  const r = spawnSync("node", ["plugins/harness-floor-copilot/bin/install.mjs", dir, "--theme=floor"]);
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(dir, ".github/hooks/decision-protocol.json")));
});
```

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor-copilot/ tests/lib/harness-floor-copilot-emit.test.mjs
git commit -m "feat(copilot-port): emit decision-protocol hook JSON (hard-enforce)"
```

---

### Task 16: Codex CLI port emits config.toml snippet to stdout

**Files:**
- Modify: `plugins/harness-floor-codex/bin/install.mjs`

- [ ] **Step 1: Add stdout snippet for `[[hooks.agent]]`**

In the emitter, after existing snippet output, append to the stdout block:

```toml
# Append to ~/.codex/config.toml — required for decision-surfacing enforcement

[[hooks.agent]]
event = "pre_tool_use"
match = { tool = "Task" }
command = "node $CODEX_PROJECT_DIR/.codex/skills/floor-policy/floor-policy-hook.mjs PreToolUse"

[[hooks.agent]]
event = "post_tool_use"
match = { tool = "Task" }
command = "node $CODEX_PROJECT_DIR/.codex/skills/floor-policy/floor-policy-hook.mjs PostToolUse"
```

- [ ] **Step 2: Also emit the script to `.codex/skills/floor-policy/floor-policy-hook.mjs` (vendored copy)**

- [ ] **Step 3: Smoke test**

```javascript
test("Codex emitter prints hook snippet to stdout", () => {
  const dir = mkdtempSync(join(tmpdir(), "cdx-"));
  const r = spawnSync("node", ["plugins/harness-floor-codex/bin/install.mjs", dir, "--theme=floor"], { encoding: "utf-8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[\[hooks\.agent\]\]/);
  assert.match(r.stdout, /post_tool_use/);
});
```

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-floor-codex/ tests/lib/harness-floor-codex-emit.test.mjs
git commit -m "feat(codex-port): emit decision-protocol hook snippet (hard-enforce after manual merge)"
```

---

### Task 17: Gemini CLI port emits GEMINI.md addendum section

**Files:**
- Modify: `plugins/harness-floor-gemini/bin/install.mjs`

- [ ] **Step 1: Add emit logic for `GEMINI.md` appendix section**

In the emitter, after writing `GEMINI.md` core content, append a section reading from `lib/decisions/addendum.md` (vendored), prefaced with a "Soft-enforcement" callout:

```markdown

---

## Decision-Surfacing Protocol (soft-enforced on Gemini)

> **Note:** Gemini CLI does not have a tool-call hook system today. This protocol is prompt-only; a non-compliant subagent cannot be blocked at the harness layer. Compliance is best-effort.

<content from addendum.md>
```

- [ ] **Step 2: Smoke test**

```javascript
test("Gemini emitter writes Decision-Surfacing section to GEMINI.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "gem-"));
  spawnSync("node", ["plugins/harness-floor-gemini/bin/install.mjs", dir, "--theme=floor"]);
  const md = readFileSync(join(dir, "GEMINI.md"), "utf-8");
  assert.match(md, /Decision-Surfacing Protocol/);
  assert.match(md, /soft-enforced/);
});
```

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor-gemini/ tests/lib/harness-floor-gemini-emit.test.mjs
git commit -m "feat(gemini-port): append decision-protocol section to GEMINI.md (soft-enforce)"
```

---

### Task 18: VS Code Copilot port — `.github/copilot-instructions.md` addendum

**Files:**
- Modify: `plugins/harness-floor-copilot/bin/install.mjs` (vscode-copilot path branch — same emitter as Copilot CLI per README L446)

- [ ] **Step 1: In the emitter, when target platform is `vscode-copilot`, ALSO append the decision section to `.github/copilot-instructions.md`**

```javascript
const instructionsPath = join(targetDir, ".github/copilot-instructions.md");
const existing = existsSync(instructionsPath) ? readFileSync(instructionsPath, "utf-8") : "";
const append = readFileSync(resolve(here, "../lib/decisions/addendum.md"), "utf-8");
const block = `\n\n---\n\n## Decision-Surfacing (soft-enforced — VS Code Copilot has no hook events)\n\n${append}`;
if (!existing.includes("Decision-Surfacing")) {
  writeFileSync(instructionsPath, existing + block);
}
```

- [ ] **Step 2: Smoke test**

```javascript
test("VS Code Copilot emitter appends decision section to copilot-instructions.md", () => {
  const dir = mkdtempSync(join(tmpdir(), "vsc-"));
  spawnSync("node", ["plugins/harness-floor-copilot/bin/install.mjs", dir, "--theme=floor", "--platform=vscode-copilot"]);
  const md = readFileSync(join(dir, ".github/copilot-instructions.md"), "utf-8");
  assert.match(md, /Decision-Surfacing/);
});
```

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor-copilot/ tests/lib/harness-floor-vscode-emit.test.mjs
git commit -m "feat(vscode-copilot): append decision-protocol to copilot-instructions.md (soft-enforce)"
```

---

## Phase F — Integration tests

### Task 19: End-to-end non-TTY smoke

**Files:**
- Create: `tests/agent-all/scenarios/decision-surfacing-non-tty.test.mjs`

- [ ] **Step 1: Write integration test**

```javascript
// tests/agent-all/scenarios/decision-surfacing-non-tty.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeWaveDecisions } from "../../../plugins/harness-floor/skills/agent-all/lib/decision-router.mjs";
import { validateDecisionPayload } from "../../../plugins/harness-floor/skills/agent-all/lib/decisions/schema.mjs";

test("end-to-end: 3 scoping payloads → non-TTY auto-resolve → state file populated → answers usable for re-dispatch", async () => {
  const dir = mkdtempSync(join(tmpdir(), "e2e-"));
  const statePath = join(dir, ".agent-all-state.json");
  writeFileSync(statePath, JSON.stringify({ phases: [], waves: [], decisions: {}, warnings: [] }));

  const scopingReturns = [
    `\`\`\`decision-payload
{ "status": "NEEDS_DECISIONS", "scope": { "task_id": "task-1", "task_title": "Add OAuth" },
  "decisions": [{ "id": "d1", "title": "Token storage", "context": "...",
    "options": [{"label":"Cookie","description":""},{"label":"localStorage","description":""}],
    "recommended_index": 0, "reasoning": "Aligns with session pattern" }] }
\`\`\``,
    `\`\`\`decision-payload
{ "status": "NO_DECISIONS", "scope": { "task_id": "task-2", "task_title": "Profile UI" } }
\`\`\``,
    `\`\`\`decision-payload
{ "status": "NEEDS_DECISIONS", "scope": { "task_id": "task-3", "task_title": "Refactor auth.ts" },
  "decisions": [{ "id": "d1", "title": "Extraction boundary", "context": "...",
    "options": [{"label":"Per-file","description":""},{"label":"Per-module","description":""},{"label":"Inline","description":""}],
    "recommended_index": 1, "reasoning": "Module boundary" }] }
\`\`\``,
  ];

  const payloads = scopingReturns.map(extractPayload);
  for (const p of payloads) {
    const v = validateDecisionPayload(p);
    assert.equal(v.ok, true, `payload invalid: ${v.errors.join(", ")}`);
  }
  const result = await routeWaveDecisions({ payloads, statePath, isTTY: false, askUser: () => { throw new Error(); } });
  assert.deepEqual(result.answers["task-1"], { d1: 0 });
  assert.deepEqual(result.answers["task-2"], {});
  assert.deepEqual(result.answers["task-3"], { d1: 1 });
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  assert.equal(state.decisions["task-1"].d1.auto_resolved, true);
  assert.equal(state.decisions["task-3"].d1.chosen_index, 1);
});

function extractPayload(text) {
  const m = text.match(/```decision-payload\s*([\s\S]*?)```/);
  return JSON.parse(m[1]);
}
```

- [ ] **Step 2: Run, verify, commit**

```bash
node --test tests/agent-all/scenarios/decision-surfacing-non-tty.test.mjs
git add tests/agent-all/scenarios/decision-surfacing-non-tty.test.mjs
git commit -m "test(scenarios): end-to-end decision-surfacing non-TTY smoke"
```

---

### Task 20: Cross-platform isolation test exception for shared decisions+policy libs

**Files:**
- Modify: `tests/lib/cross-platform-isolation.test.mjs`

- [ ] **Step 1: Inspect current rule**

Run: `cat tests/lib/cross-platform-isolation.test.mjs | head -60`. Identify how it lists forbidden imports.

- [ ] **Step 2: Update test to allow vendored `decisions/` + `policy/` paths**

The rule typically asserts that no file in `plugins/A/...` imports from `plugins/B/...`. Add an explicit allowlist clause: vendored copies under `plugins/*/lib/decisions/` and `plugins/*/lib/policy/` are allowed because they are written by `scripts/sync-lib.mjs`, not actual imports across plugins. (If the test does file-path AST analysis, this is a no-op since vendored copies don't `import` cross-plugin — they ARE the local copies. Confirm by reading.)

- [ ] **Step 3: Run full test suite**

```bash
node --test
```

Expected: all green, including the existing isolation test.

- [ ] **Step 4: Commit (if any change was needed)**

```bash
git add tests/lib/cross-platform-isolation.test.mjs
git commit -m "test(isolation): document vendored decisions/policy libs as allowed"
```

(If no test change was actually needed, skip the commit.)

---

### Task 21: Full test-suite green check

**Files:** (no new code; verification step)

- [ ] **Step 1: Run the entire test suite**

```bash
node --test
```

Expected: `tests N pass` where N ≥ 1246 + new tests added in this plan (target ~1290+). 0 fails.

- [ ] **Step 2: Run sync-lib check**

```bash
node scripts/sync-lib.mjs --check
```

Expected: exit 0.

- [ ] **Step 3: If any failures, fix in place before proceeding to Phase G docs**

This is a gate. Do not proceed to documentation until both checks are green.

---

## Phase G — Documentation (all at the end)

> Per user instruction (2026-05-21): all documentation work is done after implementation is complete and tests pass.

### Task 22: README.md — Known limitations + decision-surfacing callout + table refresh

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add "Known limitations" subsection just below "Status"**

Locate the `## Status` heading. After its table, insert:

```markdown
---

## Known limitations

- **Cursor / Gemini / VS Code Copilot enforcement is soft.** Those platforms don't expose tool-call hooks, so the decision-surfacing protocol is prompt-injected via rules / `GEMINI.md` / `copilot-instructions.md`. A non-compliant subagent cannot be blocked at the harness layer. Claude Code / Copilot CLI / Codex CLI get hard hook enforcement.

- **Non-TTY auto-pick can be wrong.** Overnight runs auto-resolve every decision to the subagent's `recommended_index`. Mistakes only surface the next morning. Every auto-pick is logged with reasoning to `docs/agent-all/iter-<N>/decisions.md` so the next iteration's plan can surface past picks for re-review.

- **`description`-based dispatch routing.** The policy hook identifies implementer/reviewer subagents by `Task` tool `description` (`"Implement Task ..."` / `"Review Task ..."`). User-dispatched subagents that happen to use those words also trigger the protocol. The opt-out is per-project via `.agent-all.json`'s `policy: {decisionSurfacing: false}`.

- **`/explore` rarely fires the protocol.** It's read-only and seldom faces architectural decisions. The hook is installed for consistency; in practice, it's a no-op for explore.

- **Per-task scoping pass adds ~15-20% subagent cost.** Each implementer is dispatched twice (scoping + impl). `--max-cost` still governs.
```

- [ ] **Step 2: Add a brief decision-surfacing callout in "Self-sustaining workflows"**

After the "Why this works — main-thread isolation" subsection (and its table), insert:

```markdown
### Decision-surfacing — when subagents pause for input

`/agent-all` Phase 3 now runs as **3a (scoping) → 3b (ask) → 3c (implement)**. Each implementer subagent first does a read-only scoping pass and returns architectural / spec-ambiguity decisions. Main shows them as a 1/2/3 table (with the subagent's recommendation flagged) via `AskUserQuestion`. The subagent is then re-dispatched with the answers baked in.

In **non-TTY mode** (overnight loops, `--yes`, iteration ≥ 2), recommended options are auto-picked and logged to `.agent-all-state.json` + `docs/agent-all/iter-<N>/decisions.md`. The overnight workflow is preserved.

Opt out per project in `.agent-all.json`:
```json
{ "policy": { "decisionSurfacing": false } }
```

See `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md` for the full design.
```

- [ ] **Step 3: Refresh "Main-thread isolation" table**

Find the table titled "Why this works — main-thread isolation". Update Phase 3 row:

```markdown
| **3 Dispatch (3a/3b/3c)** | **fresh subagents (parallel) + main (sequential ask)** | scoping payloads + user-selected answers (~few-hundred tokens per task) |
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): known-limitations + decision-surfacing callout + phase-3 table refresh"
```

---

### Task 23: README.ko.md — same updates in Korean

**Files:**
- Modify: `README.ko.md`

- [ ] **Step 1: Mirror the three insertions from Task 22 in Korean**

Translate the Known limitations block:

```markdown
---

## 알려진 한계

- **Cursor / Gemini / VS Code Copilot은 soft 강제만 가능.** 이 플랫폼들은 tool-call hook이 없어서 decision-surfacing protocol이 rules / `GEMINI.md` / `copilot-instructions.md`에 prompt로만 주입됩니다. 비준수 subagent를 harness 레이어에서 차단할 수 없습니다. Claude Code / Copilot CLI / Codex CLI는 hook 기반 hard enforce.

- **Non-TTY auto-pick은 틀릴 수 있음.** 밤새 루프는 모든 결정을 subagent의 `recommended_index`로 자동 해결합니다. 잘못된 선택은 다음날에야 드러납니다. 모든 auto-pick은 `docs/agent-all/iter-<N>/decisions.md`에 reasoning과 함께 기록되어 다음 iteration plan에서 재검토 대상으로 surface 가능합니다.

- **Description 기반 라우팅.** Policy hook은 `Task` tool의 `description` (`"Implement Task ..."` / `"Review Task ..."`)으로 implementer/reviewer subagent를 식별합니다. 사용자가 비슷한 단어로 직접 dispatch한 subagent도 protocol이 발동합니다. 프로젝트별 opt-out: `.agent-all.json`의 `policy: {decisionSurfacing: false}`.

- **`/explore`는 거의 발동 안함.** 읽기 전용이라 아키텍처 결정이 드뭅니다. 일관성을 위해 hook은 설치하지만 실질적으로 no-op.

- **Per-task scoping pass가 ~15-20% subagent 비용 추가.** Implementer가 두 번 (scoping + impl) dispatch됩니다. `--max-cost`가 여전히 cap 역할.
```

And the decision-surfacing callout (translate the same content into Korean).

And the table row update with the Korean header.

- [ ] **Step 2: Commit**

```bash
git add README.ko.md
git commit -m "docs(readme.ko): mirror known-limitations + decision-surfacing callout in Korean"
```

---

### Task 24: docs/USAGE.md — new "Decision-surfacing" section

**Files:**
- Modify: `docs/USAGE.md`

- [ ] **Step 1: Append new section near the end of USAGE.md (before final FAQ if present)**

```markdown
## Decision-surfacing — what the panel looks like

When `/agent-all` dispatches an implementer subagent in Phase 3, the first thing it does is a **scoping pass** — read-only inspection that returns a JSON payload of decisions it would otherwise make alone. The main thread shows you each decision as a 1/2/3 panel with the subagent's recommendation flagged.

Example session output (interactive mode):

```
=== Task 3: Add OAuth callback handler ===

[Token storage] Existing code uses cookies for session, but JWT tokens are typically
stored in localStorage in this codebase per src/lib/auth.ts:42.

Reasoning for recommendation: Sessions in this app are already cookie-based; mixing
storage strategies adds complexity. Cookie aligns with existing pattern.

  1. (Recommended) Cookie (httpOnly, secure) — Matches existing session pattern
  2. localStorage — Matches existing JWT pattern, XSS risk acknowledged
  3. Server-side session store (Redis) — Most secure, adds Redis dependency

Choose: _
```

**Non-TTY mode** (overnight, `--yes`, loop iter ≥ 2) auto-picks the recommended option and appends to `docs/agent-all/iter-<N>/decisions.md`:

```markdown
# Auto-resolved decisions — iter 7 — 2026-05-21T03:14Z

## Task 3 — Add OAuth callback handler

### Token storage
- Chosen: **Cookie (httpOnly, secure)** (recommended)
- Reasoning: Sessions in this app are already cookie-based; mixing storage strategies adds complexity.
```

**Reviewing past auto-picks:** Run `grep -A2 "Chosen:" docs/agent-all/iter-*/decisions.md` to see every auto-resolved decision across iterations. If a regression appears, find the relevant decision and add it to the next iteration's plan with a note "force re-ask".

**Opting out:** `.agent-all.json` →
```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```
The protocol skips entirely. Verification + reviewer-audit hook validation continue independently.
```

- [ ] **Step 2: Commit**

```bash
git add docs/USAGE.md
git commit -m "docs(usage): decision-surfacing section with panel example + non-TTY log shape"
```

---

### Task 25: docs/USAGE.ko.md — same in Korean

**Files:**
- Modify: `docs/USAGE.ko.md`

- [ ] **Step 1: Translate the section from Task 24 into Korean and append**

Mirror the structure: panel example, non-TTY log, review tip, opt-out config.

- [ ] **Step 2: Commit**

```bash
git add docs/USAGE.ko.md
git commit -m "docs(usage.ko): decision-surfacing section in Korean"
```

---

### Task 26: Spec sibling `.ko.md`

**Files:**
- Create: `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.ko.md`

- [ ] **Step 1: Translate the design doc into Korean**

Follow the conventions of existing `.ko.md` siblings (e.g., `2026-05-17-agent-all-design.ko.md`). Preserve section numbers, JSON schemas (untranslated), file paths, and any English code identifiers. Translate prose, headers, decision tables, and limitation descriptions.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.ko.md
git commit -m "docs(spec.ko): Korean sibling for 2026-05-21 decision-surfacing design"
```

---

### Task 27: CHANGELOG.md + CHANGELOG.ko.md entries

**Files:**
- Modify: `CHANGELOG.md`, `CHANGELOG.ko.md`

- [ ] **Step 1: Add entry under [Unreleased] or a new dated section in `CHANGELOG.md`**

```markdown
## [Unreleased] — 2026-05-21

### Added

- **Decision-surfacing protocol** (`/agent-all` Phase 3 → 3a scoping / 3b ask / 3c impl). Implementers do a read-only scoping pass, return architectural/spec decisions as JSON, main asks user via AskUserQuestion (CC). Non-TTY mode auto-picks recommended and logs to `.agent-all-state.json` + `docs/agent-all/iter-<N>/decisions.md`. Spec: `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`.
- **Policy-hook enforcement** — single `floor-policy-hook.mjs` (Pre+Post on `Task`) injects decision addendum + verification directive on dispatch; validates verification log + reviewer-audit token on return. Replaces the prompt-only directive in `3-dispatch.md`.
- **`.agent-all.json` `policy` opt-out** — flags `decisionSurfacing`, `verification`, `reviewerAudit`, all defaulting `true`.
- **Per-platform parity** — Cursor (`.cursor/rules/decision-protocol.mdc`, soft), Copilot CLI (`.github/hooks/*`, hard), Codex (`[[hooks.agent]]` snippet, hard after manual merge), Gemini (`GEMINI.md` section, soft), VS Code Copilot (`copilot-instructions.md`, soft). Hard/soft strength documented in README's Known Limitations.

### Changed

- Phase 3 dispatch documentation restructured into 3a/3b/3c sub-phases.
- README "Main-thread isolation" table reflects new phase-3 token shape.
```

- [ ] **Step 2: Mirror entry in `CHANGELOG.ko.md`**

Korean version with the same bullets.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md CHANGELOG.ko.md
git commit -m "docs(changelog): 2026-05-21 decision-surfacing + policy-hooks"
```

---

### Task 28: Per-platform port README notes

**Files:**
- Modify (if present): `plugins/harness-floor-cursor/README.md`, `plugins/harness-floor-copilot/README.md`, `plugins/harness-floor-codex/README.md`, `plugins/harness-floor-gemini/README.md`

- [ ] **Step 1: For each port plugin's README (or create if missing), add a "Decision-Surfacing enforcement strength" callout**

Cursor / Gemini / VS Code Copilot:
```markdown
> **Enforcement strength: Soft.** This platform lacks tool-call hooks. The decision-protocol is prompt-only — non-compliant subagents cannot be blocked at the harness layer. Compliance is best-effort.
```

Copilot CLI / Codex:
```markdown
> **Enforcement strength: Hard.** Tool-call hooks are registered via `.github/hooks/` (Copilot) or `[[hooks.agent]]` in `~/.codex/config.toml` (Codex, manual merge required). Non-compliant subagents are rejected at PostToolUse.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor-*/README.md
git commit -m "docs(port-readmes): enforcement-strength callouts per platform"
```

---

### Task 29: Final commit + branch finishing

- [ ] **Step 1: Run full test suite one final time**

```bash
node --test && node scripts/sync-lib.mjs --check
```

Expected: all green, sync clean.

- [ ] **Step 2: Use `superpowers:finishing-a-development-branch`**

Invoke the skill to decide between merge / PR / cleanup based on the working state.

---

## Summary

- 29 tasks across 7 phases (A: primitives → B: validators → C: hook → D: harness → E: ports → F: tests → G: docs).
- All implementation tasks (1–21) are TDD with bite-sized 2-5 minute steps.
- Documentation tasks (22–28) run AFTER tests pass (per user instruction).
- Net additions: ~30-40 new tests, 1 new hook, 2 new lib subdirs, 5 platform port emit updates, 6 documentation files touched.
- No fork of `superpowers`. No new plugin. No new cross-plugin imports (vendoring via existing `sync-lib.mjs`).
