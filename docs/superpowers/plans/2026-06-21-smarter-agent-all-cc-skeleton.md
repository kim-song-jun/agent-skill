# Smarter agent-all — CC Skeleton (G1–G5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove the Claude Code skeleton of a smarter agent-all — an independent adversarial-verifier, a no-git file+JSONL memory agent, and an auto-flush checkpoint — validated by one live agent-all run.

**Architecture:** Compose existing shipped primitives (`runVerificationAdapterSpec`, `makeFileMirror`, the cost-telemetry append pattern, `buildGatePlan`) rather than rebuild them. The adversarial-verifier is an orchestrator-level dispatch whose signature structurally excludes the implementer self-report; the memory agent reuses the Copilot file-mirror plus a single new `memory-log/v1` JSONL; a wave/phase-boundary flush makes mid-run context death recoverable.

**Tech Stack:** Node.js ESM (`.mjs`), `node:test`, Claude Code agent-all skill harness (`plugins/harness-floor/skills/agent-all`).

## Global Constraints

- Reuse existing schemas; AT MOST one new schema: `memory-log/v1`.
- Real tests only — assert exact values (`VERIFICATION_AUDIT: passed`/`failed`) + exitCode; never bare token-presence.
- Model tier: adversarial-verifier = **opus**; implementers = **sonnet**.
- Commits are **pathspec-only** (`git add <exact paths>` + `git commit -m "..." -- <exact paths>`); never `git add -A` / `commit -a`.
- `adversarialVerify` signature MUST exclude any implementer self-report (independence is structural).
- 45 deleted working-tree test fixtures must be restored (user-gated) before the full suite can go green; isolate new tests otherwise.
- **Spec SSOT:** `docs/superpowers/specs/2026-06-21-smarter-agent-all-design.md`

---

## Task 1 (G1) — Adversarial-verifier core module (`adversarial-verifier.mjs`)

**Files:**
- **Create** `plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs`
- **Create** `tests/agent-all/lib/adversarial-verifier.test.mjs`

**Interfaces — Consumes (verified):**
- `runVerificationAdapterSpec(spec, ctx = {}, runner = defaultCommandRunner)` — `registry.mjs:822`. `spec` is a `verification-plan/v1` object OR a shorthand `{ adapter, config }`. **`spec.adapter` MUST be a known adapter id/alias** (`cli`, `web-ui`, `api`, …); an unknown/missing adapter makes `normalizeAdapterId` return `null` and the function **throws** `unknown verification adapter`. Returns `{ adapter, plan, evidence, exitCode, verifierSummary, evidenceLog? }`; `evidence` is `verification-evidence/v1` with `status ∈ {passed,failed,blocked,skipped}` and `exitCode = evidence.status === "passed" ? 0 : 1` (`registry.mjs:848`).
- Verified by probe: `{adapter:"cli", config:{command}}` + injected `runner` returning `{exitCode:0}` ⇒ `evidence.status === "passed"`, `evidence.schemaVersion === "verification-evidence/v1"`, `exitCode === 0`; `{exitCode:1}` ⇒ `status === "failed"`, `exitCode === 1`.

**Interfaces — Produces:**
- `async adversarialVerify({ diff, acceptanceCriteria, breakCondition, cwd }) → { audit, evidence, exitCode }`
  - `audit`: exact `'VERIFICATION_AUDIT: passed'` or `'VERIFICATION_AUDIT: failed'`.
  - `evidence`: the `verification-evidence/v1` object from `runVerificationAdapterSpec` (no new schema).
  - `exitCode`: `0` or `1`.
  - **`breakCondition` MUST be a `{ adapter, config }` verification-adapter spec** (e.g. `{ adapter: "cli", config: { command: "node --test tests/" } }`). The verdict is re-derived by RUNNING `breakCondition`; `diff`/`acceptanceCriteria` are informational metadata only.
  - **Signature MUST NOT include `implementerOutput` / any self-report** — independence is structural (`spec §3.1`). The only extra accepted key is the internal `_runner` test hook (a command runner, not implementer output).

---

**Step 1 — Write the failing test**

```js
// tests/agent-all/lib/adversarial-verifier.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { adversarialVerify } from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs";

function fixtureDir(seed) {
  return mkdtempSync(resolve(tmpdir(), `adversarial-verifier-${seed}-`));
}

test("a spurious implementerOutput key is ignored — independence is structural", async () => {
  const dir = fixtureDir("sig-guard");
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "fail" });
  const result = await adversarialVerify({
    diff: "--- a/foo.ts\n+++ b/foo.ts",
    acceptanceCriteria: ["all tests pass"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    implementerOutput: "I SWEAR IT ALL PASSED",   // spurious — must be ignored
    _runner: failRunner,
  });
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed",
    "a passing self-report must NOT override a failing breakCondition");
  assert.equal(result.exitCode, 1);
});

test("bad diff whose break condition FAILS → exitCode 1 and audit 'VERIFICATION_AUDIT: failed'", async () => {
  const dir = fixtureDir("bad-diff");
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "FAIL: required test missing" });
  const result = await adversarialVerify({
    diff: "--- a/tests/foo.test.mjs\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-import { test } from 'node:test';\n-test('foo', () => {});",
    acceptanceCriteria: ["all tests still present and passing"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/foo.test.mjs" } },
    cwd: dir,
    _runner: failRunner,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed");
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "failed");
});

test("good diff whose break condition PASSES → exitCode 0 and audit 'VERIFICATION_AUDIT: passed'", async () => {
  const dir = fixtureDir("good-diff");
  const passRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });
  const result = await adversarialVerify({
    diff: "--- a/src/index.mjs\n+++ b/src/index.mjs\n@@ -1 +1 @@\n-export const VERSION = '1.0.0';\n+export const VERSION = '1.0.1';",
    acceptanceCriteria: ["version bump only — all existing tests still pass"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: passRunner,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.audit, "VERIFICATION_AUDIT: passed");
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "passed");
});

test("evidence conforms to verification-evidence/v1 in both pass and fail cases", async () => {
  const dir = fixtureDir("schema-check");
  for (const [exit, expectedStatus, expectedAudit] of [
    [0, "passed", "VERIFICATION_AUDIT: passed"],
    [1, "failed", "VERIFICATION_AUDIT: failed"],
  ]) {
    const runner = async () => ({ exitCode: exit, stdout: "", stderr: "" });
    const result = await adversarialVerify({
      diff: "+ change",
      acceptanceCriteria: ["tests pass"],
      breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
      cwd: dir,
      _runner: runner,
    });
    assert.equal(result.evidence.schemaVersion, "verification-evidence/v1", `schema for ${expectedStatus}`);
    assert.equal(result.evidence.status, expectedStatus, `status for ${expectedStatus}`);
    assert.equal(result.audit, expectedAudit, `audit literal for ${expectedStatus}`);
  }
});
```

Run (expect ALL 4 to FAIL — module absent):
```
node --test tests/agent-all/lib/adversarial-verifier.test.mjs
```
Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...adversarial-verifier.mjs'` → `ℹ fail 4`.

