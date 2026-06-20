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
- `--no-brainstorm` — skip Phase 1's brainstorming for free-form prompts.
- `--resume` — skip phases already complete per `.agent-all-state.json`.
  When a task path is supplied, automatically discover `/agent-handoff`
  artifacts from `.agent-skill/handoff/` and use their metadata to surface the
  recommended next action. Legacy task sibling artifacts are still checked
  during migration.
- `--force` — wipe state and restart.
- `--yes` — skip all interactive confirms (including the break-condition prompt;
  falls back to the config or built-in default).

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
2. **State lives in `.agent-all-state.json`.** Shape: `{phases:[{phase,completedAt}], task, plan, waves[], orchestration, iter, costUSD, costTelemetry, prUrl, decisions:{<canonical-task-id>:{<decision-id>:{chosen_index,auto_resolved,timestamp,reasoning?}}}, interactions:{<canonical-task-id>:{<decision-id>:{interactionId,action,selectedOptionId,auto_resolved,timestamp}}}}`. `costTelemetry` mirrors the latest `agent-cost-telemetry/v1` summary from `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`; `costUSD` remains a backward-compatible total. `orchestration` uses `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,failureSignatures,blockedReasons,budget}`. New task docs use `T-YYYYMMDD-NNN` display ids for filenames and `AS-TASK-*` canonical ids for metadata/registries. `--resume` resumes after `max(phases[*].phase)` and reads `/agent-handoff` artifacts from `.agent-skill/handoff/`, falling back to legacy task siblings during migration. **Transient field (not persisted to `.agent-all-state.json`):** `resumeCheckpoint` — reconstructed from `.agent-skill/memory/checkpoint_LATEST.json` on `--resume` by Phase 0 step 5b when the latest checkpoint is `inFlight:true`; carries `{phase,wave,iter,scopingPayloads,decisionsSoFar,...}` for Phase 3 step 3 to re-enter the dead wave at 3a.
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

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`. Returns built-in `DEFAULTS` when path missing.
- `lib/wave-builder.mjs` — `buildWaves(tasks, waveConfig)` → array of waves.
- `lib/gate-plan.mjs` — `buildGatePlan({files,gates,taskId,title})` → ordered coordinator/reviewer dispatches with audit-token, gate-reason, and pass-criteria contracts.
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

## When done

Print summary: phases completed, iters, cost, PR URL. Exit code 0/1/2/3 per spec.
