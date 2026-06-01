# visual-qa-codex - implementation spec

**Date:** 2026-05-18
**Last refreshed:** 2026-06-01 for Codex CLI 0.135.0
**Status:** Implemented as a sequential Codex visual-QA port.

## Summary

`visual-qa-codex` is the Codex CLI port of the visual QA workflow. Codex CLI
0.135.0 exposes a verified positional [PROMPT] interface through
`codex exec [OPTIONS] [PROMPT]`; current command hooks do not provide Claude Code's Task-style
parallel subagent dispatch surface.

The release baseline is therefore prompt-level/sequential page execution. Each
page task is sent to the fixed `.codex/skills/visual-qa-page/SKILL.md` role,
and the coordinator aggregates the resulting captures, analyses, and verdict.

## Current Dispatch Contract

- Preflight defaults to sequential dispatch.
- Requests for an unavailable parallel agent-hook strategy fail early with a
  clear unsupported-current-Codex error.
- `resolvePageSkillPath()` resolves `.codex/skills/visual-qa-page/SKILL.md`.
- `buildPagePrompt()` embeds `PAGE_NAME`, `PAGE_PATH`, `BASE_URL`, and
  `OUTPUT_DIR`.
- The shell command uses `codex exec` with the full page prompt as the
  positional prompt argument.
- Page results end with a JSON line; non-JSON output is preserved as raw output
  for debugging.

## Shipped Files

- `plugins/harness-floor-codex/skills/visual-qa-codex/SKILL.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/phases/0-preflight.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/phases/1-config.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/phases/2-scope.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/phases/3-capture.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/phases/4-aggregate.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/phases/5-summary.md`
- `plugins/harness-floor-codex/skills/visual-qa-codex/lib/config-loader.mjs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/lib/matrix-builder.mjs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/lib/sequential-dispatch.mjs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/lib/codex-agent-dispatch.mjs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/lib/codex-agent-wait.mjs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/templates/visual-qa.config.json.hbs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/templates/mcp-snippet.toml.hbs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/templates/page-prompt.md.hbs`
- `plugins/harness-floor-codex/skills/visual-qa-codex/templates/report.md.hbs`
- `.codex/skills/visual-qa-page/SKILL.md` when installed into a target project

The historical hook-dispatch helper files remain as explicit unsupported
guards so old configs fail predictably instead of silently pretending to run
parallel page work.

## Installer Contract

`scripts/install-platform.sh --platform=codex --target=<repo> --theme=floor`
installs:

- `.visual-qa.json`
- `.agent-all.json`
- `.codex/skills/visual-qa-codex/SKILL.md`
- `.codex/skills/visual-qa-codex/phases/*`
- `.codex/skills/visual-qa-codex/lib/*`
- `.codex/skills/visual-qa-page/SKILL.md`

`scripts/install-platform.sh --platform=codex --target=<repo> --theme=all`
also installs builder and thrift artifacts. The installer writes project-local
files only and prints global config snippets for manual merge.

## Tests

Current automated coverage lives in:

- `tests/lib/visual-qa-codex-dispatch.test.mjs`
- `tests/lib/visual-qa-cross-platform.test.mjs`
- `tests/lib/visual-qa-vendored-libs.test.mjs`
- `tests/lib/release-install-scripts.test.mjs`
- `tests/lib/release-fixture-smoke.test.mjs`
- `tests/lib/release-doc-contract.test.mjs`
- `tests/lib/codex-current-hook-schema.test.mjs`

Key assertions:

- Sequential page command generation uses `codex exec`.
- The page prompt includes stable page env vars and output paths.
- The unsupported legacy hook strategy fails early.
- Installed Codex floor artifacts include runnable visual-QA skill directories.
- The generated visual-QA seed config matches the comprehensive-mode contract.
- Release fixture smoke imports the installed fixture's sequential visual-qa-codex page helper and validates page prompt contracts, positional argv, captures parsing, and analyses parsing.
- Live release smoke probes `codex exec [OPTIONS] [PROMPT]`.

## Automated Runtime Evidence

Automated contracts cover the source sequential dispatcher, generated Codex
visual-QA artifacts, release install renderers, and the live `codex exec
[OPTIONS] [PROMPT]` surface. The release fixture smoke gate also installs into
a fresh Codex operational fixture, imports the installed fixture's sequential
visual-qa-codex page helper, and validates page prompt contracts, positional
argv, captures parsing, and analyses parsing.

## Manual Host UX Observation

Only host UX remains manual:

1. Start Codex CLI in a fresh repo that has passed the automated Codex operational fixture gate.
2. Ensure Playwright MCP is available to the Codex session.
3. Start a small dev server.
4. Run the generated visual-QA workflow from Codex CLI.
5. Confirm sequential page skill prompts complete and produce a report.

Any deterministic failure found during that session should become a contract in
`tests/lib/` before implementation changes land.