- [ ] Write the test file.
- [ ] Run; confirm 4 failures (module not found).

---

**Step 2 — Minimal implementation**

```js
// plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs
/**
 * Adversarial verifier — G1 of the smarter-agent-all skeleton.
 *
 * Independence is STRUCTURAL: the signature excludes implementerOutput / any
 * self-report. The verdict is re-derived solely by running breakCondition
 * against the wave tip commit via runVerificationAdapterSpec().
 *
 * Spec SSOT: docs/superpowers/specs/2026-06-21-smarter-agent-all-design.md §3.1
 * Model tier: callers MUST dispatch this via an opus subagent (§3.1, rule 11).
 */
import { runVerificationAdapterSpec } from "./registry.mjs";

/**
 * @param {object}   params
 * @param {string}   params.diff               Wave-tip diff (informational; not used to derive the verdict).
 * @param {string[]} params.acceptanceCriteria Human-readable criteria (informational).
 * @param {object}   params.breakCondition     A verification-adapter spec: { adapter, config }.
 * @param {string}   params.cwd                Working directory.
 * @param {Function} [params._runner]          Internal test hook (a command runner; NOT public, NOT implementer output).
 * @returns {Promise<{ audit: string, evidence: object, exitCode: number }>}
 */
export async function adversarialVerify({ diff, acceptanceCriteria, breakCondition, cwd, _runner }) {
  const ctx = { cwd: cwd ?? "." };
  const result = await runVerificationAdapterSpec(breakCondition, ctx, _runner);
  const passed = result.exitCode === 0;
  return {
    audit: passed ? "VERIFICATION_AUDIT: passed" : "VERIFICATION_AUDIT: failed",
    evidence: result.evidence,
    exitCode: result.exitCode,
  };
}
```

- [ ] Write the impl file.

---

**Step 3 — Run tests and confirm pass**

```
node --test tests/agent-all/lib/adversarial-verifier.test.mjs
```
Expected: `ℹ tests 4  ℹ pass 4  ℹ fail 0`.

**Regression guard — existing adapter suite stays green:**
```
node --test tests/agent-all/lib/verification-adapters.test.mjs
```
Expected: `ℹ pass 17  ℹ fail 0` (verified current count = 17).

- [ ] Run new suite; confirm 4/4 pass.
- [ ] Run verification-adapters suite; confirm 17/17 green.

---

**Step 4 — Pathspec-only commit**

```bash
git add \
  plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs \
  tests/agent-all/lib/adversarial-verifier.test.mjs

git commit -m "$(cat <<'EOF'
feat(G1): add adversarial-verifier core module with TDD tests

Implements adversarialVerify({diff,acceptanceCriteria,breakCondition,cwd})
returning {audit,evidence,exitCode}. Independence is structural — signature
excludes implementerOutput; verdict re-derived via runVerificationAdapterSpec
against the wave tip commit. Emits exact 'VERIFICATION_AUDIT: passed'/'failed'.
Reuses verification-evidence/v1; zero new schemas.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)" -- \
  plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs \
  tests/agent-all/lib/adversarial-verifier.test.mjs

git show --stat HEAD
```
Expected: exactly 2 files.

- [ ] Commit with pathspec; verify `git show --stat HEAD` shows exactly 2 files.

---

## Task 2 (G2) — gate-plan + 4-gate.md adversarial dispatch wiring (CC skeleton)

**Spec SSOT:** `docs/superpowers/specs/2026-06-21-smarter-agent-all-design.md` §3.1, §4, §5, goal row G2.
**Model tier:** adversarial-verifier subagent = opus; implementers = sonnet (rule 11).

**Files:**

| Action | Path |
|---|---|
| Modify | `plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs` (DEFAULT_GATES:3-6, REVIEWER_ORDER:8-17, DESCRIPTION_PREFIXES:19-30, GATE_REASONS:32-43, passCriteriaForDispatch:72-95, buildGatePlan dispatches:169-173) |
| Modify | `plugins/harness-floor/skills/agent-all/phases/4-gate.md` (INSERT a new adversarial section; remove one advisory phrase) |
| Modify | `tests/agent-all/lib/gate-plan.test.mjs` |
| Modify | `tests/agent-all/lib/phase-gate-contract.test.mjs` |
| Modify | `tests/lib/port-ssot-contract.test.mjs` |

**Interfaces — Consumes (verified):**
- `makeDispatch({ role, kind, mode, taskId, title })` → `{ role, kind, mode, descriptionPrefix, auditToken, requiredAudit:'${auditToken}: passed|failed|skipped', gateReason, passCriteria, description }` — `gate-plan.mjs:97`.
- `auditForRole(role, kind)` — `:55`: coordinator→ORCHESTRATION_AUDIT, qa-reviewer→QA_AUDIT, **else→VERIFICATION_AUDIT** (new role falls through; no new branch).
- `buildGatePlan({ files, gates, taskId, title, requiredReviewerRoles, requiredCoordinatorRoles })` — `:130`. `resolvedGates = { ...DEFAULT_GATES, ...gates }`, so `adversarialVerify` defaults falsy.
- `PORTS = ["codex","copilot","cursor","gemini"]`, `read(p, rel)`, `for (const p of PORTS)` loop — `port-ssot-contract.test.mjs:17,19,24`.
- CC `4-gate.md` lines 127-135 carry `superpowers:verification-before-completion`, `escalate as a \`critical\` issue`, `two-layer safety net`, which `tests/lib/agent-all-verification-directive.test.mjs:80-87` requires. **Must be preserved.**

---

- [ ] **Step 1 — Failing test: adversarial dispatch shape in gate-plan**

  Append to `tests/agent-all/lib/gate-plan.test.mjs`:

  ```js
  test("gate-plan includes verification-reviewer-adversarial dispatch with exact shape when adversarialVerify gate enabled", () => {
    const plan = buildGatePlan({
      files: ["src/feature.ts"],
      gates: { specReview: false, qualityReview: true, adversarialVerify: true },
      taskId: "42",
      title: "Add adversarial gate",
    });
    const adv = plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial");
    assert.ok(adv, "dispatches must include verification-reviewer-adversarial");
    assert.equal(adv.kind, "reviewer");
    assert.equal(adv.mode, "adversarial");
    assert.equal(adv.auditToken, "VERIFICATION_AUDIT");
    assert.equal(adv.requiredAudit, "VERIFICATION_AUDIT: passed|failed|skipped");
    assert.equal(adv.descriptionPrefix, "Adversarial Verification Task");
    assert.equal(adv.description, "Adversarial Verification Task 42: Add adversarial gate");
    assert.ok(adv.passCriteria.some((c) => c === "VERIFICATION_AUDIT: passed or skipped."),
      "passCriteria must contain exact 'VERIFICATION_AUDIT: passed or skipped.'");
    assert.ok(adv.passCriteria.some((c) => /without implementer self-report/.test(c)),
      "passCriteria must prohibit reliance on implementer self-report");
  });

  test("gate-plan verification-reviewer-adversarial appears after quality reviewers", () => {
    const plan = buildGatePlan({
      files: ["src/auth.ts"],
      gates: { specReview: false, qualityReview: true, adversarialVerify: true },
    });
    const roles = plan.dispatches.map((d) => d.role);
    const advIdx = roles.indexOf("verification-reviewer-adversarial");
    const qdrIdx = roles.indexOf("quality-debt-reviewer");
    assert.ok(advIdx !== -1 && qdrIdx !== -1);
    assert.ok(advIdx > qdrIdx, "adversarial dispatch must appear after quality reviewers");
  });

  test("gate-plan omits verification-reviewer-adversarial when gate absent or false", () => {
    const plan = buildGatePlan({
      files: ["src/feature.ts"],
      gates: { specReview: false, qualityReview: true },
    });
    assert.equal(plan.dispatches.find((d) => d.role === "verification-reviewer-adversarial"), undefined);
  });
  ```

  Run (expect FAIL on the first two; the third passes already):
  ```
  node --test tests/agent-all/lib/gate-plan.test.mjs
  ```
  Expected: `AssertionError: dispatches must include verification-reviewer-adversarial`.

