# Operational Agent Init + Agent-All Hardening Design

**Date:** 2026-06-01  
**Status:** Implemented and release-audited
**Scope:** Claude Code + Codex hard enforcement, Gemini soft rules  
**Driver:** POSCO `posco/posco-mds` operating lessons: task ledger, pathspec commits, handoff discipline, role-specific review gates, context-mode, and superpowers integration.

## 1. Summary

This design turns `agent-skill` from a lightweight scaffold into a production-grade harnessing program for long-running agent work.

The default `/agent-init` becomes an **operational/heavy profile**. It scaffolds durable project memory, folder-level guidance, task ledger files, handoff templates, role-specific agents, and hard policy hooks for Claude Code and Codex. Lightweight setup remains available through `/agent-init --lite`.

The `/agent-all` pipeline becomes task-ledger-driven. Even free-form prompts create a task document, keep progress snapshots current, enforce dangerous-command policy, verify pathspec commits, and dispatch reviewer personas based on changed files.

The core principle is practical: POSCO-style discipline should be the default because it prevents real failure modes in shared, multi-session projects. Small projects opt out with `--lite`.

## 2. Goals

1. Make default `/agent-init` suitable for serious production repositories.
2. Keep a lightweight path via `/agent-init --lite`.
3. Support Claude Code and Codex as first-class hard-enforced platforms.
4. Support Gemini with prompt/rule-level soft enforcement.
5. Preserve existing project files through append-only sentinel merge.
6. Require task documents for every `/agent-all` run.
7. Add task ledger validation and handoff generation.
8. Harden `/agent-all` against shared-tree commit accidents.
9. Split implementation and verification into clearer role/persona boundaries.
10. Integrate superpowers and context-mode as foundational workflow dependencies.

## 3. Non-Goals

- Cursor and Copilot hard enforcement in this release.
- LLM-based mining of past conversation logs. v1 only includes a manual checklist for recording new gotchas.
- Full semantic validation of task document contents. The task gate validates structure, active-task consistency, and in-scope checkboxes.
- Global configuration changes without user approval.
- A single universal hook engine. Claude and Codex hooks are platform-specific in v1.

## 4. Product Surface

### 4.1 `/agent-init`

Default behavior is heavy operational setup.

It creates or updates:

- Root `CLAUDE.md`
- Root `AGENTS.md`
- Folder-level `CLAUDE.md` files for detected major directories
- Folder-level `AGENTS.md` files for the same directories
- `.claude/agents/*`
- `.codex/skills/*/SKILL.md`
- Gemini soft-rule artifacts where the Gemini builder is used
- `docs/tasks/*`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
- Policy hook files and validation scripts
- `.agent-all.json` and `.visual-qa.json` when the floor profile is enabled

### 4.2 `/agent-init --lite`

Lite mode replaces the previously discussed separate `/agent-init-lite` command.

Lite behavior:

- Minimal root guidance only
- Minimal agent/skill roster
- No task-ledger scaffold
- No hard policy hook generation
- No global config patch
- Optional warnings if foundational plugins are missing

### 4.3 `/agent-all`

`/agent-all` always works from a task document.

- `/agent-all "free form request"` creates `docs/tasks/NN-slug.md` in Phase 1.
- `/agent-all docs/tasks/NN-slug.md` resumes an existing task.
- `--task-id=<N>` overrides automatic numbering.
- Phase snapshots update the task doc.
- Completion/PR creation runs task-ledger validation.

## 5. Append-Only Merge Policy

Existing project memory must be preserved.

Sentinel format:

```markdown
<!-- agent-skill:operational:start -->
...
<!-- agent-skill:operational:end -->
```

Rules:

1. If a file does not exist, render a full template.
2. If a file exists and has the sentinel section, replace only that section.
3. If a file exists without the sentinel section, append the section.
4. Existing project-specific instructions always take precedence.
5. `--force` may overwrite generated artifacts, but must not silently rewrite user-owned content outside sentinel regions.
6. `--dry-run` prints planned writes and planned global config patches without touching files.

Affected root files:

- `CLAUDE.md`
- `AGENTS.md`
- `GEMINI.md` for Gemini soft rules

Affected local guide files:

- `backend/CLAUDE.md`, `backend/AGENTS.md` when `backend/` exists
- `frontend/CLAUDE.md`, `frontend/AGENTS.md` when `frontend/` exists
- `docs/CLAUDE.md`, `docs/AGENTS.md` when `docs/` exists
- Comparable lightweight guides for detected top-level app/packages directories

Local guides stay short: ownership, relevant commands, validation commands, generated-output exclusions, and references back to the root index.

## 6. Task Ledger

### 6.1 Generated Files

Default `/agent-init` creates:

- `docs/tasks/CLAUDE.md`
- `docs/tasks/index.md`
- `docs/tasks/_template.md`
- `docs/tasks/_handoff-template.md`
- `docs/superpowers/specs/`
- `docs/superpowers/plans/`
- `scripts/agent-task-ledger-check.mjs`

Codex projects also get equivalent instructions in root/folder `AGENTS.md`.

### 6.2 Task Document Shape

Every task doc must contain:

- `Goal`
- `Acceptance`
- `Phases`
- `Decision Matrix`
- `Ambiguity Log`
- `Progress Snapshot`
- `Verification`
- `Cost Telemetry`

Recommended sections also include:

- `Scope`
- `Out of Scope`
- `File Ownership`
- `Risk / Rollback`
- `Handoff`
- `Follow-up`

### 6.3 Numbering

`task-id-allocator.mjs` scans:

- `docs/tasks/index.md`
- `docs/tasks/[0-9]*-*.md`

It picks the next integer. `--task-id=<N>` overrides the automatic ID, but the allocator must reject collisions. v1 does not support forced task-ID collisions.

### 6.4 Ledger Gate

`scripts/agent-task-ledger-check.mjs` validates:

1. `docs/tasks/index.md` exists.
2. `docs/tasks/_template.md` exists.
3. Active task entries in `index.md` point at real task docs.
4. The current task doc has all required sections.
5. In-scope checkboxes are complete before completion/PR.
6. Checkboxes under `Backlog` and `Follow-up` are excluded from the hard gate.

The gate intentionally does not judge semantic quality in v1.

## 7. Handoff

Handoff is generated from two paths.

### 7.1 `/agent-all` Phase Snapshots

Phase 1, 3, 4, and 6 update `Progress Snapshot` with:

- Current phase
- Completed items
- Remaining items
- Open blockers
- Latest validation evidence
- Current commit/branch state
- Next action
- Cost telemetry summary and budget status

Blocked, exhausted, or interrupted runs create or update a handoff section/file using `_handoff-template.md`.

### 7.2 Session Stop Hook

Claude Code Stop/session hooks write a concise handoff when task context is present. The hook must prioritize:

1. Active task
2. Completed items
3. Remaining items
4. Blockers
5. Next command/action

It must not dump raw logs. Long outputs belong in files or context-mode indexed storage, with paths cited.

## 8. Hard Enforcement

### 8.1 Platform Split

Hard enforcement is platform-specific.

Claude Code:

- `.claude/hooks/agent-policy-hook.mjs`
- Registered in `.claude/settings.local.json` via sentinel append-only patch
- Bash `PreToolUse` for dangerous command blocking
- Post-action checks where supported

Codex:

- `.codex/hooks/agent-policy-hook.mjs` or the repo-local hook path Codex expects
- `~/.codex/config.toml` patched only after user approval
- Sentinel append-only global config patch
- Repo-local scripts remain the source of project policy

Gemini:

- Soft prompt/rule enforcement in `GEMINI.md` and/or `.gemini/skills/*`
- No hard hook blocking in v1

### 8.2 Install/Patch Flow

Default `/agent-init` always creates repo-local hook/policy files. It then asks which CLIs should be wired:

- Claude Code
- Codex
- Gemini soft rules

Only selected platforms are patched. Global config changes require explicit user approval.

`/agent-init --lite` skips hook generation and global patching.

### 8.3 Hard-Blocked Commands

The policy hook blocks or requires explicit approval for:

- `git add -A`
- `git commit -a`
- `git commit --amend`
- `git push --force`
- `git reset --hard`
- `git checkout --`
- `docker volume rm`
- Project-configurable destructive commands
- Destructive `--yes` / `--confirm` style invocations where configured

`git commit` must include explicit pathspecs when running in shared-tree operational mode.

Allowed pattern:

```bash
git add path/one path/two
git commit -m "message" -- path/one path/two
git show --stat HEAD
```

### 8.4 Wave Verification

After each wave:

- `git status --short`
- `git show --stat HEAD`
- Confirm commit scope matches owned files
- Confirm unrelated WIP was not swept in
- Detect HOT/shared files for sequential follow-up

## 9. Agent Roster and Orchestration

### 9.1 Core Roles

Heavy `/agent-init` creates role templates for:

- `planner`: task doc, requirements, Decision Matrix, Ambiguity Log
- `orchestrator`: wave ownership, HOT file detection, pathspec verification, retry policy
- `frontend-dev`: frontend implementation
- `backend-dev`: backend implementation
- `integration-dev`: cross-stack wiring, API contract, fixtures/seeds
- `tester`: targeted-to-broad verification
- `reviewer`: spec compliance and code quality
- `qa`: persona and user-flow validation
- `designer`: UI/UX and design-token review
- `doc-writer`: docs, handoff, API/user docs

Small/medium projects can render a reduced roster, but the operational profile should still include orchestrator and reviewer responsibilities.

### 9.2 Reviewer Personas

Verification roles are split into:

- `verification-reviewer`: tests, typecheck, lint, diff scope, evidence
- `qa-reviewer`: user flow, confusion, missing scenarios, persona edge cases
- `design-reviewer`: UI quality, visual hierarchy, design tokens
- `security-reviewer`: authz, secrets, data exposure, destructive actions
- `data-reviewer`: migrations, seed data, fixtures, backfills, mock sync

### 9.3 Gate Sequence

For each completed wave:

0. `orchestrator` when the changed-file classifier returns a coordinator for shared files or broad non-doc changes
1. `tester`
2. `verification-reviewer`
3. `qa-reviewer`
4. `design-reviewer` when UI is touched
5. `security-reviewer` when auth, permissions, serializers, API views, secrets, or destructive commands are touched
6. `data-reviewer` when models, migrations, seeds, fixtures, or backfills are touched
7. `reviewer`
8. `planner` when ambiguity persists

The same finding repeated 3 times escalates to planner/user decision instead of looping indefinitely through implementers.

### 9.4 Changed-File Reviewer Classifier

`changed-file-classifier.mjs` maps changed paths to required reviewers.

Initial rule examples:

| Path / pattern | Additional reviewers |
|---|---|
| `frontend/src/**`, CSS, UI components | `design-reviewer`, `qa-reviewer` |
| Vue/Nuxt app paths such as `src/router/**`, `src/stores/**`, `src/composables/**`, `src/assets/**`, `src/api/**`, `src/plugins/**`, `src/middleware/**`, `src/services/**` | `design-reviewer`, `qa-reviewer` |
| `backend/**/models.py`, migrations | `data-reviewer`, `security-reviewer` |
| Django/DRF app surfaces such as `apps/*/views.py`, `viewsets.py`, `urls.py`, `admin.py` | `security-reviewer` |
| Django app tasks/services such as `apps/*/tasks.py`, `apps/*/celery.py`, `apps/*/services/*.py` | backend signal for `integration-dev` when frontend is also touched |
| seed scripts, fixtures | `data-reviewer` |
| auth, permissions, middleware, serializers, API views | `security-reviewer` |
| package manifests, lockfiles, Docker/compose files, CI workflow config | coordinator `orchestrator` |
| 8 or more non-doc files in one wave | coordinator `orchestrator` |
| tests, CI, build config | `verification-reviewer` |
| both frontend and backend touched | `integration-dev`, `verification-reviewer` |

Classifier behavior is conservative:

- Add reviewers only when rules are confident.
- Add coordinators only when wave ownership, shared files, or retry sequencing need explicit review.
- Ignore documentation/example paths such as `docs/**`, `documentation/**`, and `notes/**`.
- Fall back to generic `reviewer` when uncertain.
- Keep the mapping deterministic and unit tested.

## 10. Superpowers and Context-Mode Integration

### 10.1 Superpowers

Operational profile assumes superpowers are available.

Required or strongly expected skills:

- `superpowers:brainstorming`
- `superpowers:writing-plans`
- `superpowers:subagent-driven-development`
- `superpowers:verification-before-completion`
- `superpowers:systematic-debugging`
- `superpowers:dispatching-parallel-agents`

If missing:

- Do not abort scaffold.
- Print install/update instructions.
- Mark the harness as degraded.
- Role prompts still describe expected behavior.

### 10.2 Context-Mode

Operational profile includes context-mode rules:

- Use context-mode for large output, logs, broad searches, and bulky browser snapshots.
- Keep raw logs out of task docs and handoffs.
- Cite files or indexed artifacts rather than pasting long output.
- After compaction/resume, search memory before asking the user for already-known context.

Claude hook behavior may recommend context-mode for likely-large Bash commands. Codex/Gemini get prompt-level routing rules.

### 10.3 Foundation Updates

`/agent-init` heavy checks foundational plugin state.

Policy:

- Automatic detection: yes
- Recommendation output: yes
- User-approved install/update: yes, through interactive approval, `install-platform.sh` auto mode for Claude/Codex operational installs, or strict `--update-foundations`
- Silent global update or patch: no
- Optional explicit flags: `--update-foundations` for strict update failure, `--no-update-foundations` to opt out of terminal auto mode

`scripts/update.sh` should refresh marketplace/cache and reinstall platform artifacts, but global config changes must remain opt-in. The command must print which foundations will change before changing them.

## 11. Implementation Units

### 11.1 `harness-builder`

Changes:

- Make operational/heavy the default.
- Add `--lite`.
- Extend `CLAUDE.md.hbs`.
- Add folder-level `CLAUDE.md` templates.
- Add task ledger templates.
- Add policy hook templates.
- Add append-only sentinel merge helpers.
- Add `--dry-run` output for file/global patch plan.

### 11.2 `harness-builder-codex`

Changes:

- Extend `AGENTS.md.hbs`.
- Add folder-level `AGENTS.md` templates.
- Strengthen `.codex/skills/*/SKILL.md`.
- Add Codex policy hook template.
- Add Codex config patcher/snippet with sentinel merge.

### 11.3 `harness-builder-gemini`

Changes:

- Add operational discipline to `GEMINI.md`.
- Add task ledger/pathspec/handoff soft rules.
- No hard hook in v1.

### 11.4 `harness-floor`

Changes:

- Phase 1 task-doc creation for free-form prompts.
- Phase 3 orchestrator ownership/HOT-file handling.
- Phase 4 persona gates + changed-file classifier.
- Phase 5/6 task-ledger check + handoff update.

New shared libs:

- `task-ledger.mjs`
- `task-id-allocator.mjs`
- `changed-file-classifier.mjs`
- `pathspec-policy.mjs`
- `handoff-writer.mjs`

### 11.5 Foundation Integration

Changes:

- Detect installed superpowers/context-mode foundations during heavy `/agent-init`.
- Print degraded-mode warnings when required foundations are missing.
- Terminal Claude/Codex operational installs auto-run the approved foundation update/install path when possible, continue with a degraded-mode warning when `claude` is missing or the approved update fails, and allow `--no-update-foundations` opt-out.
- Add `--update-foundations` to make the approved update/install path strict.
- Add `--dry-run` foundation output to show the approved update plan without changing local or global state.
- Route large logs, broad search outputs, and bulky screenshots to context-mode guidance in generated Claude/Codex/Gemini instructions.
- Keep global CLI config patches separate from foundation package updates, with a second explicit approval gate for global config changes.

## 12. Testing Plan

Add or update tests for:

- `CLAUDE.md` snapshots: heavy vs lite
- `AGENTS.md` snapshots: heavy vs lite
- Folder-level guide rendering
- `.claude/agents/*` role template snapshots
- `.codex/skills/*` role template snapshots
- Sentinel append/replace/idempotency
- `--dry-run` no-write behavior
- `--lite` skips ledger and hooks
- Task ID allocation
- Task ledger section validation
- Active task matching
- In-scope checkbox gate excluding Backlog/Follow-up
- Dangerous command policy
- Pathspec commit policy
- Destructive command policy
- Changed-file reviewer classifier
- `/agent-all` scenario: free-form prompt creates task doc
- `/agent-all` scenario: completion gate runs ledger check
- Gemini soft-rule template snapshots

Manual checklist:

- Run `/agent-init` in a clean fixture project.
- Run `/agent-init --lite` in a clean fixture project.
- Re-run `/agent-init` against existing `CLAUDE.md`/`AGENTS.md` and confirm sentinel merge only.
- Confirm global config patch prompt is explicit.
- Confirm declining global patch leaves repo-local artifacts intact.

## 13. Release and Migration

Target version: `v0.6.0` or next minor release.

README updates:

- Default `/agent-init` is now operational/heavy.
- Use `/agent-init --lite` for small projects.
- Explain Claude/Codex hard enforcement vs Gemini soft enforcement.
- Explain task ledger and required task docs.
- Explain global config patch opt-in.
- Add known limitations and recovery steps.

Migration behavior:

- Existing projects get append-only sentinel sections.
- No existing user instructions are rewritten.
- `--dry-run` is recommended before running in mature repos.
- Global config patches are always opt-in.

## 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Default `/agent-init` feels heavy for small repos | Clear `/agent-init --lite` path |
| Sentinel merge corrupts user files | Unit tests, dry-run, replace only sentinel section |
| Hard hook blocks legitimate advanced git usage | Keep hard blocks limited to high-risk commands; require an explicit documented override command in the implementation plan |
| Codex config patch affects unrelated projects | Prompt before patch; sentinel section only; repo-local artifacts remain separable |
| Changed-file classifier over-dispatches reviewers | Conservative mapping; deterministic tests; generic fallback |
| Task ledger gate false positives | Validate structure and active state only; semantic checks deferred |
| Persona roster becomes too large | Small/medium size can render fewer implementer roles, but keep orchestrator/reviewer responsibilities |
| Gemini users expect hard enforcement | Document soft-only limitation |
| Foundational plugin update changes global state | Detect and recommend automatically, update only with explicit approval |

## 15. Implementation Constraints To Verify

These constraints are fixed by the design and should be verified during the implementation plan:

1. Exact Codex hook/config syntax must be verified against current Codex CLI behavior before writing global patch code; until verified, repo-local policy scripts remain authoritative and global patch output stays in dry-run/recommendation mode.
2. Root `AGENTS.md` must reference folder-level `AGENTS.md` files even if Codex auto-discovers them, so local guidance is discoverable in all contexts.
3. Policy hook implementation may share library code, but generated platform entrypoints must stay platform-specific.
4. `/agent-all` writes long task content to files and keeps the conversation to short summaries plus file paths.
5. `/agent-init --lite` is canonical; existing `--theme=lite` remains a compatibility alias with a deprecation note in docs and dry-run output.

## 16. Acceptance Criteria

- `/agent-init` defaults to operational/heavy scaffold.
- `/agent-init --lite` produces a minimal scaffold and skips ledger/hooks.
- Existing root and folder guidance files are updated by sentinel merge, not overwritten.
- Claude Code and Codex hard policy artifacts are generated.
- Global config patch is opt-in and sentinel-based.
- Gemini receives soft operational rules.
- Superpowers/context-mode foundations are detected automatically, updated only with explicit approval, and represented in generated instructions.
- Every `/agent-all "..."` creates or resolves a task doc.
- Task ledger validation gates completion/PR.
- Reviewer personas are scaffolded and selected by a deterministic changed-file classifier.
- Dangerous git/destructive commands are blocked by platform policy tests.
- Documentation explains heavy default, lite mode, platform enforcement levels, and migration behavior.
