---
name: agent-all
description: Use when a scaffolded project needs a full feature, bugfix, or task run from intent through planning, implementation, review, verification, and optional PR creation.
---

# /agent-all

Runs a complete multi-agent pipeline from a free-form prompt or an existing task file. Phase 3 fan-out delegates to `superpowers:subagent-driven-development`. Phase 6 optionally loops the entire run.

## Usage

```
/agent-all "add user signup form"
/agent-all .agent-skill/tasks/T-20260611-001-fix-login.md
/agent-all "fix flaky test" --loop --max-iter=5
/agent-all .agent-skill/tasks/x.md --no-pr --wave-size=large
/agent-handoff .agent-skill/tasks/x.md --strict       # prepare a new-session handoff
```

## Flags

- `--loop` — enable Phase 6 looping. Interactively prompts for the break-condition
  preset (Test auto-detect / visual-qa skill / Verification adapter / Custom
  shell / Composite) on first use, then offers to save the choice to
  `.agent-all.json`.
- `--max-iter=<N>` — optional loop safety cap. `0` means unlimited; when
  omitted, `config.loop.maxIter` is used if present, then `defaults.maxIter`.
- `--max-cost=<USD>` — cap accumulated cost.
- `--max-runtime-sec=<seconds>` — optional wall-clock budget for long loop
  runs. Equivalent config: `loop.maxRuntimeSec`.
- `--break-condition=<spec>` — non-interactive override for the loop break
  spec. Accepts either a JSON object (e.g. `'{"type":"visual-qa"}'`) or a
  plain shell string (treated as `{type:"shell", cmd:<string>}`).
  Non-web workflows can use verification adapters, for example
  `'{"type":"verification-adapter","adapter":"cli","config":{"command":"my-tool --check","goldenStdoutPath":"test/golden/help.txt"}}'`.
- `--reconfigure` — force the interactive break-condition prompt even when
  `.agent-all.json` already has a non-default value.
- `--qa` — shortcut for `--break-condition='{"type":"composite","steps":[
  {"type":"test-auto"},{"type":"visual-qa","mode":"comprehensive"}]}'`. Tests
  run first as a cheap gate; visual-qa (comprehensive mode) runs as the
  final end-to-end check and is recorded as `verify:web-ui` evidence.
  Auto-scaffolds `.visual-qa.json` with sane defaults if missing. Takes priority over `--break-condition`, the
  interactive prompt, and any saved config value.
- `--wave-size=small|medium|large` — override config default.
- `--no-pr` — skip Phase 5 (PR creation).
- `--no-wiki` — opt out of the auto-wiki loop (see below); on by default.
- `--no-brainstorm` — skip Phase 1's brainstorming for free-form prompts.
- `--resume` — skip phases already complete per `.agent-all-state.json`.
  When a task path is supplied, automatically discover `/agent-handoff`
  artifacts from `.agent-skill/handoff/` and use their metadata to surface the
  recommended next action. Legacy task sibling artifacts are still checked
  during migration.
- `--force` — wipe state and restart.
- `--yes` — skip all interactive confirms (including the break-condition prompt;
  falls back to the config or built-in default).

## Wiki auto-loop

**Default-on** (`.agent-all.json` → `wiki.auto`, default `true`; opt out with
`--no-wiki`). agent-all consults and grows a project knowledge base in `.wiki/`
as it works, so you never have to invoke `/wiki` by hand:

- **Phase 1 — read.** Routes the intent through the wiki index; a topic hit folds
  that page's prior decisions/contradictions into planning.
- **Phase 2 — record plan.** Auto-creates `.wiki/` on first run (one-time notice),
  then writes/updates the topic page with the plan + decisions at grade C.
- **Phase 5 — record outcome.** Updates the SAME page (topic-merge) with what
  shipped — file map, verdict, PR + task cross-links — promoting it C→B, recording
  any contradiction with the recorded plan, then runs the compile self-audit (diff=0).