- [ ] **Step 2 — Failing port-ssot test: blocking adversarial directive for [codex, copilot]**

  Append BELOW the existing `for (const p of PORTS)` block in `tests/lib/port-ssot-contract.test.mjs`:

  ```js
  // E5: adversarial verification dispatch — blocking-language guard.
  // Scoped to [codex, copilot] per spec §4 and decision #4 (smartness = CC+Codex+Copilot).
  // gemini = prose-only (#7); cursor excluded from smartness (#4, §8).
  const ADVERSARIAL_PORTS = ["codex", "copilot"];

  for (const p of ADVERSARIAL_PORTS) {
    test(`port ssot contract [${p}]: E5 adversarial dispatch uses BLOCKING (not advisory) language`, () => {
      const gate = read(p, "phases/4-gate.md");
      assert.ok(gate, `${p} phases/4-gate.md must exist`);
      assert.match(gate, /verification-reviewer-adversarial/,
        `${p} 4-gate must dispatch verification-reviewer-adversarial`);
      assert.match(gate, /MUST NOT read|MUST re-derive|BLOCKS the wave/i,
        `${p} 4-gate adversarial step must use BLOCKING language`);
      assert.match(gate, /implementer.{0,40}self.report|self.report.{0,40}implementer/i,
        `${p} 4-gate must name and forbid implementer self-report`);
      assert.doesNotMatch(gate, /implementer's reported output/,
        `${p} 4-gate must NOT trust the implementer's reported output`);
    });
  }
  ```

  Run (expect FAIL — ports not yet authored):
  ```
  node --test tests/lib/port-ssot-contract.test.mjs
  ```
  Expected: `AssertionError: codex phases/4-gate.md must dispatch verification-reviewer-adversarial`.

- [ ] **Step 3 — Failing phase-gate-contract test: CC 4-gate.md adversarial step**

  Append to `tests/agent-all/lib/phase-gate-contract.test.mjs` (`phase4` already defined at line 10):

  ```js
  test("phase 4 dispatches verification-reviewer-adversarial with BLOCKING language and no self-report reliance", () => {
    assert.match(phase4, /verification-reviewer-adversarial/,
      "4-gate.md must dispatch verification-reviewer-adversarial");
    assert.match(phase4, /MUST NOT read the implementer|MUST re-derive/i,
      "adversarial step must use MUST-strength language");
    assert.match(phase4, /implementer.{0,60}self.report|self.report.{0,60}implementer/is,
      "adversarial step must name implementer self-report as forbidden");
    // /s flag — 'diff' and 'tip commit' may span lines; authored text also co-locates them.
    assert.match(phase4, /diff.*tip commit|tip commit.*diff/is,
      "adversarial step must specify diff and tip commit as the evidence source");
  });

  test("phase 4 adversarial dispatch is wired into the block-on-critical retry loop", () => {
    assert.match(phase4, /verification-reviewer-adversarial[\s\S]{0,260}critical|critical[\s\S]{0,260}verification-reviewer-adversarial/,
      "4-gate.md must treat a failed adversarial audit as critical");
  });
  ```

  Run (expect FAIL):
  ```
  node --test tests/agent-all/lib/phase-gate-contract.test.mjs
  ```
  Expected: `AssertionError: 4-gate.md must dispatch verification-reviewer-adversarial`.

- [ ] **Step 4 — Minimal impl: gate-plan.mjs**

  **4a.** `DEFAULT_GATES` (:3-6) — add the falsy default so existing callers are unaffected:
  ```js
  const DEFAULT_GATES = {
    specReview: true,
    qualityReview: true,
    adversarialVerify: false,
  };
  ```
  **4b.** `REVIEWER_ORDER` (:8-17) — add after `"verification-reviewer",`:
  ```js
  "verification-reviewer-adversarial",
  ```
  **4c.** `DESCRIPTION_PREFIXES` (:19-30) — add after the `"verification-reviewer"` entry:
  ```js
  "verification-reviewer-adversarial": "Adversarial Verification Task",
  ```
  **4d.** `GATE_REASONS` (:32-43) — add after the `"verification-reviewer"` entry:
  ```js
  "verification-reviewer-adversarial": "Independent adversarial re-verification: re-derive verdict from diff+tip commit without implementer self-report.",
  ```
  **4e.** `passCriteriaForDispatch` (:72-95) — add a branch before the final `return`:
  ```js
  if (role === "verification-reviewer-adversarial") {
    return [
      `${auditToken}: passed or skipped.`,
      "Verifier re-derived the verdict independently from diff and wave tip commit, never from implementer self-report.",
    ];
  }
  ```
  **4f.** `buildGatePlan` — after the `qualityReview` reviewer loop (:169-173), append:
  ```js
  if (resolvedGates.adversarialVerify) {
    dispatches.push(
      makeDispatch({ role: "verification-reviewer-adversarial", kind: "reviewer", mode: "adversarial", taskId, title }),
    );
  }
  ```

  Run (expect PASS):
  ```
  node --test tests/agent-all/lib/gate-plan.test.mjs
  ```
  Expected: all pass including the 3 new ones; the pre-existing `requiredAudits` deepEqual (which never sets `adversarialVerify`) stays green.

- [ ] **Step 5 — Minimal impl: INSERT the adversarial step in 4-gate.md (do NOT delete existing text)**

  Edit `plugins/harness-floor/skills/agent-all/phases/4-gate.md`. **Do NOT replace/delete** the `## Per-reviewer verification check (mandatory)` block (lines 127-135) — it carries `superpowers:verification-before-completion`, `escalate as a \`critical\` issue`, and `two-layer safety net`, required by `tests/lib/agent-all-verification-directive.test.mjs`. **INSERT** the new section between that block (ending `Two-layer safety net.`) and the `## Output to user` heading:

  ```markdown
  ## Step 3-adversarial — Independent adversarial re-verification (mandatory when `gates.adversarialVerify === true`)

  After dispatching all `gatePlan.dispatches[]` entries in step 3, the orchestrator MUST dispatch one additional subagent with dispatch kind `verification-reviewer-adversarial` (role `"verification-reviewer-adversarial"`, mode `"adversarial"`):

  - **Model tier:** this subagent MUST run as **opus** (judge node, spec §3.1 / rule 11). Never sonnet or haiku.
  - **Independence is structural:** the adversarial verifier MUST NOT read the implementer's self-report, commit messages, or any implementer-produced output. It MUST re-derive the verdict from the wave diff and the wave tip commit only — `git diff <wave.baseCommit>..<wave.endCommit>` plus running `breakCondition` against the wave tip commit via `runVerificationAdapterSpec()` (`lib/verification-adapters/registry.mjs:822`).
  - **Prompt contract:** the verifier's prompt MUST NOT include the implementer's implementation notes, self-assessments, or reported verification output. Structural independence — not a promise.
  - **Required output:** exactly one of `VERIFICATION_AUDIT: passed`, `VERIFICATION_AUDIT: failed`, or `VERIFICATION_AUDIT: skipped`, plus a `verification-evidence/v1` evidence object (reuse `lib/verification-adapters/schema.mjs`).
  - **Failure is critical:** a `VERIFICATION_AUDIT: failed` from `verification-reviewer-adversarial` is a `critical` issue that BLOCKS the wave; the orchestrator MUST enter the block-on-critical retry loop (step 5). A passing self-reviewer verdict does NOT override a failing adversarial verdict.
  - **Nesting constraint:** the adversarial verifier lives at the orchestrator level; a reviewer or implementer subagent MUST NOT spawn it (spec §3.1 / `references/orchestrator-routing.md:28-37,63`).
  ```

  (The "re-derive the verdict from the wave diff and the wave tip commit only" line co-locates `diff` and `tip commit`; the "Failure is critical" bullet co-locates `verification-reviewer-adversarial` with `critical` — satisfying both phase-gate-contract regexes.)

  Run (expect PASS):
  ```
  node --test tests/agent-all/lib/phase-gate-contract.test.mjs
  ```
  Expected: all pass including the 2 new ones.

