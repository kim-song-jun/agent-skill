# Release validation checklist

Run this before each Claude/Codex release candidate. This file is a release
map, not a duplicate unchecked to-do list: anything deterministic belongs in
the automated gate, and only runtime UX observations stay manual.

## Automated release gate

```bash
node scripts/release-audit.mjs
node scripts/release-fixture-smoke.mjs
./scripts/release-smoke.sh --fast --with-live-cli
node scripts/release-publish-preflight.mjs --base=origin/main
node scripts/target-project-smoke.mjs --target=/path/to/target --platform=claude,codex --lang=ko
node --test tests/lib/agent-init-dry-run-contract.test.mjs tests/lib/claude-native-release-contract.test.mjs tests/lib/doctor-script.test.mjs tests/lib/release-command-surface.test.mjs tests/lib/release-install-scripts.test.mjs tests/lib/release-doc-contract.test.mjs
node --test
node scripts/sync-lib.mjs --check
```

## Local-only deployment path

No `.github/workflows/release.yml` file is shipped in this release branch, so
GitHub CLI `workflow` scope is not required for branch publishing. The release
uses local gate evidence instead:

```bash
node scripts/release-candidate.mjs --date=2026-06-02
node scripts/release-audit.mjs
node scripts/release-fixture-smoke.mjs
./scripts/release-smoke.sh --fast --with-live-cli
node scripts/release-publish-preflight.mjs --base=origin/main
node scripts/target-project-smoke.mjs --target=/Users/sungjun/Documents/molcube/posco/posco-mds --platform=claude,codex --lang=ko
node --test
node scripts/sync-lib.mjs --check
```

The gate covers:

- Local release-gate wiring for clean-SHA evidence, fresh release fixtures,
  live Claude/Codex probes, target-project smoke, full test suite, and
  vendored-lib sync without requiring GitHub workflow scope.
- Target project rollout rehearsal with `scripts/target-project-smoke.mjs`,
  which runs no-write Claude/Codex `install-platform.sh --dry-run` commands
  and operational doctors before a real target refresh.
- Publish preflight with `scripts/release-publish-preflight.mjs`, which checks
  clean branch state, GitHub CLI auth, and `workflow` scope before pushing
  `.github/workflows/*.yml` changes.
- Claude native release manifests, hook syntax, `/agent-init` release docs, Phase 3 parallel fan-out contract, final summary contract, and visual-qa seed config.
- Claude slash-command metadata, headings, flags, and summary contracts for `/agent-init`, `/agent-all`, `/visual-qa`, and `/thrift`.
- Codex slash-command metadata, headings, flags, and summary contracts for `/codex-init`, `/agent-all-codex`, `/visual-qa-codex`, `/thrift-codex`, and `/debug-codex`.
- Codex install renderers for operational, lite, builder, floor, thrift, and debug profiles, including `/codex-init --lite` via `install-platform.sh --platform=codex --lite`, single-theme installs via `--theme=builder|floor|thrift`, and debug-only installs via `--theme=debug`.
- Codex floor and visual-qa dispatch contracts, including the verified `codex exec` positional `[PROMPT]` interface.
- Sentinel merge, dry-run, force, policy-hook, folder-guide, task-ledger, foundation-status, and lite-profile contracts.
- Release readiness audit coverage for Claude/Codex manifests, required files, hook schema, role routing, and audit tokens.
- Release smoke gate coverage for live Claude plugin marketplace/install and Codex exec probes, fresh fixtures, Claude/Codex marketplace dry-runs, focused release contracts, vendored-lib sync, and full-suite mode.
- Public CLI packaging coverage for release/install/update script shebangs and executable bits.
- Fresh release fixture coverage for Claude marketplace dry-run, Claude operational/lite render output, Claude terminal `install-platform.sh --platform=claude` operational/builder/lite installs, Codex operational/lite/builder/floor/thrift/debug installs, and Claude/Codex install→uninstall roundtrips in new git repos.
- Command-surface coverage for Claude/Codex skill metadata, Codex init help/unknown-flag behavior, and documented post-install entrypoints.
- Doctor coverage for project-local Claude/Codex operational, lite, and Codex debug-only scaffolds, missing artifact failures, and foundation warnings.
- `/agent-init` dry-run and Phase 5 post-install doctor ordering before the bootstrap commit.

