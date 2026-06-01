# Release validation checklist

Run this before each Claude/Codex release candidate. This file is a release
map, not a duplicate unchecked to-do list: anything deterministic belongs in
the automated gate, and only runtime UX observations stay manual.

## Automated release gate

```bash
node scripts/release-audit.mjs
node scripts/release-fixture-smoke.mjs
./scripts/release-smoke.sh --fast --with-live-cli
node --test tests/lib/agent-init-dry-run-contract.test.mjs tests/lib/claude-native-release-contract.test.mjs tests/lib/doctor-script.test.mjs tests/lib/release-command-surface.test.mjs tests/lib/release-install-scripts.test.mjs tests/lib/release-doc-contract.test.mjs
node --test
node scripts/sync-lib.mjs --check
```

The gate covers:

- Claude native release manifests, hook syntax, `/agent-init` release docs, Phase 3 parallel fan-out contract, final summary contract, and visual-qa seed config.
- Claude slash-command metadata, headings, flags, and summary contracts for `/agent-init`, `/agent-all`, `/visual-qa`, and `/thrift`.
- Codex slash-command metadata, headings, flags, and summary contracts for `/codex-init`, `/agent-all-codex`, `/visual-qa-codex`, and `/thrift-codex`.
- Codex install renderers for operational, lite, builder, floor, thrift, and debug profiles, including `/codex-init --lite` via `install-platform.sh --platform=codex --lite`, single-theme installs via `--theme=builder|floor|thrift`, and debug-only installs via `--theme=debug`.
- Codex floor and visual-qa dispatch contracts, including the verified `codex exec` positional `[PROMPT]` interface.
- Sentinel merge, dry-run, force, policy-hook, folder-guide, task-ledger, foundation-status, and lite-profile contracts.
- Release readiness audit coverage for Claude/Codex manifests, required files, hook schema, role routing, and audit tokens.
- Fresh release fixture coverage for Claude marketplace dry-run, Claude operational/lite render output, Claude terminal `install-platform.sh --platform=claude` operational/lite installs, Codex operational/lite/builder/floor/thrift/debug installs, and Claude/Codex install→uninstall roundtrips in new git repos.
- Command-surface coverage for Claude/Codex skill metadata, Codex init help/unknown-flag behavior, and documented post-install entrypoints.
- Doctor coverage for project-local Claude/Codex operational, lite, and Codex debug-only scaffolds, missing artifact failures, and foundation warnings.
- `/agent-init` dry-run and Phase 5 post-install doctor ordering before the bootstrap commit.

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