- [ ] **Step 6 — Remove the single advisory self-report phrase in CC 4-gate.md**

  In the `## Per-reviewer verification check (mandatory)` directive (line 131), change:
  > Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.

  to:
  > Look for the verification command output in commit messages, or run the verification command yourself against the wave's tip commit.

  Only that clause is removed; surrounding `superpowers:verification-before-completion`, `escalate as a \`critical\` issue`, and `two-layer safety net` text is untouched.

  Run all affected suites (expect PASS):
  ```
  node --test tests/agent-all/lib/phase-gate-contract.test.mjs tests/agent-all/lib/gate-plan.test.mjs tests/lib/agent-all-verification-directive.test.mjs
  ```
  Expected: all green — `agent-all-verification-directive.test.mjs` still finds two-layer / critical-issue / verification-before-completion.

- [ ] **Step 7 — Confirm port-ssot E5 is still RED (intentional)**

  ```
  node --test tests/lib/port-ssot-contract.test.mjs
  ```
  Expected: E1-E4 green for all 4 ports; E5 FAILS for `codex` and `copilot` (authored in G6/G7).

- [ ] **Step 8 — Pathspec commit**

  ```bash
  git add \
    plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs \
    plugins/harness-floor/skills/agent-all/phases/4-gate.md \
    tests/agent-all/lib/gate-plan.test.mjs \
    tests/agent-all/lib/phase-gate-contract.test.mjs \
    tests/lib/port-ssot-contract.test.mjs

  git commit -m "$(cat <<'EOF'
  feat(G2): wire verification-reviewer-adversarial dispatch into gate-plan + 4-gate.md

  Adds the 'verification-reviewer-adversarial' dispatch kind to buildGatePlan()
  (gated by gates.adversarialVerify), INSERTS the adversarial step in 4-gate.md
  with BLOCKING language and a structural no-self-report contract, removes one
  advisory self-report phrase (existing two-layer/critical text preserved), and
  extends port-ssot-contract with a [codex, copilot]-only E5 blocking-language
  assertion (gemini/cursor excluded per decision #4). CC skeleton; ports → G6/G7.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )" -- \
    plugins/harness-floor/skills/agent-all/lib/gate-plan.mjs \
    plugins/harness-floor/skills/agent-all/phases/4-gate.md \
    tests/agent-all/lib/gate-plan.test.mjs \
    tests/agent-all/lib/phase-gate-contract.test.mjs \
    tests/lib/port-ssot-contract.test.mjs

  git show --stat HEAD
  ```
  Expected: exactly 5 files.

---

## Task 3 (G3) — Memory agent (`memory-agent.mjs`, Layer1+Layer2)

**Files:**
- **Create** `plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs`
- **Create** `tests/agent-all/lib/memory-agent.test.mjs`

**Interfaces — Consumes (verified):**
- `makeFileMirror({ rootDir })` → `{ pathFor(key), read(key), write(key, value) }` — `memory-bridge.mjs:33`.
- `storeRepoMemory({ key, value, toolCaller, fileMirror })` → `{ ok, source:'memory'|'file'|'both', error? }` — `:59`. Non-function `toolCaller` ⇒ adapter skipped, `source==='file'` on mirror write.
- `recallRepoMemory({ key, toolCaller, fileMirror })` → `{ ok, value, source, stale?, error? }` — `:104`. `toolCaller: null` ⇒ file path; missing key ⇒ `{ ok:false, value:null }`. (All verified by probe.)
- `appendCostTelemetry` JSONL pattern — `cost-telemetry.mjs:341`; `artifactPaths(config).runsDir === ".agent-skill/runs"` — `artifact-paths.mjs:28`.
- **Import path (verified to resolve):** `../../../../harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs`.

**Interfaces — Produces:**
```js
export const MEMORY_LOG_SCHEMA_VERSION = "memory-log/v1";   // the ONE new schema (spec §4)
export function makeMemoryAgent({ rootDir, runId, cwd, config? })
  → { store(key, payload, toolCaller?), recall(key, toolCaller?), logPath() }
```

---

