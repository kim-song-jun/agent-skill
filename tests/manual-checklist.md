# Release validation checklist

Run this before each Claude/Codex release candidate. This file is a release
map, not a duplicate unchecked to-do list: anything deterministic belongs in
the automated gate, and only runtime UX observations stay manual.

## Automated release gate

```bash
./scripts/release-smoke.sh --fast --with-live-cli
node --test tests/lib/claude-native-release-contract.test.mjs tests/lib/release-install-scripts.test.mjs tests/lib/release-doc-contract.test.mjs
node --test
node scripts/sync-lib.mjs --check
```

The gate covers:

- Claude native release manifests, hook syntax, `/agent-init` release docs, Phase 3 parallel fan-out contract, final summary contract, and visual-qa seed config.
- Codex install renderers for operational and lite profiles, including `/codex-init --lite` via `install-platform.sh --platform=codex --lite`.
- Codex floor and visual-qa dispatch contracts, including the verified `codex exec` positional `[PROMPT]` interface.
- Sentinel merge, dry-run, force, policy-hook, folder-guide, task-ledger, foundation-status, and lite-profile contracts.

## Claude Code live session

Use a fresh git fixture and observe only the host runtime behavior that unit
tests cannot prove:

```bash
mkdir /tmp/harness-fixture-claude && cd /tmp/harness-fixture-claude && git init
```

Inside Claude Code, run `/agent-init`, then `/agent-init --lite` in a second
fresh fixture. Confirm that the slash command is discoverable, the host accepts
the interactive brainstorming prompts, and both sessions reach their summary
screen without host-runtime errors.

## Codex CLI live session

Use a fresh git fixture and run the generated Codex workflow from the Codex CLI:

```bash
mkdir /tmp/harness-fixture-codex && cd /tmp/harness-fixture-codex && git init
```

Inside Codex CLI, run `/codex-init`, then `/codex-init --lite` in a second
fresh fixture. Confirm that both commands are discoverable, Codex accepts the
interactive prompts, and both sessions reach their summary screen without
host-runtime errors.
