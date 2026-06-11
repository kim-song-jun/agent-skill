# agent-skill Project Plan

This document is the top-level planning index for `agent-skill`. It does not
replace README usage docs, release gates, or date-stamped design specs. It
explains the direction of the project and maps active issues to workstreams so a
new contributor or agent session can pick the right source of truth quickly.

## Vision

`agent-skill` is a multi-platform agent harness for coding, verification, and
handoff workflows. Claude Code, Codex CLI, GitHub Copilot CLI, Cursor, Gemini
CLI, and VS Code Copilot should share one capability model while each host gets
artifacts rendered to its native surface.

The project is intentionally more than a plugin bundle. It is a control plane
for task-led execution: planning, dispatch, review, policy enforcement,
verification, resume, and release governance.

## Strategic Goals

- Establish a common capability core with platform adapters.
- Generalize verification beyond web UI into CLI, API, data, SQL, notebook, and
  batch evidence.
- Enforce loop, review, safety, and budget policy through a shared Node.js hook
  engine where platforms allow it.
- Add state-based dynamic orchestration that selects implementers and reviewers
  from current repository state.
- Keep generated control-plane artifacts outside product documentation.
- Use collision-proof canonical task ids and human-friendly display ids.
- Measure skill utility, loop cost, and token overhead before adding more
  orchestration weight.
- Keep release, install, and update paths auditable from local evidence.

## Non-Goals

- Force identical UX on every host.
- Claim full feature parity before a platform exposes the needed primitives.
- Patch global CLI config without explicit user action.
- Move every local release gate into public CI.
- Rewrite all historical design documents into one large spec.

## Architecture Overview

The architecture has four layers:

| Layer | Responsibility | Primary Sources |
|---|---|---|
| Capability core | Defines shared capability metadata, support levels, and generated matrices. | `plugins/harness-core/capabilities/catalog.mjs`, `SUPPORT_MATRIX.md` |
| Platform adapters | Render common capability semantics into Claude, Codex, Copilot, Cursor, Gemini, and VS Code artifacts. | `plugins/harness-*/`, platform README files |
| Runtime skills | Implement user-facing workflows such as `/agent-init`, `/agent-all`, `/agent-handoff`, `/visual-qa`, `/thrift`, `/explore`, `/debug`, and `/data-runner`. | `plugins/harness-floor/skills/`, `plugins/harness-builder/skills/` |
| Control-plane artifacts | Store task identity, run state, handoff, interactions, policy logs, verification evidence, and reports. | `.agent-skill/`, `.agent-all.json`, `.visual-qa.json`, `.thrift.json` |

## Workstreams

| Workstream | Scope | Active Issues |
|---|---|---|
| Foundation cleanup | Make existing commands resumable, bounded, and documented. | #9, #10, #17, #18, #19 |
| Core capability model | Shared capability catalog, support matrix, and platform adapter contract. | #14, #19 |
| Verification adapters | Common evidence model for web, CLI, API, data, SQL, notebook, and batch verification. | #15, #16 |
| Policy hooks | Node.js event/result schema, policy runner, audit logs, and host wrappers. | #11, #20, #25 |
| Dynamic orchestration | State classifier, agent planner, spawn policy, wave planner, and spawn logs. | #12, #13 |
| Artifact governance | Generated artifact paths, canonical task ids, redaction, and documentation separation. | #17, #18, #25 |
| Quality governance | Reviewer and hook gates for fallback, skipped tests, suppressions, and quality debt exceptions. | #20 |
| Metrics and evaluation | Cost telemetry, budget enforcement, and skill utility benchmark fixtures. | #21, #22 |
| Public governance | PR smoke CI, issue templates, labels, release roles, and supply-chain provenance. | #23, #24 |

## Artifact Policy

Repository documentation explains the harness. Runtime artifacts created by the
harness belong under `.agent-skill/` unless a user-facing product document is
explicitly requested.

Current artifact policy:

- Task docs: `.agent-skill/tasks/<display-id>-<slug>.md`
- Task registry: `.agent-skill/registry/tasks.json`
- Run logs and state: `.agent-skill/runs/<run-id>/`
- Handoff/session prompts: `.agent-skill/handoff/` or task-adjacent generated
  paths managed by `/agent-handoff`