Mechanics live in `lib/wiki-log.mjs` (vendored, install-anchored — never a
cross-skill import) and are free code. **Token-aware:** the page *prose* is
authored by a **cheap-model wiki-scribe subagent** (`wiki.model`, default
`haiku`) in its own isolated context, so growing the wiki never costs
main-thread / expensive-model tokens; the orchestrator only does the free
mechanical prep + the install-safe `writePage`. Every wiki step is **non-fatal**:
a wiki failure warns and continues, never failing the run. Auto-wiki runs on
Claude Code + Codex; the scribe model-tiering is Claude-Code-only (Codex is a
single-model session, so it authors inline — `wiki.model` is inert there).
Copilot/Gemini/Cursor do not run the loop.

## Gates

The Phase 4 gate plan is controlled by the `gates` block in `.agent-all.json` (or the built-in defaults when the file is absent). All gates default to `true`:

| Gate key | Default | Effect |
|----------|---------|--------|
| `specReview` | `true` | Dispatches a spec-reviewer to compare the wave diff against the task goal. |
| `qualityReview` | `true` | Dispatches domain reviewers (code quality, QA, design, security, data, integration). |
| `adversarialVerify` | `true` | Dispatches an independent **opus** judge (`verification-reviewer-adversarial`) that re-derives the verdict from the diff alone, without reading the implementer's self-report. A `VERIFICATION_AUDIT: failed` from this node is a **critical block** that routes into the step-5 retry loop even if the self-reviewer passed. |
| `blockOnCritical` | `true` | Enter the step-5 retry loop (up to 3 cycles) when any reviewer reports a critical issue. |

To disable adversarial re-verification for cost-sensitive projects, add to `.agent-all.json`:
```json
{
  "gates": { "adversarialVerify": false }
}
```

The runtime behavior when `adversarialVerify === true` is documented in `phases/4-gate.md` (Step 3-adversarial). The block **decision** is deterministic code, not an LLM judgement call: the orchestrator pipes the adversarial dispatch's reported output to `lib/policy/gate-check.mjs`, which calls `adversarialAuditBlocks()` (`lib/policy/audit-tokens.mjs`) and **exits 2 on `VERIFICATION_AUDIT: failed`**, 0 otherwise — the orchestrator branches on that exit code. Honest scope: the *invocation* is still orchestrator-issued by following the phase doc (there is no runtime hook that auto-runs phase markdown), but the verdict→block mapping is exit-coded rather than a prose instruction the LLM must evaluate in its head.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git+roster+config+input checks |
| 1 | `phases/1-intent.md` | brainstorming OR load task file |
| 2 | `phases/2-plan.md` | writing-plans for the task |
| 3 | `phases/3-dispatch.md` | wave-builder + subagent-driven-development |
| 4 | `phases/4-gate.md` | wave-level spec+quality reviews |
| 5 | `phases/5-pr.md` | branch push + gh pr create |
| 6 | `phases/6-loop.md` | breakCondition + stableIters + optional maxIter/Cost/failure-signature stops |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Shape: `{status, runId, sessionId, updatedAt, awaitingUser, phases:[{phase,completedAt}], task, plan, waves[], orchestration, iter, costUSD, costTelemetry, prUrl, decisions:{…}, interactions:{…}}`. `status` is `"running"` from Phase 0 until "When done" sets `"done"` (or an abort sets `"aborted"`); `runId` is the run's id (set at Phase 0, reused verbatim on `--resume`); `sessionId` is the owning Claude session id (claimed at Phase 0 from `.agent-skill/runs/current-session.json`, or null); `updatedAt` is an ISO timestamp; `awaitingUser` is `{at:<ISO>}` while the orchestrator is yielding the turn to wait on an external user action, else null. **Every state write refreshes `updatedAt` and keeps `status:"running"`; set `awaitingUser:{at}` right before yielding for an external user action and clear it (set null) when the run resumes.** `costTelemetry` mirrors the latest `agent-cost-telemetry/v1` summary from `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`; `costUSD` remains a backward-compatible total. `orchestration` uses `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,failureSignatures,blockedReasons,budget}`. New task docs use `T-YYYYMMDD-NNN` display ids for filenames and `AS-TASK-*` canonical ids for metadata/registries. `--resume` resumes after `max(phases[*].phase)` and reads `/agent-handoff` artifacts from `.agent-skill/handoff/`, falling back to legacy task siblings during migration. **Transient field (not persisted to `.agent-all-state.json`):** `resumeCheckpoint` — reconstructed from `.agent-skill/memory/checkpoint_LATEST.json` on `--resume` by Phase 0 step 5b when the latest checkpoint is `inFlight:true`; carries `{phase,wave,iter,scopingPayloads,decisionsSoFar,...}` for Phase 3 step 3 to re-enter the dead wave at 3a.
3. **Delegate, don't reimplement.** Phase 1 calls `superpowers:brainstorming`; Phase 2 calls `superpowers:writing-plans`; Phase 3 calls `superpowers:subagent-driven-development`. Your code is a thin coordinator.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Loop stops:** completion is break-condition driven. `--max-iter=0` or
   `loop.maxIter: null` enables unlimited iterations, while cost budget, hard
   policy hooks, user interruption, runtime budget, and repeated failure
   signatures can still stop the loop.