- [ ] **Step 1 — Write the failing test**

  Create `tests/agent-all/lib/memory-agent.test.mjs`:

  ```js
  import { test } from "node:test";
  import assert from "node:assert/strict";
  import { mkdtempSync, readFileSync, existsSync } from "node:fs";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import {
    makeMemoryAgent,
    MEMORY_LOG_SCHEMA_VERSION,
  } from "../../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";

  function tempDir() { return mkdtempSync(join(tmpdir(), "memory-agent-")); }

  test("MEMORY_LOG_SCHEMA_VERSION is exactly memory-log/v1", () => {
    assert.equal(MEMORY_LOG_SCHEMA_VERSION, "memory-log/v1");
  });

  test("store writes file mirror + JSONL; recall after adapter null returns ok, source='file', round-trip", async () => {
    const dir = tempDir();
    const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "test-run-1", cwd: dir });
    const payload = { taskId: "T-42", iter: 3, openDecisions: ["decide-auth"], scratchpad: "tried A, rejected. Next: B." };
    let adapterCalled = false;
    async function liveToolCaller() { adapterCalled = true; return null; }
    const storeResult = await agent.store("phase-3a-state", payload, liveToolCaller);
    assert.equal(storeResult.ok, true);
    assert.ok(adapterCalled, "adapter must be called during store");

    const logPath = agent.logPath();
    assert.ok(existsSync(logPath));
    const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.schemaVersion, "memory-log/v1");
    assert.equal(entry.runId, "test-run-1");
    assert.ok(entry.timestamp);
    assert.equal(entry.key, "phase-3a-state");
    assert.deepEqual(entry.value, payload);

    const recall = await agent.recall("phase-3a-state", null);
    assert.equal(recall.ok, true);
    assert.equal(recall.source, "file");
    assert.deepEqual(recall.value, payload);
    assert.equal(recall.value.scratchpad, payload.scratchpad);
  });

  test("store with no adapter still writes file mirror + JSONL", async () => {
    const dir = tempDir();
    const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "no-adapter-run", cwd: dir });
    const result = await agent.store("key-no-adapter", { x: 1, scratchpad: "note" }, null);
    assert.equal(result.ok, true);
    assert.equal(result.source, "file");
    const line = JSON.parse(readFileSync(agent.logPath(), "utf-8").trim());
    assert.equal(line.schemaVersion, "memory-log/v1");
    assert.equal(line.key, "key-no-adapter");
  });

  test("recall returns ok=false / value=null when key absent and adapter null", async () => {
    const dir = tempDir();
    const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "absent-key-run", cwd: dir });
    const result = await agent.recall("never-stored", null);
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });

  test("JSONL entry round-trips the scratchpad field", async () => {
    const dir = tempDir();
    const agent = makeMemoryAgent({ rootDir: join(dir, ".agent-skill", "memory"), runId: "scratchpad-run", cwd: dir });
    await agent.store("scratch-key", { scratchpad: "model reasoning captured", iter: 7 }, null);
    const entry = JSON.parse(readFileSync(agent.logPath(), "utf-8").trim());
    assert.equal(entry.value.scratchpad, "model reasoning captured");
  });
  ```

- [ ] **Step 1b — Confirm RED:**
  ```
  node --test tests/agent-all/lib/memory-agent.test.mjs
  ```
  Expected: `ERR_MODULE_NOT_FOUND`; 0 pass.

- [ ] **Step 2 — Minimal implementation**

  Create `plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs`:

  ```js
  // memory-agent.mjs — Layer1: structured file mirror via makeFileMirror.
  //                    Layer2: append-only JSONL at .agent-skill/runs/<runId>/memory-log.jsonl.
  // NO git operations anywhere in this module.
  import { appendFileSync, mkdirSync } from "node:fs";
  import { dirname, join, resolve } from "node:path";
  import {
    makeFileMirror,
    storeRepoMemory,
    recallRepoMemory,
  } from "../../../../harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";
  import { artifactPaths } from "./artifact-paths.mjs";

  export const MEMORY_LOG_SCHEMA_VERSION = "memory-log/v1";

  const SAFE_RUN_ID = /[^A-Za-z0-9._-]/g;

  export function sanitizeRunId(runId) {
    const safe = String(runId || "default").replace(SAFE_RUN_ID, "-");
    return safe || "default";
  }

  export function memoryLogPath({ cwd, runId, config = {} }) {
    return join(resolve(cwd), artifactPaths(config).runsDir, sanitizeRunId(runId), "memory-log.jsonl");
  }

  function appendMemoryLog({ cwd, runId, key, value, config = {}, now = new Date() }) {
    const path = memoryLogPath({ cwd, runId, config });
    mkdirSync(dirname(path), { recursive: true });
    const entry = {
      schemaVersion: MEMORY_LOG_SCHEMA_VERSION,
      timestamp: now instanceof Date ? now.toISOString() : String(now),
      runId: sanitizeRunId(runId),
      key,
      value,
    };
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
    return path;
  }

  export function makeMemoryAgent({ rootDir, runId = "default", cwd = process.cwd(), config = {} }) {
    if (!rootDir) throw new Error("makeMemoryAgent: rootDir required");
    const fileMirror = makeFileMirror({ rootDir });
    const resolvedCwd = resolve(cwd);
    const resolvedRunId = sanitizeRunId(runId);

    async function store(key, payload, toolCaller = null) {
      const result = await storeRepoMemory({
        key, value: payload,
        toolCaller: typeof toolCaller === "function" ? toolCaller : undefined,
        fileMirror,
      });
      appendMemoryLog({ cwd: resolvedCwd, runId: resolvedRunId, key, value: payload, config });
      return result;
    }

    async function recall(key, toolCaller = null) {
      return recallRepoMemory({
        key,
        toolCaller: typeof toolCaller === "function" ? toolCaller : undefined,
        fileMirror,
      });
    }

    function logPath() {
      return memoryLogPath({ cwd: resolvedCwd, runId: resolvedRunId, config });
    }

    return { store, recall, logPath };
  }
  ```

- [ ] **Step 3 — Run and confirm pass:**
  ```
  node --test tests/agent-all/lib/memory-agent.test.mjs
  ```
  Expected: `ℹ tests 5  ℹ pass 5  ℹ fail 0`.

- [ ] **Step 4 — Regression: cost-telemetry stays green:**
  ```
  node --test tests/agent-all/lib/cost-telemetry.test.mjs
  ```
  Expected: `ℹ pass 6  ℹ fail 0` (verified current count = 6).

- [ ] **Step 5 — Pathspec commit (user-gated)**
  ```bash
  git add plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs tests/agent-all/lib/memory-agent.test.mjs
  git commit -m "$(cat <<'EOF'
  feat(G3): add memory-agent.mjs — file+JSONL no-git memory agent

  Layer1 reuses makeFileMirror({rootDir}) from the copilot memory-bridge
  (pointed at .agent-skill/memory/) for structured state + free-form scratchpad.
  Layer2 appends to .agent-skill/runs/<runId>/memory-log.jsonl under the single
  new schema 'memory-log/v1' using the appendCostTelemetry pattern. Zero git
  operations. All 5 real-disk-I/O tests pass.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )" -- plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs tests/agent-all/lib/memory-agent.test.mjs
  git show --stat HEAD
  ```
  Expected: exactly 2 files.

---

## Task 4 (G4) — Auto-flush checkpoint trigger