- Reports: `.agent-skill/reports/`
- Redaction audit: `.agent-skill/runs/<run-id>/redaction-audit.jsonl`, storing
  only rule/count/severity/action metadata after handoff/session prompts,
  reports, logs, verification evidence, and PR bodies are scanned.
- Legacy compatibility: `docs/tasks/<NN>-<slug>.md` remains readable but is not
  the preferred target for new generated control-plane files.

## Canonical IDs

Task identity has two parts:

- Canonical id: `AS-TASK-<26 Crockford base32 chars>`, used as the durable key
  across registries, state, handoff, and logs.
- Display id: `T-YYYYMMDD-NNN`, used for human-readable filenames and issue
  discussion.

New task docs carry frontmatter with `id`, `display_id`, `github_issue`,
`status`, and `artifact_root`. The registry records the same canonical id so
parallel sessions do not collide on numeric task filenames.

## Metrics

Metrics should prove that added orchestration improves outcomes enough to justify
its cost. Current hard release metrics remain local and deterministic:

- Full Node suite pass count.
- Release fixture smoke results.
- Release provenance manifest and checksum verification.
- Secret/privacy redaction gates for control-plane artifacts and PR bodies.
- Vendored library sync status.
- Support matrix drift status.
- Release candidate evidence and clean-SHA checks.
- Cost telemetry summaries in `.agent-skill/runs/<run-id>/cost-telemetry.jsonl`.
- Skill utility eval reports in `.agent-skill/evals/<date>/summary.json`.

Benchmark metrics:

- Loop iterations to completion.
- Manual intervention count.
- Repeated failure signatures.
- Verification adapter pass/fail reasons.
- Skill utility benchmark pass rate and cost overhead from
  `node scripts/skill-eval.mjs --smoke` or `--full`.

## Release Policy

The project uses public PR smoke CI for fast contributor feedback and a local
release gate for release readiness. Public CI must not replace local release
evidence.

Release claims should be backed by:

- Clean worktree and recorded `git rev-parse HEAD`.
- `node --test`.
- `node scripts/sync-lib.mjs --check`.
- `node scripts/release-audit.mjs`.
- `node scripts/github-governance-check.mjs`.
- `node scripts/docs-structure-check.mjs`.
- `node scripts/release-provenance.mjs --release=<rc-tag> --out-dir=.agent-skill/releases/<rc-tag>`.
- `node scripts/release-fixture-smoke.mjs`.
- `node scripts/skill-eval.mjs --smoke --no-write --json`.
- `./scripts/release-smoke.sh --fast --with-live-cli` when live CLI probes are
  required.
- `node scripts/release-publish-preflight.mjs --base=origin/main` before branch
  or tag publishing.
- `node scripts/generate-support-matrix.mjs --check`.

## Issue Taxonomy

Issue titles use a bracketed area prefix:

| Prefix | Workstream |
|---|---|
| `[planning]` | Project planning and top-level documentation |
| `[platform]` | Capability core and platform adapter support |
| `[verify]` | Verification adapters and evidence contracts |
| `[data]` | Data, notebook, SQL, and non-web execution |
| `[hooks]` | Policy hook schemas and enforcement |
| `[workflow]` | Dynamic orchestration and wave planning |
| `[ux]` | Decision protocol and host-specific interaction UX |
| `[docs]` | Documentation and generated artifact placement |
| `[task-ledger]` | Task identity, registry, and ledger contracts |
| `[quality]` | Quality debt gates and reviewer policy |
| `[metrics]` | Cost telemetry and budget management |
| `[eval]` | Skill utility benchmark and evaluation fixtures |
| `[ci]` | Public PR smoke CI and GitHub governance |
| `[security]` | Supply chain, secret redaction, and privacy gates |

New issues should include:

- Workstream prefix.
- User-facing problem statement.
- Authoritative files or systems involved.
- Acceptance criteria with observable evidence.
- Non-goals to keep the first implementation bounded.

## Source Index

- Current user-facing overview: `README.md`, `README.ko.md`
- Current release notes: `CHANGELOG.md`, `CHANGELOG.ko.md`
- GitHub governance: `docs/github-governance.md`, `.github/workflows/`,
  `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`,
  `.github/labels.yml`
- Capability support: `SUPPORT_MATRIX.md`
- Milestones and sequencing: `ROADMAP.md`
- Architecture index: `docs/architecture/README.md`
- Historical specs and plans: `docs/superpowers/specs/`,
  `docs/superpowers/plans/`
