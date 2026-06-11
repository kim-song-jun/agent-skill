# agent-skill Architecture Index

This index makes the date-stamped design documents easier to navigate. It links
top-level planning docs, current architecture sources, and historical specs by
workstream.

## Start Here

| Need | Source |
|---|---|
| Project direction and workstreams | [PROJECT_PLAN.md](../../PROJECT_PLAN.md) |
| Milestone sequencing | [ROADMAP.md](../../ROADMAP.md) |
| Platform capability status | [SUPPORT_MATRIX.md](../../SUPPORT_MATRIX.md) |
| User-facing overview | [README.md](../../README.md) |
| Release history | [CHANGELOG.md](../../CHANGELOG.md) |

## Current Architecture Sources

| Area | Source |
|---|---|
| Capability catalog | [plugins/harness-core/capabilities/catalog.mjs](../../plugins/harness-core/capabilities/catalog.mjs) |
| Support matrix generator | [scripts/generate-support-matrix.mjs](../../scripts/generate-support-matrix.mjs) |
| Agent-all runtime | [plugins/harness-floor/skills/agent-all](../../plugins/harness-floor/skills/agent-all) |
| Builder runtime | [plugins/harness-builder/skills/agent-init](../../plugins/harness-builder/skills/agent-init) |
| Codex builder runtime | [plugins/harness-builder-codex/skills/codex-init](../../plugins/harness-builder-codex/skills/codex-init) |
| Skill utility eval runner | [scripts/skill-eval.mjs](../../scripts/skill-eval.mjs) |
| Release fixture smoke | [scripts/release-fixture-smoke.mjs](../../scripts/release-fixture-smoke.mjs) |

## Workstream Specs

### Foundation and Runtime Commands

- [Agent-all design](../superpowers/specs/2026-05-17-agent-all-design.md)
- [Harness builder design](../superpowers/specs/2026-05-17-harness-builder-design.md)
- [Visual QA design](../superpowers/specs/2026-05-17-visual-qa-design.md)
- [Harness thrift design](../superpowers/specs/2026-05-18-harness-thrift-design.md)
- [Harness explore design](../superpowers/specs/2026-05-18-harness-explore-design.md)
- [Harness debug design](../superpowers/specs/2026-05-18-harness-debug-design.md)
- [Operational agent-init and agent-all design](../superpowers/specs/2026-06-01-operational-agent-init-agent-all-design.md)

### Platform Adapters

- [Cross-platform plugins design](../superpowers/specs/2026-05-18-cross-platform-plugins-design.md)
- [Cross-platform follow-up implementation design](../superpowers/specs/2026-05-18-cross-platform-followup-implementation-design.md)
- [Agent-all porting decomposition](../superpowers/specs/2026-05-18-agent-all-porting-decomposition.md)
- [Agent-all Codex implementation spec](../superpowers/specs/2026-05-18-agent-all-codex-impl-spec.md)
- [Agent-all Copilot implementation spec](../superpowers/specs/2026-05-18-agent-all-copilot-impl-spec.md)
- [Agent-all Cursor implementation spec](../superpowers/specs/2026-05-18-agent-all-cursor-impl-spec.md)
- [Agent-all Gemini implementation spec](../superpowers/specs/2026-05-18-agent-all-gemini-impl-spec.md)
- [Capability core and platform adapters](../superpowers/specs/2026-06-11-capability-core-platform-adapters.md)

### Visual QA and Verification

- [Visual QA porting design](../superpowers/specs/2026-05-18-visual-qa-porting-design.md)
- [Visual QA comprehensive design](../superpowers/specs/2026-05-19-visual-qa-comprehensive-design.md)
- [Visual QA pairs and element scope design](../superpowers/specs/2026-05-22-visual-qa-pairs-and-element-scope-design.md)
- [QA vs verification personas design](../superpowers/specs/2026-05-22-qa-vs-verification-personas-design.md)
- [Verification adapter interface](../superpowers/specs/2026-06-11-verification-adapter-interface.md)
- [Harness data capability](../superpowers/specs/2026-06-11-harness-data-capability.md)

### Policy, Decisions, and Orchestration

- [Native ask-user brainstorming integration](../superpowers/specs/2026-05-18-native-ask-user-brainstorm-integration.md)
- [Hook precedence integration](../superpowers/specs/2026-05-18-hook-precedence-integration.md)
- [Decision surfacing and policy hooks](../superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md)
- [Policy hook engine](../superpowers/specs/2026-06-11-policy-hook-engine.md)
- [Dynamic agent orchestration](../superpowers/specs/2026-06-11-dynamic-agent-orchestration.md)

### Metrics and Evaluation

- [Skill utility benchmark](../superpowers/specs/2026-06-11-skill-utility-benchmark.md)

### Release, Runtime, and Operations

- [CLI runtime verification checklist](../superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md)
- [Auto-detect Docker stack design](../superpowers/specs/2026-05-18-auto-detect-docker-stack-design.md)
- [Operational hardening plan](../superpowers/plans/2026-06-01-operational-agent-init-agent-all-hardening.md)
- [Decision surfacing and policy hooks plan](../superpowers/plans/2026-05-21-decision-surfacing-and-policy-hooks.md)

## Issue to Workstream Map

| Issues | Workstream |
|---|---|
| #9, #10, #17, #18, #19 | Foundation cleanup |
| #13, #14, #23 | Capability core, platform adapters, and public governance |
| #15, #16, #20 | Verification, data, and quality governance |
| #11, #12, #25 | Policy hooks, dynamic orchestration, and artifact security |
| #21, #22, #24 | Cost telemetry, evaluation, and supply-chain governance |

## Adding New Architecture Docs

- Add date-stamped specs under `docs/superpowers/specs/`.
- Add implementation plans under `docs/superpowers/plans/`.
- Link the new document from this index.
- Map the related GitHub issue to a workstream in `PROJECT_PLAN.md` if it
  introduces a new area of work.