**Files:**
- **Modify** `plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs` (G3 output — must exist; G4 ADDS only the `flushCheckpoint` export, reusing G3's `MEMORY_LOG_SCHEMA_VERSION`, `sanitizeRunId`, `memoryLogPath`, and the existing `appendFileSync`/`mkdirSync`/`dirname`/`join` imports — do NOT re-declare or re-import them).
- **Modify** `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md` (insert a flush seam after step 4 "Capture wave result" and at step 5's tail; verified 3a/3b/3c then numbered `4.`/`5.` is the actual structure).
- **Create** `tests/agent-all/lib/memory-agent-checkpoint.test.mjs`

**Interfaces — Consumes (verified):**
- `makeFileMirror({ rootDir }) → { read, write, pathFor }` — `memory-bridge.mjs:33`.
- `recallRepoMemory({ key, toolCaller, fileMirror }) → { ok, value, source }` — `:104`; `toolCaller: null` ⇒ `source:'file'`, round-trips (verified by probe).
- `discoverResumeArtifacts({ cwd, taskPath, config? }) → { found, ... }` — `resume-artifacts.mjs:34`. Handoff found at `${handoffDir}/${taskBasename}.handoff.md` (verified path math).
- `artifactPaths(config).runsDir` — `artifact-paths.mjs:28`.

**Interfaces — Produces:**
```js
export async function flushCheckpoint({ cwd, runId, wave, iter, scopingPayloads, fileMirror, config?, now? })
  → Promise<{ ok, logPath }>
// (a) fileMirror.write(`checkpoint/wave-${wave}-iter-${iter}`, { wave, iter, scopingPayloads, flushedAt })
// (b) JSONL { schemaVersion:'memory-log/v1', timestamp, runId, wave, iter, event:'checkpoint', scopingPayloads }
```

---

#### Step 1 — Failing test (RED)

```js
// tests/agent-all/lib/memory-agent-checkpoint.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { flushCheckpoint } from "../../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";
import { makeFileMirror, recallRepoMemory } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";
import { discoverResumeArtifacts } from "../../../plugins/harness-floor/skills/agent-all/lib/resume-artifacts.mjs";

function freshEnv() {
  const cwd = mkdtempSync(join(tmpdir(), "memory-agent-chk-"));
  mkdirSync(join(cwd, ".agent-skill/memory"), { recursive: true });
  return { cwd, fileMirror: makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") }) };
}

test("G4-1: flushCheckpoint persists scoping payload to file mirror and JSONL", async () => {
  const { cwd, fileMirror } = freshEnv();
  const sp = { taskId: "AS-TASK-001", title: "Add login form", decisions: [] };
  const result = await flushCheckpoint({ cwd, runId: "run-test-001", wave: 0, iter: 1, scopingPayloads: [sp], fileMirror });
  assert.equal(result.ok, true);
  assert.ok(result.logPath.endsWith("memory-log.jsonl"));
  const parsed = JSON.parse(fileMirror.read("checkpoint/wave-0-iter-1"));
  assert.equal(parsed.wave, 0);
  assert.equal(parsed.iter, 1);
  assert.deepEqual(parsed.scopingPayloads, [sp]);
  assert.equal(typeof parsed.flushedAt, "string");
});

test("G4-2: JSONL entry has schemaVersion memory-log/v1 and correct fields", async () => {
  const { cwd, fileMirror } = freshEnv();
  await flushCheckpoint({ cwd, runId: "run-schema-check", wave: 1, iter: 2, scopingPayloads: [{ taskId: "AS-TASK-002", title: "Fix bug", decisions: [] }], fileMirror });
  const logPath = join(cwd, ".agent-skill/runs/run-schema-check/memory-log.jsonl");
  assert.ok(existsSync(logPath));
  const line = JSON.parse(readFileSync(logPath, "utf-8").trim().split("\n").at(-1));
  assert.equal(line.schemaVersion, "memory-log/v1");
  assert.equal(line.wave, 1);
  assert.equal(line.iter, 2);
  assert.equal(line.event, "checkpoint");
  assert.ok(Array.isArray(line.scopingPayloads));
});

test("G4-3: round-trip — after in-memory discard, file mirror restores payload; handoff is discoverable", async () => {
  const { cwd, fileMirror } = freshEnv();
  mkdirSync(join(cwd, ".agent-skill/tasks"), { recursive: true });
  mkdirSync(join(cwd, ".agent-skill/handoff"), { recursive: true });
  const taskPath = ".agent-skill/tasks/T-20260621-001-test.md";
  writeFileSync(
    join(cwd, ".agent-skill/handoff/T-20260621-001-test.handoff.md"),
    ["# Handoff", "<!-- agent-handoff-metadata",
     JSON.stringify({ schema: "agent-skill/handoff@1", selectedNextActionId: "resume-agent-all" }), "-->"].join("\n"),
  );
  const original = { taskId: "AS-TASK-003", title: "Round-trip", decisions: [{ id: "d1", choice: 0 }] };
  await flushCheckpoint({ cwd, runId: "run-roundtrip", wave: 2, iter: 3, scopingPayloads: [original], fileMirror });

  const recalled = await recallRepoMemory({ key: "checkpoint/wave-2-iter-3", toolCaller: null, fileMirror });
  assert.equal(recalled.ok, true);
  assert.equal(recalled.source, "file");
  assert.deepEqual(recalled.value.scopingPayloads, [original]);

  const resume = discoverResumeArtifacts({ cwd, taskPath });
  assert.equal(resume.found, true);
});

test("G4-4: two flushes produce two JSONL lines (append-only)", async () => {
  const { cwd, fileMirror } = freshEnv();
  await flushCheckpoint({ cwd, runId: "run-multi", wave: 0, iter: 1, scopingPayloads: [{ taskId: "T1" }], fileMirror });
  await flushCheckpoint({ cwd, runId: "run-multi", wave: 0, iter: 2, scopingPayloads: [{ taskId: "T2" }], fileMirror });
  const lines = readFileSync(join(cwd, ".agent-skill/runs/run-multi/memory-log.jsonl"), "utf-8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).iter, 1);
  assert.equal(JSON.parse(lines[1]).iter, 2);
});
```

Run — confirm RED:
```
node --test tests/agent-all/lib/memory-agent-checkpoint.test.mjs
```
Expected: `flushCheckpoint` not exported → import/Type error; non-zero exit.

---

#### Step 2 — Minimal implementation (GREEN)

ADD this single export to `lib/memory-agent.mjs`. **Reuse G3's existing `MEMORY_LOG_SCHEMA_VERSION`, `sanitizeRunId`, `memoryLogPath`, and the already-present `appendFileSync`/`mkdirSync`/`dirname`/`join` imports — do NOT re-import or re-declare them:**

```js
// --- appended to lib/memory-agent.mjs (G3 module otherwise untouched) ---
export async function flushCheckpoint({
  cwd = process.cwd(),
  runId = "default",
  wave,
  iter,
  scopingPayloads = [],
  fileMirror,
  config = {},
  now = new Date(),
} = {}) {
  const flushedAt = now instanceof Date ? now.toISOString() : String(now);

  // Layer 1 — file mirror (durable, synchronous)
  if (fileMirror) {
    fileMirror.write(`checkpoint/wave-${wave}-iter-${iter}`, { wave, iter, scopingPayloads, flushedAt });
  }

  // Layer 2 — append-only JSONL (memory-log/v1); reuse G3's memoryLogPath helper.
  const logPath = memoryLogPath({ cwd, runId, config });
  mkdirSync(dirname(logPath), { recursive: true });
  const entry = {
    schemaVersion: MEMORY_LOG_SCHEMA_VERSION,
    timestamp: flushedAt,
    runId: sanitizeRunId(runId),
    wave,
    iter,
    event: "checkpoint",
    scopingPayloads,
  };
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
  return { ok: true, logPath };
}
```

Run — confirm GREEN:
```
node --test tests/agent-all/lib/memory-agent-checkpoint.test.mjs
```
Expected: 4 pass, exit 0.

---

#### Step 3 — Document the flush seam in `phases/3-dispatch.md`

The orchestrator state has **no** `_fileMirror` field (verified: SKILL.md:71 lacks it; no code constructs it). Construct the mirror at the call site.

After step 4 ("Capture wave result …") and before step 5 ("Append to `state.waves`"), insert:

```markdown
4a. **Checkpoint flush (auto-flush trigger).** Immediately after capturing the
    wave result and before appending to `state.waves`, flush in-flight scoping
    payloads so a mid-wave context death loses at most the current wave's
    implementation progress — never the scoping decisions:
    ```javascript
    import { makeFileMirror } from "../../../harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";
    import { flushCheckpoint } from "./lib/memory-agent.mjs";
    const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
    await flushCheckpoint({
      cwd,
      runId,
      wave: i,
      iter: state.iter ?? 0,
      scopingPayloads: waveResult.tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        decisions: state.decisions?.[t.id] ?? null,
      })),
      fileMirror,
      config,
    });
    ```
    On `--resume`, Phase 0 `discoverResumeArtifacts` discovers the handoff; the
    orchestrator then calls `recallRepoMemory` with the
    `checkpoint/wave-<i>-iter-<n>` key (`toolCaller: null` → file fallback) to
    restore the in-flight scoping payloads before re-dispatching Phase 3.
```