## User Objective Release Matrix

This matrix is the release-readiness proof surface for the user-requested
Claude + Codex harness. A release candidate is not deployable until every row
is covered by the automated gate above and the short live host probes below.

| Requirement | Authoritative evidence |
| --- | --- |
| Claude + Codex ship together | `node scripts/release-audit.mjs` must pass independent Claude and Codex readiness checks; `scripts/release-fixture-smoke.mjs` must prove both marketplace/render paths and install→uninstall roundtrips. |
| Heavy operational default, lite opt-out | `agent-init-dry-run-contract.test.mjs`, `release-install-scripts.test.mjs`, and release fixtures must prove default operational/heavy installs plus `/agent-init --lite`, `/codex-init --lite`, and `install-platform.sh --platform=codex --lite`. |
| Approved foundation auto-update | Release fixtures and docs contracts must prove default operational installs auto-update only approved `superpowers`/`context-mode` foundations, while lite installs require explicit `--update-foundations`; `scripts/update.sh --foundations-only` remains the manual recovery path. |
| Superpowers/context-mode activation | `release-audit.mjs` must prove root Claude/Codex guidance names the required `superpowers:*` workflows and context-mode/file-backed handling for broad searches, large logs, and bulk context. |
| Persona segmentation | Release fixtures and release-audit contracts must prove operational and builder-heavy Claude agents and Codex skills include orchestrator, frontend-dev, backend-dev, integration-dev, design-reviewer, security-reviewer, data-reviewer, QA, and verification personas with required audit tokens. |
| Orchestration gates | Gate-plan tests, policy validators, installed sequential-dispatch helpers, and release-audit contracts must prove coordinator-first `orchestrator` review, `ORCHESTRATION_AUDIT`, `QA_AUDIT`, `VERIFICATION_AUDIT`, pass criteria, and retry limits. |
| POSCO MDS-style Django/Vue routing | Classifier/gate-plan tests and release fixtures must keep Django/Vue monorepo routing explicit: Vue route/client-state changes route to frontend-dev, Django API/service/persistence changes route to backend-dev, and cross-boundary work routes through integration/security/data/QA/design/verification gates. |
| Codex current-CLI parity | `release-smoke.sh --fast --with-live-cli`, Codex exec probes, command-surface tests, and Codex runtime specs must prove the supported prompt-level/sequential floor instead of unsupported legacy agent hooks. |
| Doctor, recovery, and cleanup | Doctor tests, release fixtures, and install→uninstall roundtrips must prove post-install doctor, actionable recovery commands, conservative cleanup, and `--force-root-clean` behavior for Claude/Codex. |
| No HOME/global config mutation | Release fixtures and docs contracts must prove project renderers do not patch HOME/global CLI config files by default; Codex/Gemini/Copilot global snippets remain manual merge surfaces. |
| Deployable release gate | Before shipping, run `node scripts/release-candidate.mjs --date=2026-06-02`, `node scripts/release-audit.mjs`, `node scripts/release-fixture-smoke.mjs`, `./scripts/release-smoke.sh --fast --with-live-cli`, `node scripts/release-publish-preflight.mjs --base=origin/main`, `node scripts/target-project-smoke.mjs --target=/Users/sungjun/Documents/molcube/posco/posco-mds --platform=claude,codex --lang=ko`, `node --test`, and `node scripts/sync-lib.mjs --check` locally for release, live host, publish, and target-project evidence. |

## Release Candidate Lifecycle

Use this sequence for every Claude/Codex release candidate. The release is not
deployable until the lifecycle evidence points at one verified commit.

