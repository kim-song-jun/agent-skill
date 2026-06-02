# agent-all-codex - implementation spec

**Date:** 2026-05-18
**Last refreshed:** 2026-06-01 for Codex CLI 0.135.0
**Status:** Implemented as a sequential Codex floor port.

## Summary

`agent-all-codex` is the Codex CLI port of the `/agent-all` floor workflow.
The current Codex CLI surface is not Claude Code's Task tool. Codex CLI
0.135.0 exposes a verified positional [PROMPT] interface through
`codex exec [OPTIONS] [PROMPT]`, and the harness uses that interface for
prompt-level/sequential skill execution.

The sequential path is the release baseline. It is slower than parallel Task
dispatch, but it is deterministic, testable, and matches the current Codex
runtime.

## Current Dispatch Contract

- Preflight detects that current Codex command hooks do not expose a Task-style
  subagent dispatch surface.
- `--dispatch=sequential` is the supported strategy.
- Requests for an unavailable parallel agent-hook strategy fail early with a
  clear unsupported-current-Codex error.
- Sequential dispatch resolves `.codex/skills/<role>/SKILL.md`.
- The coordinator builds a prompt that names the role skill path, task id,
  wave index, and JSON task body.
- The shell command uses `codex exec` with the full prompt as the positional
  prompt argument.
- The parser accepts the skill's final JSON line or returns a raw result for
  non-JSON output.

## Shipped Files

- `plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/0-preflight.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/1-intent.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/2-plan.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/3-dispatch.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/4-gate.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/5-pr.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/phases/6-loop.md`
- `plugins/harness-floor-codex/skills/agent-all-codex/lib/dispatch-strategy.mjs`
- `plugins/harness-floor-codex/skills/agent-all-codex/lib/sequential-dispatch.mjs`
- `plugins/harness-floor-codex/skills/agent-all-codex/lib/codex-agent-dispatch.mjs`
- `plugins/harness-floor-codex/skills/agent-all-codex/lib/codex-agent-wait.mjs`
- `plugins/harness-floor-codex/skills/agent-all-codex/templates/agent-all.config.json.hbs`
- `plugins/harness-floor-codex/skills/agent-all-codex/templates/codex-hooks-snippet.toml.hbs`
- `plugins/harness-floor-codex/skills/agent-all-codex/templates/pr-body.md.hbs`
- `plugins/harness-floor-codex/skills/agent-all-codex/references/porting-notes.md`

The historical hook-dispatch helper files remain as explicit unsupported
guards so old configs fail predictably instead of silently pretending to run
parallel work.

## Installer Contract

`scripts/install-platform.sh --platform=codex --target=<repo> --theme=floor`
installs the runnable floor skill directories:

- `.codex/skills/agent-all-codex/SKILL.md`
- `.codex/skills/agent-all-codex/phases/*`
- `.codex/skills/agent-all-codex/lib/*`
- `.agent-all.json`
- shared reviewer/page skills required by the floor workflow

The installer writes project-local files only. It does not patch global Codex
config files.

## Tests

Current automated coverage lives in:

- `tests/lib/agent-all-codex.test.mjs`
- `tests/lib/agent-all-codex-dispatch.test.mjs`
- `tests/lib/release-install-scripts.test.mjs`
- `tests/lib/release-fixture-smoke.test.mjs`
- `tests/lib/release-doc-contract.test.mjs`
- `tests/lib/codex-current-hook-schema.test.mjs`
- `tests/lib/harness-builder-cli-init.test.mjs`

Key assertions:

- Phase 3 documents sequential dispatch.
- Phase 4 uses changed-file classifier persona gates.
- Codex changed-file classification matches the Claude source of truth.
- Current hook snippets do not emit the unsupported legacy agent hook shape.
- Sequential command generation uses `codex exec`.
- Release fixture smoke imports the installed fixture's sequential agent-all-codex prompt helper and validates implementer/reviewer prompt contracts plus changedFiles/verification parsing.
- Live release smoke probes `codex exec [OPTIONS] [PROMPT]`.

## Automated Runtime Evidence

The release fixture smoke gate installs into a fresh Codex operational fixture,
imports the installed fixture's sequential agent-all-codex prompt helper, and
validates the implementer prompt contract, reviewer prompt contract,
`changedFiles` parsing, verification parsing, and no synthetic commit output.

## Manual Host UX Observation

Only host UX remains manual:

1. Start Codex CLI in a fresh repo that has passed the automated Codex operational fixture gate.
2. Run `run /agent-all for "smoke task"`.
3. Confirm the workflow routes through sequential role skill prompts and reaches
   its summary without host-runtime errors.

Any deterministic failure found during that session should become a contract in
`tests/lib/` before implementation changes land.