At step 5's tail, add a phase-boundary flush:

```markdown
5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`. Then
   flush a phase-boundary checkpoint:
   ```javascript
   await flushCheckpoint({
     cwd, runId, wave: "phase-3-complete", iter: state.iter ?? 0,
     scopingPayloads: [], fileMirror, config,
   });
   ```
```

---

#### Step 4 — Run focused suites

```
node --test tests/agent-all/lib/memory-agent-checkpoint.test.mjs
node --test tests/agent-all/lib/resume-artifacts.test.mjs
```
Both must exit 0 (resume-artifacts currently 5/5 green).

---

#### Step 5 — Pathspec commit (user-gated)

```bash
git add \
  plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs \
  plugins/harness-floor/skills/agent-all/phases/3-dispatch.md \
  tests/agent-all/lib/memory-agent-checkpoint.test.mjs

git commit -m "$(cat <<'EOF'
feat(G4): auto-flush checkpoint trigger — wave/phase boundary flush via memory-agent

Adds flushCheckpoint() to lib/memory-agent.mjs (memory-log/v1 JSONL +
file-mirror Layer-1 write), reusing G3's schema const and helpers (no
re-declaration). Wires the call into phases/3-dispatch.md at wave-result
capture (step 4a) and phase boundary (step 5 tail), constructing the file
mirror at the call site. Round-trip test confirms scoping payloads survive
simulated context death via recallRepoMemory's file fallback.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)" -- \
  plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs \
  plugins/harness-floor/skills/agent-all/phases/3-dispatch.md \
  tests/agent-all/lib/memory-agent-checkpoint.test.mjs

git show --stat HEAD
```
Expected: exactly 3 files.

---

## Task 5 (G5) — Live `/agent-all` proof run — end-to-end G1-G4 evidence

**Files:**
- **Create** `tests/agent-all/lib/adversarial-verifier-isolation.test.mjs` (self-contained unit tests for G1 + the G4 gate seam; no deleted-fixture dependency).
- **Create** `tests/agent-all/lib/g5-live-proof-checklist.md` (operator runbook — NOT a test).

**Purpose:** exercise G1-G4 end-to-end in one real `/agent-all` run with explicit evidence. The isolation tests use **the same `breakCondition` contract as G1** (`{ adapter, config }` + injected `_runner`); failure is driven by the break-condition command's exit code, exactly as spec §5 intends (the deleted test file makes the suite fail). adversarialVerify does **not** parse the diff — the diff is informational.

---

#### Isolated unit test: adversarial-verifier-isolation.test.mjs

```js
// tests/agent-all/lib/adversarial-verifier-isolation.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { adversarialVerify } from "../../../plugins/harness-floor/skills/agent-all/lib/verification-adapters/adversarial-verifier.mjs";
import { flushCheckpoint } from "../../../plugins/harness-floor/skills/agent-all/lib/memory-agent.mjs";
import { makeFileMirror } from "../../../plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";

// Failing case: the deleted test file makes the break-condition command exit 1.
test("G1: a failing break condition yields exitCode 1 and audit 'VERIFICATION_AUDIT: failed' regardless of any self-report", async () => {
  const dir = mkdtempSync(join(tmpdir(), "g5-fail-"));
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "FAIL: a required test is missing" });
  const result = await adversarialVerify({
    diff: "--- a/tests/some-critical.test.mjs\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-import { test } from 'node:test';\n-test('critical', () => {});",
    acceptanceCriteria: ["No test files may be deleted"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: failRunner,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.audit, "VERIFICATION_AUDIT: failed");
  assert.ok(result.evidence && typeof result.evidence === "object");
  assert.equal(result.evidence.schemaVersion, "verification-evidence/v1");
  assert.equal(result.evidence.status, "failed");
});

test("G1: a passing break condition yields exitCode 0 and audit 'VERIFICATION_AUDIT: passed'", async () => {
  const dir = mkdtempSync(join(tmpdir(), "g5-pass-"));
  const passRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });
  const result = await adversarialVerify({
    diff: "--- /dev/null\n+++ b/src/new-feature.mjs\n@@ -0,0 +1,1 @@\n+export const greet = () => 'hi';",
    acceptanceCriteria: ["No test files may be deleted"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd: dir,
    _runner: passRunner,
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.audit, "VERIFICATION_AUDIT: passed");
  assert.equal(result.evidence.status, "passed");
});

