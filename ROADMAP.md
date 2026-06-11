# agent-skill Roadmap

This roadmap groups active GitHub issues into delivery milestones. It is not a
release promise. The authoritative implementation evidence is still the current
worktree, tests, release gates, and linked issue acceptance criteria.

## Milestone 1: Foundation Cleanup

Goal: make the existing harness durable enough for long-running work and
multi-session handoff.

| Issue | Theme | Exit Criteria |
|---|---|---|
| #9 | `/agent-handoff` | Handoff and session prompt artifacts can resume a task without manual prompt reconstruction. |
| #10 | Unlimited loop | `--max-iter=0` or `loop.maxIter: null` allows unbounded iteration while policy, cost, and repeated failure gates still stop unsafe runs. |
| #17 | Generated artifact relocation | New control-plane artifacts write under `.agent-skill/` instead of product docs. |
| #18 | Canonical task ids | New tasks use `AS-TASK-*` canonical ids, display ids, and a registry to avoid parallel filename collisions. |
| #19 | Planning docs | `PROJECT_PLAN.md`, `ROADMAP.md`, `SUPPORT_MATRIX.md`, and `docs/architecture/README.md` give contributors a stable entry point. |

## Milestone 2: Capability Core and Platform Adapters

Goal: define one capability model and render it consistently across supported
hosts.

| Issue | Theme | Exit Criteria |
|---|---|---|
| #14 | Capability core | Shared metadata drives support matrices and platform adapters without duplicating semantics. |
| #13 | Decision UX | Decision, resume, budget, and blocked-state interactions share a protocol across hosts. |
| #23 | Public governance | PR smoke CI, issue templates, label taxonomy, and PR templates make contribution state visible on GitHub. |

## Milestone 3: Verification and Data Expansion

Goal: let `/agent-all` prove completion for non-web tasks with the same rigor as
visual QA.

| Issue | Theme | Exit Criteria |
|---|---|---|
| #15 | Verification adapters | Web UI, CLI, API, data, SQL, notebook, and batch checks share a `verification-evidence/v1` contract. |
| #16 | Data capability | Notebook, SQL, artifact diff, and data handoff workflows have runnable guidance and evidence logs. |
| #20 | Quality debt gate | Fallbacks, suppressions, skipped tests, meaningless tests, and temporary debt require explicit review or justification. |

## Milestone 4: Policy and Dynamic Orchestration

Goal: move safety and routing decisions from scattered prompt text into durable
runtime policy and state.

| Issue | Theme | Exit Criteria |
|---|---|---|
| #11 | Policy hook engine | Loop, verification, reviewer, command, spawn, and non-TTY decision policies share event/result schemas and JSONL audit logs. |
| #12 | Dynamic orchestration | Required agents are recalculated from changed files, failures, cost, and risk each wave. |
| #25 | Redaction gate | Handoff, reports, policy logs, interaction logs, and PR bodies are scanned or redacted before secrets leave the control plane. |

## Milestone 5: Cost, Evaluation, and Release Governance

Goal: measure whether added harness behavior improves outcomes enough to justify
its runtime and maintenance cost.

| Issue | Theme | Exit Criteria |
|---|---|---|
| #21 | Cost telemetry | Task, loop, and orchestration state records token/cost estimates and can stop or warn on budget thresholds. |
| #22 | Skill utility benchmark | `scripts/skill-eval.mjs` compares baseline vs harness modes across representative fixtures with pass rate, intervention, and cost overhead reports under `.agent-skill/evals/`. |
| #24 | Supply-chain provenance | Release manifests, checksums, signed-tag status, and optional install verification make plugin artifacts traceable. |

## Sequencing Notes

- #19 is the planning index for all later work.
- #14 makes `SUPPORT_MATRIX.md` and platform capability drift checks durable.
- #11 is a dependency for stronger enforcement in #12, #20, #21, and #25.
- #18 gives #9, #17, and future artifact governance a stable task key.
- #21 and #22 share `agent-cost-telemetry/v1` metric names so benchmark output
  can consume live telemetry later.

## Done Definition

For roadmap items, "done" means:

- Acceptance criteria are satisfied by current-state evidence.
- Relevant docs and generated artifacts are updated.
- Targeted tests pass.
- Broad release gates are run when the blast radius touches shared runtime,
  install, release, or platform adapter behavior.
- Legacy compatibility is preserved unless the issue explicitly removes it.
