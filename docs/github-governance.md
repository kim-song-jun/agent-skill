# GitHub Governance

This repository uses public GitHub checks for fast PR feedback and local
release gates for authoritative release evidence. Public CI is intentionally
small: it catches broken docs, templates, manifests, and release smoke wiring
without replacing the local release-candidate workflow.

## Public PR Smoke CI

The public checks are:

- `.github/workflows/smoke.yml`: runs `node scripts/github-governance-check.mjs`
  and `bash scripts/release-smoke.sh --fast`.
- `.github/workflows/docs.yml`: runs `node scripts/docs-structure-check.mjs`
  and `node --test tests/lib/release-doc-contract.test.mjs`.
- `.github/workflows/templates.yml`: runs `node scripts/release-audit.mjs --json`,
  template snapshot smoke, `node scripts/sync-lib.mjs --check`, and
  `node scripts/generate-support-matrix.mjs --check`.

Local release gate remains authoritative. Public PR CI must not be treated as
release approval, and it does not run live Claude/Codex CLI probes, target
project smoke, full eval, or the full `node --test` suite.

## Issue Templates

Use the closest template:

- `.github/ISSUE_TEMPLATE/feature.yml` for new capabilities.
- `.github/ISSUE_TEMPLATE/platform-bug.yml` for platform behavior gaps.
- `.github/ISSUE_TEMPLATE/docs-process.yml` for docs, release, CI, or governance
  process updates.
- `.github/ISSUE_TEMPLATE/quality-debt.yml` for quality debt exceptions with
  owner and expiry.
- `.github/ISSUE_TEMPLATE/verification-adapter.yml` for verifier integrations.

Every implementation issue should include acceptance criteria and verification
evidence that can be checked from files, command output, runtime behavior, or
GitHub state.

## Pull Request Template

`.github/pull_request_template.md` requires linked issue, changed capability,
affected platforms, verification evidence, quality debt exceptions, docs
update, and release impact. PR authors should paste command output summaries
rather than broad claims like "tests pass" with no command.

## Label Taxonomy

Required labels are stored in `.github/labels.yml`:

- `type:feature`
- `type:bug`
- `type:docs`
- `type:process`
- `type:quality`
- `area:platform`
- `area:verification`
- `area:hooks`
- `area:data`
- `area:release`
- `priority:p0`
- `priority:p1`
- `priority:p2`

Use one `type:*` label, one or more `area:*` labels when applicable, and one
`priority:*` label when the work is actively scheduled.

## Release Roles

Public PR CI gives contributors fast feedback. The local release gate still
proves release readiness:

```bash
node scripts/release-audit.mjs
node scripts/release-provenance.mjs --release=<rc-tag> --out-dir=.agent-skill/releases/<rc-tag>
node scripts/release-fixture-smoke.mjs
node scripts/skill-eval.mjs --smoke --no-write --json
./scripts/release-smoke.sh --fast --with-live-cli
node scripts/release-publish-preflight.mjs --base=origin/main
node scripts/target-project-smoke.mjs --target=/path/to/target --platform=claude,codex --lang=ko
node --test
node scripts/sync-lib.mjs --check
node scripts/generate-support-matrix.mjs --check
```

Full utility eval stays manual or release-candidate scoped:

```bash
node scripts/skill-eval.mjs --full
```