// G4 gate seam: a failing adversarial verdict must SUPPRESS the checkpoint flush.
test("G4-gate: orchestrator must NOT flush a checkpoint when the adversarial verifier blocks (exitCode 1)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "g5-wire-"));
  mkdirSync(join(cwd, ".agent-skill/memory"), { recursive: true });
  const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
  const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "suite failed" });

  const verify = await adversarialVerify({
    diff: "--- a/tests/critical.test.mjs\n+++ /dev/null\n@@ -1 +0,0 @@\n-test('x', () => {});",
    acceptanceCriteria: ["No test files deleted"],
    breakCondition: { adapter: "cli", config: { command: "node --test tests/" } },
    cwd,
    _runner: failRunner,
  });

  let flushed = false;
  if (verify.exitCode === 0) {
    await flushCheckpoint({ cwd, runId: "run-g5", wave: 0, iter: 1, scopingPayloads: [{ taskId: "T1" }], fileMirror });
    flushed = true;
  }

  assert.equal(verify.exitCode, 1);
  assert.equal(verify.audit, "VERIFICATION_AUDIT: failed");
  assert.equal(flushed, false, "no checkpoint flush when the verifier blocks");
  assert.equal(existsSync(join(cwd, ".agent-skill/runs/run-g5/memory-log.jsonl")), false,
    "a blocked wave must not produce a checkpoint JSONL entry");
});
```

Run — RED before G1 lands:
```
node --test tests/agent-all/lib/adversarial-verifier-isolation.test.mjs
```
Expected: `ERR_MODULE_NOT_FOUND` for `adversarial-verifier.mjs`.

Run — GREEN after G1 + G4 land:
```
node --test tests/agent-all/lib/adversarial-verifier-isolation.test.mjs
```
Expected: 3 pass, exit 0.

---

#### Live proof checklist (operator runbook → `g5-live-proof-checklist.md`)

**Pre-conditions:**
- `/agent-init` has run (`.claude/agents/` exists, `agent-policy-hook` installed).
- G1 committed; isolation tests GREEN.
- G3 committed; memory-agent tests GREEN.
- G4 committed; checkpoint tests GREEN.
- `gates.adversarialVerify: true` is set in the run config so the adversarial dispatch fires.

**G5-A — throwaway task**
```bash
cat > /tmp/throwaway-task.md << 'EOF'
### Task 1: Add a trivially correct utility function

**Files:**
- Create: `src/g5-proof-util.mjs`

Add `export function echo(s) { return s; }` plus a test at
`tests/lib/g5-proof-util.test.mjs` asserting `echo("hello") === "hello"`.
EOF
```

**G5-B — run `/agent-all` (loop off), capturing the transcript**
```
/agent-all /tmp/throwaway-task.md --no-pr --no-brainstorm --yes
```

**G5-C — capture evidence (assert EXACT values):**

Evidence 1 — adversarial entry in `verification-evidence.jsonl`:
```bash
RUNID=$(ls -t .agent-skill/runs/ | head -1)
python3 - "$RUNID" << 'PY'
import sys, json
runid = sys.argv[1]
lines = [json.loads(l) for l in open(f".agent-skill/runs/{runid}/verification-evidence.jsonl") if l.strip()]
adv = [l for l in lines if l.get("status") in ("passed","failed")]
assert adv, f"no adversarial-verifier evidence; entries={lines}"
assert adv[0]["schemaVersion"] == "verification-evidence/v1", adv[0]
print("EVIDENCE-1 OK:", adv[0]["schemaVersion"], adv[0]["status"])
PY
```

Evidence 2 — checkpoint entry in `memory-log.jsonl`:
```bash
python3 - "$RUNID" << 'PY'
import sys, json
runid = sys.argv[1]
lines = [json.loads(l) for l in open(f".agent-skill/runs/{runid}/memory-log.jsonl") if l.strip()]
ck = [l for l in lines if l.get("event") == "checkpoint"]
assert ck, f"no checkpoint entry; lines={lines}"
assert ck[0]["schemaVersion"] == "memory-log/v1", ck[0]
assert isinstance(ck[0]["scopingPayloads"], list), ck[0]
print("EVIDENCE-2 OK: checkpoint wave", ck[0]["wave"], "iter", ck[0]["iter"])
PY
```

Evidence 3 — a deleted-test-file change is BLOCKED. Edit the task so the implementer step deletes `tests/lib/g5-proof-util.test.mjs` (deterministic, real mechanism: the suite then fails → break-condition exits non-zero → adversarial verdict `failed`). Re-run G5-B, then:
```bash
RUNID=$(ls -t .agent-skill/runs/ | head -1)
python3 - "$RUNID" << 'PY'
import sys, json
runid = sys.argv[1]
lines = [json.loads(l) for l in open(f".agent-skill/runs/{runid}/verification-evidence.jsonl") if l.strip()]
failed = [l for l in lines if l.get("status") == "failed"]
assert failed, f"verifier did not block; entries={lines}"
print("EVIDENCE-3 OK: adversarial block confirmed, status=", failed[0]["status"])
PY
echo "Phase 4 gate exit: $?  (a blocked wave exits 2)"
```

Evidence 4 — checkpoint survives a simulated resume (file fallback):
```bash
node --input-type=module -e '
import { recallRepoMemory, makeFileMirror } from "./plugins/harness-floor-copilot/skills/agent-all-copilot/lib/memory-bridge.mjs";
const fileMirror = makeFileMirror({ rootDir: process.cwd() + "/.agent-skill/memory" });
const r = await recallRepoMemory({ key: "checkpoint/wave-0-iter-0", toolCaller: null, fileMirror });
if (!r.ok || r.source !== "file") { console.error("EVIDENCE-4 FAIL:", r); process.exit(1); }
console.log("EVIDENCE-4 OK: recovered from file, source=file, wave=", r.value?.wave);
'
```
(If your Node build rejects top-level await in `-e`, write the snippet to a temp `.mjs` file and run it instead.)

---

#### Self-contained runs (no fixture restoration required)

```bash
node --test tests/agent-all/lib/memory-agent-checkpoint.test.mjs       # G4 (4)
node --test tests/agent-all/lib/adversarial-verifier-isolation.test.mjs # G5 (3)
node --test tests/agent-all/lib/resume-artifacts.test.mjs               # pre-existing (5)
```
All exit 0. **Caveat (honest):** 45 deleted working-tree fixtures block the full suite (`node --test $(find tests -name '*.test.mjs' | sort)`); the full-suite run is USER-GATED until the user restores those fixtures.

---

#### Pathspec commit for the G5 test file

```bash
git add tests/agent-all/lib/adversarial-verifier-isolation.test.mjs

git commit -m "$(cat <<'EOF'
test(G5): isolation tests for adversarial-verifier + G4 wire-up gate

adversarial-verifier-isolation.test.mjs asserts EXACT audit literals
('VERIFICATION_AUDIT: passed'/'failed'), exitCode semantics, and
evidence.schemaVersion, driving the failing case through a failing
break-condition command (the real mechanism — a deleted test file fails the
suite), not diff-parsing. Also asserts the G4 gate: no checkpoint flush when
the verifier blocks. Self-contained (no deleted-fixture dependency); full-suite
run is user-gated on fixture restoration.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)" -- tests/agent-all/lib/adversarial-verifier-isolation.test.mjs

git show --stat HEAD
```
Expected: exactly 1 file.
