---
name: agent-all-codex
description: >
  Codex CLI port of /agent-all (intent → plan → wave-dispatch → gate → PR).
  Current Codex hooks do not expose the older agent-dispatch surface, so
  Phase 3 uses sequential `.codex/skills/<role>` invocations. The local
  phase files in this skill are the runnable Codex workflow contract.
---

# /agent-all-codex

Runs the cost-unrestricted multi-agent pipeline using Codex CLI
primitives. Current Codex hooks do not expose a command surface for the
older parallel agent dispatch design, so this port uses sequential
invocation of `.codex/skills/<role>/SKILL.md` per wave task.

## Usage

From an installed Codex project, open `codex` in the repo and type the public
harness entrypoint:

```
run /agent-all for "add user signup form"
```

This routes to the local `agent-all-codex` workflow contract below. The
Codex-specific skill name remains visible so installed files, release audits,
and phase paths can stay platform-explicit.

```
/agent-all-codex "add user signup form"
/agent-all-codex .agent-skill/tasks/12-fix-login.md
/agent-all-codex "fix flaky test" --loop --max-iter=5
/agent-all-codex .agent-skill/tasks/x.md --no-pr --wave-size=large
/agent-handoff .agent-skill/tasks/x.md --strict
```

## Flags

Same as Claude Code: `--loop`, `--max-iter=<N>`, `--max-cost=<USD>`,
`--max-runtime-sec=<seconds>`, `--wave-size=small|medium|large`, `--no-pr`, `--no-brainstorm`,
`--resume`, `--force`, `--yes`,
`--break-condition=<spec>`, `--reconfigure`, `--qa`.

`--resume` checks for `/agent-handoff` sibling artifacts
(`.agent-skill/tasks/<NN>-<slug>.handoff.md` and `.session.md`) and uses their
metadata to surface the recommended next action. In non-TTY mode the
recommended action is auto-selected and logged to
`.agent-skill/runs/handoff-audit.jsonl` plus the shared
`.agent-skill/runs/handoff/interactions.jsonl`.

`--qa` is the one-flag shortcut for end-to-end verification: equivalent
to `--break-condition='{"type":"composite","steps":[{"type":"test-auto"},
{"type":"visual-qa","mode":"comprehensive"}]}'`. Tests run as a cheap gate;
visual-qa (comprehensive mode) runs as the final E2E check. Auto-scaffolds
`.visual-qa.json` with sane defaults if missing.

When `--loop` is set, Phase 0 prompts the user interactively (via Codex's
`ask_user`) for the break-condition preset (test-auto / visual-qa /
Verification adapter / Custom shell / Composite) and offers to save the choice to
`.agent-all.json`. Use `--break-condition=<spec>` to skip the prompt for
one invocation, or `--reconfigure` to re-prompt even when a non-default
value already lives in config.

Additional Codex-specific:
- `--dispatch=sequential` — explicit no-op override. `--dispatch=agent-hook`
  aborts because current Codex hooks do not support that path.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git + .codex/skills + config + dispatch-strategy detect |
| 1 | `phases/1-intent.md` | brainstorm (chat) OR load task file |
| 2 | `phases/2-plan.md` | draft plan via `apply_patch` |
| 3 | `phases/3-dispatch.md` | sequential skill invocations |
| 4 | `phases/4-gate.md` | dispatch reviewer (same strategy as Phase 3) |
| 5 | `phases/5-pr.md` | `shell_command`: git branch push + `gh pr create` |
| 6 | `phases/6-loop.md` | breakCondition shell + state.iter re-entry |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Atomic write via `apply_patch` (temp + rename). Match the Claude orchestration shape when floor is active: `{runId,wave,changedFiles,changedDomains,requiredAgents,spawnedAgents,failureSignatures,blockedReasons,budget}` plus `costTelemetry`, `decisions`, and `interactions` maps for `agent-interaction/v1` prompts. Mirror the latest `agent-cost-telemetry/v1` summary to `state.costTelemetry.summary` and keep `state.costUSD` as the backward-compatible total.
3. **Delegate, don't reimplement.** Phase 3 uses sequential skill calls; Phase 4 same; Phase 5 uses `shell_command`.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Loop stops:** completion is break-condition driven. `--max-iter=0` or
   `loop.maxIter: null` enables unlimited iterations, while cost/runtime
   budgets, hard policy hooks, user interruption, and repeated failure signatures can still
   stop the loop. Cost enforcement uses Codex's session-cost API if exposed,
   else best-effort estimates through `agent-cost-telemetry/v1`.
6. **Policy events use the shared schema.** Codex command hooks hard-deny
   shell policy violations, while floor orchestration emits the same
   `agent-policy-event/v1` warnings/log entries to
   `.agent-skill/runs/<run-id>/policy-log.jsonl` when available. Dynamic
   sequential spawns must also record role, reason, wave, and cost estimate in
   `.agent-skill/runs/<run-id>/spawn-log.jsonl`. Cost usage appends
   `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`.
7. **Interactions use the shared UX schema.** Codex renders
   `agent-interaction/v1` through the Codex prompt renderer, stores selections
   under `state.interactions`, and appends
   `.agent-skill/runs/<run-id>/interactions.jsonl`. Non-TTY may auto-select
   recommended low/medium-risk options only; high-risk options pause or block.
8. **No nested Workflow.** Codex sequential skill invocation is the local
   `/agent-all-codex` executor. Do not wrap it in an ultracode/built-in
   `Workflow`; that tool remains a sibling route for evidence-producing work.

## Codex primitive map

| Action | Codex primitive |
|---|---|
| Read file | implicit (model reads file directly) |
| Write file | `apply_patch` |
| Shell (one-shot) | `shell_command` |
| Shell (long-running) | `exec_command` (keeps PTY) |
| Dispatch subagent | invoke `.codex/skills/<role>/SKILL.md` |
| Prompt user | `ask_user` |
| Persist plan/state | `apply_patch` to `.agent-all-state.json` |

## Lib modules

- `lib/dispatch-strategy.mjs` — detect current Codex sequential dispatch support.
- `lib/sequential-dispatch.mjs` — build sequential implementer/reviewer prompts, including required audit, gate reason, and pass criteria.
- `lib/gate-plan.mjs` — `buildGatePlan({files,gates,taskId,title})` → ordered coordinator/reviewer dispatches with audit-token, gate-reason, and pass-criteria contracts.
- `lib/changed-file-classifier.mjs` — source-mirrored changed-file routing for reviewer personas and coordinator escalation.

## On error

Same as Claude port. Additional Codex-specific notes:
- If `--dispatch=agent-hook` was forced: abort because current Codex hooks
  do not expose that dispatch surface.
- If `.codex/skills/<role>/SKILL.md` missing for any wave's task role:
  abort with `/codex-init --theme=floor required to seed skill roster`.
- `shell_command` timeout (default 30s) extended to 300s for `git push`.

## When done

Print summary: phases completed, iters, cost, PR URL, dispatch strategy used.
Exit 0/1/2/3 per spec.

## References

- `references/porting-notes.md` — current Codex hook limitation + sequential rationale
- `phases/*.md` — runnable Codex phase contract