1. Start from a clean worktree on the intended release commit. Record
   `git rev-parse HEAD`; do not tag a dirty tree or uncommitted generated
   output.
2. Verify public version and changelog surfaces before tagging: plugin
   manifests, `.claude-plugin/marketplace.json`, README/README.ko Versioning,
   and CHANGELOG.md/CHANGELOG.ko.md must agree, with no stale deferred/mock
   release wording.
3. Run the full deployable gate: `node scripts/release-audit.mjs`,
   `node scripts/release-fixture-smoke.mjs`,
   `./scripts/release-smoke.sh --fast --with-live-cli`,
   `node scripts/release-publish-preflight.mjs --base=origin/main`,
   `node scripts/target-project-smoke.mjs --target=/path/to/target --platform=claude,codex --lang=ko`,
   `node --test`, and `node scripts/sync-lib.mjs --check`.
4. Confirm the local-only deployment gate passed for the same commit. It must
   cover release-candidate evidence, fresh Claude/Codex fixtures, live
   Claude/Codex smoke, the full Node test suite, target-project smoke, and
   vendored-lib sync.
5. Capture the live host probe output from
   `./scripts/release-smoke.sh --fast --with-live-cli`; it must record
   `claude`/`codex` versions, Claude plugin marketplace/install command
   surfaces, and Codex `exec [PROMPT]` support for the same verified SHA.
6. Capture target-project smoke output for each intended rollout project. A
   failing doctor means the target is stale; refresh with the recommended
   `install-platform.sh --force` command, then rerun the target smoke.
7. Run `node scripts/release-publish-preflight.mjs --base=origin/main` before
   pushing. Workflow changes require a GitHub token with `workflow` scope; if
   missing, refresh with `gh auth refresh -h github.com -s workflow`.
8. Create a date-stamped release-candidate tag that points only at the
   verified SHA, then push the branch/tag after gate output is captured in
   release notes.
9. Roll out by refreshing the Claude marketplace and running the documented
   update/install paths: `/plugin marketplace update agent-skill`,
   `scripts/update.sh`, `scripts/update.sh --cli=codex`, or the project-local
   `install-platform.sh` paths. Re-run the post-install doctor for target
   Claude/Codex projects.
10. Roll back only to a previous verified tag/SHA. Restore the marketplace/repo
   pointer to that SHA, force reinstall with the documented update path, or for
   project-local scaffolds run `install-platform.sh --uninstall` and reinstall
   from the previous checkout. Run doctor after rollback; do not hand-edit
   generated files as a rollback.

## Claude Code live session

Use a fresh git fixture and observe only the host runtime behavior that unit
tests cannot prove:

```bash
mkdir /tmp/harness-fixture-claude && cd /tmp/harness-fixture-claude && git init
```

Inside Claude Code, run `/agent-init`, then `/agent-init --lite` in a second
fresh fixture. The automated gate already checks the command metadata; here,
confirm Claude Code accepts both slash-command invocations, accepts the
interactive brainstorming prompts, and reaches the summary screen without
host-runtime errors.

## Codex CLI live session

Use a fresh git fixture and run the generated Codex workflow from the Codex CLI:

```bash
mkdir /tmp/harness-fixture-codex && cd /tmp/harness-fixture-codex && git init
```

Inside Codex CLI, run `/codex-init`, then `/codex-init --lite` in a second
fresh fixture. The automated gate already checks the command metadata; here,
confirm Codex accepts both slash-command invocations, accepts the interactive
prompts, and reaches the summary screen without host-runtime errors.

In an operational Codex fixture, run the documented post-install workflow
entrypoints:

```
run /agent-all for "smoke task"
run /visual-qa for the configured project
run /debug "failing command"
run /thrift
run /thrift summarise
run /thrift audit
```

For visual QA, use a fixture with a reachable local dev server and Playwright
MCP configured. Confirm the host accepts each public prompt-level entrypoint,
starts the expected harness flow, and reaches its summary without host-runtime
errors.
