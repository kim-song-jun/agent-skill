# Measurable Self-Improvement — Design Spec

**Status:** Approved (brainstorming complete, awaiting plan)
**Date:** 2026-06-25
**Author:** sungjun
**Origin:** Comparison of [revfactory/harness](https://github.com/revfactory/harness) (an L3 "team-architecture factory") against our operational harness. Two transferable ideas were bundled into one cohesive sub-project: revfactory's **`/harness:evolve` feedback loop** and its **with-skill vs without-skill comparison testing**. The other two takeaways from the comparison (single routing front door; named orchestration-pattern docs) are tracked as separate specs.

---

## 1. Purpose

Close the harness's missing **feedback loop**: today the `.agent-skill/` ledger is write-only and nothing reads it back, and `scripts/skill-eval.mjs` measures against **hardcoded fixture constants** rather than real behavior. This spec makes the harness measurably self-improving by:

1. Defining **one shared run-record contract** (`run-record/v1`) that both real `/agent-all` runs and live evals emit.
2. Adding a **read-back actuator** that mines a repo's prior run-records to pre-seed `/agent-init` scaffolding choices (advisory, user-gated).
3. Converting the eval from "does the skill trigger" to "**does the skill change behavior for the better**" via a **record-then-reverify** live mode that replaces hardcoded fixture constants with real recorded baselines.

The spine is the single run-record contract: real runs and evals **produce** it; the actuator **consumes** it.

## 2. Non-Goals

- **Not** domain-generative scaffolding. The actuator only recommends from the existing 18-template role catalog; it never synthesizes new roles. (Honors the anti-sprawl / verification-independence thesis.)
- **Not** cross-repo / global priors in v1. Learning is per-repo; the schema carries `repoFingerprint` so cross-repo aggregation is possible later, but it is not built now.
- **Not** every-eval live execution. Live model invocation is opt-in (`--record`), release-gated, and cost-capped; routine CI stays deterministic with zero model calls.
- **Not** auto-applied scaffolding changes. Priors are surfaced as suggestions the user confirms (Decision-Matrix gate, global rules 14/15).
- **Not** a selectable orchestration-pattern menu. Out of scope here (separate low-priority takeaway).

## 3. Background — verified current state

- **Ledger is write-only.** `.agent-skill/runs/` holds only hook logs (`default/memory-log.jsonl`, `default/policy-log.jsonl`) plus ad-hoc `issue-completion/` files. `.agent-skill/decisions/` holds cosmetic `- [iso] session end` lines (session-summary Stop hook). No skill/hook/installer reads any of it back.
- **A cost-telemetry contract already exists and is shared.** `plugins/harness-floor/skills/agent-all/lib/cost-telemetry.mjs` exports `summarizeCostTelemetry`, which `scripts/skill-eval.mjs` imports. Eval fixtures already carry `telemetryRecords: [{platform, model, source, inputTokens, outputTokens, totalTokens, costUSD}]`. We build `run-record/v1` on top of this contract rather than inventing telemetry.
- **Eval reads static constants.** `scripts/skill-eval.mjs` (`EVAL_FIXTURE_SCHEMA_VERSION = "agent-skill-eval-fixture/v1"`, `EVAL_REPORT_SCHEMA_VERSION = "agent-skill-eval-report/v1"`) loads `tests/fixtures/evals/*.json` whose `modes.{baseline,agent-all,...}` results (`passed`, `iterations`, `wallClockMs`, `manualInterventions`, `failedReviewerGates`, `qualityDebtFindings`, `rollbackCount`, `telemetryRecords`) are hand-authored constants. `buildRun()` summarizes them via `summarizeCostTelemetry`. Nothing executes a model.
- **Roster selection is fixed.** `plugins/harness-builder/skills/agent-init/phases/2-claude-md.md` computes `agents = f(size, qa_personas, operationalProfile)`: `small=[planner,dev,reviewer]`, `medium`+`[designer, qa-{persona}…, tester]`, `large`+`[frontend-dev,backend-dev,doc-writer]`; `operationalProfile` appends 8 fixed reviewer roles. Flags live in `templates/settings.local.json.hbs`. There is no `.agent-all.json` config file.

## 4. Architecture

```
 [agent-all run completes] ──emit──┐
                                   ├──▶ .agent-skill/runs/records/*.jsonl   (run-record/v1)
 [skill-eval --record] ─────emit───┘             │
                                                 │ read-back (per-repo; same repoFingerprint)
                                                 ▼
                                  [actuator: derive-priors.mjs]
                                                 │ aggregate → priors {roster+, profile, costFlags}
                                                 ▼
                       [agent-init Phase 1: "prior-run prior" AskUserQuestion panel]
                                                 │ user confirms / overrides (advisory)
                                                 ▼
                                  [Phase 2 roster/profile/flags]
```

Design for isolation — four units, each independently testable through a narrow interface:

| Unit | File | Does | Depends on |
|------|------|------|------------|
| A. Contract | `scripts/lib/run-record.mjs` | define + validate `run-record/v1`; serialize/parse JSONL | nothing (pure) |
| B. Emitters | agent-all Phase 5/Stop hook + eval `--record` | append a run-record per run | A |
| C. Actuator | `plugins/harness-builder/skills/agent-init/lib/derive-priors.mjs` | read repo run-records → priors | A (read) |
| D. Live eval | `scripts/skill-eval.mjs` `--record` mode | run baseline vs agent-all once, record real outcome, replace fixture constants | A, B, checker |

### 4A. `run-record/v1` contract

`scripts/lib/run-record.mjs`. One JSONL line per run:

```jsonc
{
  "schemaVersion": "agent-skill-run-record/v1",
  "runId": "<uuid>",
  "ts": "<iso>",
  "repoFingerprint": "<sha256 of git remote origin URL, else sha256 of repo root abspath>",  // stable per-repo id; enables future cross-repo aggregation
  "source": "agent-all" | "eval-live",
  "taskCategory": "backend-api" | "small-web-ui" | "docs-only" | "...",
  "scaffold": {
    "size": "small|medium|large",
    "profile": "lite|operational",
    "roster": ["planner", "dev", "reviewer", "..."],
    "qaPersonas": ["auth", "..."],
    "costFlags": { "maxCostUSD": 5.0 }            // optional
  },
  "outcome": {
    "passed": true,
    "iterations": 2,
    "manualInterventions": 1,
    "failedReviewerGates": 1,
    "qualityDebtFindings": 0,
    "rollbackCount": 0,
    "rolesActuallyInvoked": ["planner", "dev", "reviewer", "security-reviewer"]
  },
  "telemetryRecords": [
    { "platform": "...", "model": "...", "source": "...",
      "inputTokens": 0, "outputTokens": 0, "totalTokens": 0, "costUSD": 0 }
  ]
}
```

- `outcome.rolesActuallyInvoked` is the **delta signal**: scaffold roster vs. roles actually used → which roles were repeatedly added (recommend) or never used (note).
- `telemetryRecords` reuses the existing `cost-telemetry.mjs` shape verbatim — one telemetry contract across runs and evals.
- `validateRunRecord(record)` rejects malformed records (missing `schemaVersion`, non-array telemetry, etc.), mirroring the existing `validateEvalFixture` style.

### 4B. Emitters

- **Real runs:** `/agent-all` appends a run-record at Phase 5 completion (or via the Stop hook that already writes session-summary). It already aggregates cost telemetry; this adds the `scaffold` + `outcome` fields and a JSONL append to `.agent-skill/runs/records/`.
- **Evals:** `--record` mode (4D) emits the same contract with `source: "eval-live"`.

### 4C. Actuator — `derive-priors.mjs` (the missing piece)

- **Input:** same-repo `.agent-skill/runs/records/*.jsonl`, filtered to matching `repoFingerprint`. **Per-repo only.**
- **Priors derived (locked scope — roster + profile + costFlags only):**
  - **Roster:** a role appearing in `rolesActuallyInvoked` but not in `scaffold.roster` across **≥60% of the most recent N=5 records** → recommend adding it. (Locked micro-decision.)
  - **Profile:** the dominant `scaffold.profile` among recent records → recommend as default.
  - **Cost flags:** observed `costUSD` distribution → suggest a `maxCostUSD` default.
- **Output:** a `priors` object: `{ rosterAdditions: [...], suggestedProfile, suggestedMaxCostUSD }`. Empty when no records (cold start).
- **Consumption:** `/agent-init` Phase 1 reads `priors`; when non-empty, it presents a **"prior-run prior" `AskUserQuestion` panel** (locked micro-decision) — e.g. "Past runs added `security-reviewer` in 4/5 runs. Include it by default?" — and the user confirms or overrides. Cold start → silent fallback to current defaults, no panel.
- **Read-only + advisory:** the actuator never mutates templates or config directly.

### 4D. Live eval — record-then-reverify

Extend `scripts/skill-eval.mjs` (do **not** rewrite the framework):

- **Canonical tasks:** reuse the 3 existing fixtures (`backend-api-task`, `small-web-ui-task`, `docs-only-task`), made *executable* by adding two fields: `taskPrompt` (the work to do) and `checkerCmd` (a deterministic command whose exit code decides pass/fail).
- **`--record` mode:**
  1. For each canonical task, run **baseline** (plain prompt) and **agent-all** via the real CLI, each in an **isolated temp directory** (never the live working tree).
  2. Collect real telemetry + outcome; `passed` is decided by `checkerCmd` exit code (locked micro-decision — objective, deterministic).
  3. Write `source: "eval-live"` run-records, and **replace the fixture's hardcoded `modes[...]` constants with the recorded values** — converting constants into recorded-then-reverifiable baselines.
  - Opt-in, release-gated, cost-capped via thrift.
- **Routine CI (smoke):** re-validates deterministically against the recorded baseline (zero model calls), exactly as today — but now the baseline is real.
- **Framing:** the eval report surfaces the **with-skill vs without-skill delta** (pass-rate, cost-overhead) as the headline — "did the skill change behavior for the better?"

## 5. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Learning signal source | Real run logs + eval, unified via one run-record contract |
| 2 | Actuator adjustment scope | Roster + profile + cost flags (only) |
| 3 | Live eval mechanism | Record-then-reverify (record real once; CI re-verifies deterministically) |
| 4 | Learning scope | Per-repo only (schema ready for later cross-repo) |
| 5 | Pass criterion (live record) | Per-fixture deterministic `checkerCmd` exit code |
| 6 | Prior threshold | Role added in ≥60% of most recent N=5 records |
| 7 | Actuator exposure | `/agent-init` Phase 1 `AskUserQuestion` panel (advisory, user-gated) |

## 6. Error handling & safety

- **Shared-tree git safety:** `--record` runs baseline/agent-all in an isolated temp directory; never `git stash` / `git reset --hard` / branch-switch the live tree (global rules 6–8).
- **Actuator is read-only + advisory:** a bad prior can never auto-mutate the scaffold; the user gates every applied suggestion.
- **Write failures are loud, not silent:** a failed run-record append logs a meaningful warning and lets the run proceed; no empty `catch` (global rule 3). The run itself is never blocked by telemetry failure.
- **Schema drift:** `validateRunRecord` rejects records lacking `schemaVersion === "agent-skill-run-record/v1"`, so a future v2 cannot be silently misread.

## 7. Testing strategy (do not re-create the fake-fixture trap)

- **A — contract:** round-trip serialize/parse; `validateRunRecord` rejects malformed records. Real contract tests, not mock assertions.
- **C — actuator:** synthetic run-record inputs → expected priors. E.g. *5 records, `security-reviewer` invoked-but-unscaffolded in 4 → it appears in `rosterAdditions`; 0 records → empty priors; 3/5 (<60%) → excluded.* This is the behavioral core and must not be a placebo test.
- **D — live eval:** a `--record` run produces real records once; then a **determinism test** asserts re-verification against the recorded baseline is stable. **Remove the hardcoded-constant assertions** (e.g. `tokenEstimate === 6300` in `skill-eval.test.mjs`) — retiring that debt is part of this work.
- **Integration:** `/agent-init` Phase 1 with a seeded `.agent-skill/runs/records/` surfaces the prior panel; with an empty dir it does not.

## 8. Scope / YAGNI boundaries

- ❌ No domain-generative role synthesis — recommend only within existing 18 roles.
- ❌ No cross-repo global priors in v1 (schema-ready only).
- ❌ No every-eval live execution (record-then-reverify).
- ❌ No selectable orchestration topology (separate spec).
- ✅ In scope: per-repo, advisory, roster + profile + costFlags, one run-record contract, record-then-reverify eval.

## 9. Rollout sequence (for the plan)

1. **A** `run-record.mjs` + tests (foundation; nothing depends on it yet).
2. **C** `derive-priors.mjs` + tests (read-back actuator; testable against synthetic records before B emits real ones).
3. **B** wire `/agent-all` emission (real records start accruing).
4. **`/agent-init` Phase 1** prior panel integration.
5. **D** eval `--record` mode + canonical task `taskPrompt`/`checkerCmd` + retire hardcoded-constant assertions.

A→C→B ordering lets the actuator be fully tested on synthetic data before any emitter exists, de-risking the highest-value unit first.