6. **Policy events are auditable.** Hard hooks, loop gates, and dynamic
   agent-spawn planning evaluate the
   common `agent-policy-event/v1` schema and append results to
   `.agent-skill/runs/<run-id>/policy-log.jsonl`. Cost telemetry feeds the same
   policy path for 80% budget warnings and 100% budget stops.
7. **Verification evidence is adapter-based.** Web UI verdicts, CLI golden
   output, API contract smoke checks, notebook/data artifacts, SQL validation,
   and batch jobs normalize to `verification-evidence/v1` and append
   `.agent-skill/runs/<run-id>/verification-evidence.jsonl`.
8. **Interactions use one schema.** Decisions, confirmations, budget warnings,
   blocked/resume prompts, and handoff next-action prompts normalize to
   `agent-interaction/v1`. Claude renders native `AskUserQuestion`; Codex,
   Copilot, Cursor, and Gemini render prompt/markdown equivalents. Non-TTY
   auto-selection appends `.agent-skill/runs/<run-id>/interactions.jsonl`;
   high-risk options are never auto-approved.
9. **Orchestrator routing.** `/agent-all` is for durable, gated, PR-shipping code changes. Evidence-producing work (research, multi-unit audits, design/findings reports) belongs to the built-in `Workflow` (ultracode) tool instead — they are siblings, never nested. Phase 1 gauges this; the full decision table, the no-nesting constraint, and the governance-across-the-seam rule live in `references/orchestrator-routing.md`.

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

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`. Returns built-in `DEFAULTS` when path missing.
- `lib/wave-builder.mjs` — `buildWaves(tasks, waveConfig)` → array of waves.
- `lib/gate-plan.mjs` — `buildGatePlan({files,gates,taskId,title})` → ordered coordinator/reviewer dispatches with audit-token, gate-reason, and pass-criteria contracts. Default gate set includes `specReview`, `qualityReview`, and `adversarialVerify` (all `true`). When `adversarialVerify` is on (the default), the plan includes a `verification-reviewer-adversarial` dispatch (opus judge node); disable per-project via `"gates": { "adversarialVerify": false }` in `.agent-all.json`.
- `lib/orchestration/state-classifier.mjs` — classifies changed files, domains, failed tests, visual QA verdicts, ambiguity, repeated failures, and budget state.
- `lib/orchestration/agent-planner.mjs` — `planRequiredAgents(...)` → dynamic implementer/reviewer/coordinator/planner roles. Repeated failure signatures escalate to planner/user decision instead of adding more implementers.
- `lib/orchestration/spawn-policy.mjs` — evaluates each dynamic spawn through the shared policy engine before dispatch, including wave-level spawn caps and same-role repeat limits.
- `lib/orchestration/wave-planner.mjs` — wraps `buildWaves`, dynamic role planning, policy evaluation, and optional spawn-log JSONL emission.
- `lib/orchestration/spawn-log-writer.mjs` — appends `.agent-skill/runs/<run-id>/spawn-log.jsonl` entries with role, reason, wave, and cost estimate.
- `lib/cost-telemetry.mjs` — normalizes reported cost/token usage to `agent-cost-telemetry/v1`, writes `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`, and summarizes budget status.
- `lib/verification-adapters/schema.mjs` — `verification-adapter/v1` ids plus `verification-evidence/v1` normalizer/validator.
- `lib/verification-adapters/registry.mjs` — adapters for `verify:web-ui`, `verify:cli`, `verify:api-contract`, `verify:notebook-data`, `verify:sql-db`, and `verify:batch-job`.
- `lib/verification-adapters/evidence-writer.mjs` — appends `.agent-skill/runs/<run-id>/verification-evidence.jsonl`.
- `lib/data/*.mjs` — notebook inspection, SQL validation/assertions, destructive SQL checks, and artifact diff helpers used by data adapters.
- `lib/loop-evaluator.mjs` — `evaluateLoop(state, limits, runner)` → `{action: "break"|"continue"|"exhausted"|"blocked"|"interrupted", loopState, consecutivePass?, exitCode?}`. Handles unlimited `maxIter`, cost/runtime stops, policy blocks, and repeated failure signatures.
- `lib/policy/policy-engine.mjs` — `evaluatePolicyEvent(event,{writeAudit})` over `agent-policy-event/v1`; enforces loop runaway/cost/repeated-failure, hard shell blocks, pathspec commits, verification/audit tokens, dynamic spawn metadata, dynamic spawn caps/repeat limits, and non-TTY decision logging.
- `lib/interactions/schema.mjs` — `agent-interaction/v1` normalizer/validator plus decision-payload conversion.
- `lib/interactions/renderer-claude.mjs` — renders native `AskUserQuestion` args and maps selected options back to schema option IDs.
- `lib/interactions/renderer-codex.mjs`, `renderer-copilot.mjs`, `renderer-cursor.mjs`, `renderer-gemini.mjs` — prompt/markdown renderers for non-Claude surfaces.
- `lib/interactions/non-tty-resolver.mjs` and `interaction-log-writer.mjs` — resolves non-TTY interactions, blocks high-risk auto-approval, and appends `.agent-skill/runs/<run-id>/interactions.jsonl`.
- `lib/decisions/markdown-log-writer.mjs` — appends non-TTY decision review notes to `.agent-skill/runs/<run-id>/decisions.md`.
- `lib/resume-artifacts.mjs` — discovers `.agent-skill/handoff/<display-id>-<slug>.handoff.md` and `.session.md` on `--resume`, with legacy `docs/tasks/*` sibling fallback.
- `lib/session-prompt-writer.mjs` — renders a new-session prompt with metadata, gates, and dangerous-command approval policy.
- `lib/task-id-allocator.mjs` and `lib/task-registry.mjs` — allocate collision-resistant canonical task ids, human display ids, task filenames, and `.agent-skill/registry/tasks.json` records.
- `lib/task-doc-extractor.mjs` and `lib/git-state-reader.mjs` — shared by `/agent-handoff` to build resumable context.

## On error

- Dirty git tree → abort.
- `.claude/agents/` missing → abort + suggest `/agent-init`.
- `.agent-all.json` missing → warn + use built-ins.
- writing-plans fails → abort.
- Wave task BLOCKED 3× → Phase 3 abort with exit code 2.
- `--max-cost` exceeded → finish current wave, abort, preserve state.
- Loop maxIter exhausted → exit code 3, last commit preserved.
- Repeated failure signature threshold reached → blocked exit code 4 with handoff loop state.
- On any abort above, set `status:"aborted"` + refresh `updatedAt` in `.agent-all-state.json` before exiting (atomic write) when the orchestrator still controls the write.

## When done

Print summary: phases completed, iters, cost, PR URL. Exit code 0/1/2/3 per spec.
Before exiting, set `status:"done"` + refresh `updatedAt` in `.agent-all-state.json` (atomic write) so the SessionStart/Stop hooks treat the run as finished.
