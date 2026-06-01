# CLI runtime verification checklist

**Date:** 2026-05-18
**Last refreshed:** 2026-06-01 for the release-smoke verified Codex surface, Codex agent-all/visual-qa/debug release fixture runtime probes, and Claude/Codex command-surface audit
**Status:** Current release handoff. Deterministic assertions belong in tests; this checklist keeps only host-runtime observations.

## Automated Gate First

Run the automated release gate before any manual runtime session:

```bash
node scripts/release-audit.mjs
node scripts/release-fixture-smoke.mjs
./scripts/release-smoke.sh --fast --with-live-cli
node --test
node scripts/sync-lib.mjs --check
```

The fast smoke gate verifies:

- Claude marketplace dry-run install coverage.
- Codex marketplace dry-run install coverage.
- Claude/Codex release readiness audit for required manifests, files, hooks, role routing, audit tokens, and slash-command metadata.
- Fresh Claude marketplace plus Claude/Codex operational/lite and Codex debug-only git fixtures through the release fixture smoke gate.
- Claude native release contracts.
- Codex install renderers for operational, lite, and debug profiles.
- Codex floor and visual-qa sequential dispatch contracts.
- Release fixture smoke imports the installed fixture's sequential agent-all-codex prompt helper and validates implementer/reviewer prompt contracts plus changedFiles/verification parsing.
- Release fixture smoke imports the installed fixture's sequential visual-qa-codex page helper and validates page prompt contracts, positional argv, captures parsing, and analyses parsing.
- Codex CLI live probe for the positional prompt interface: `codex exec [OPTIONS] [PROMPT]`.
- Vendored lib sync.

If the live CLI probe is unavailable, run `./scripts/release-smoke.sh --fast`
and record the missing local binary separately. Do not move deterministic
checks back into this document.

## Common Runtime Fixture

Each platform runtime check should use:

1. A fresh git repo.
2. A small project with a dev server reachable on `http://localhost:3000` when visual QA is exercised.
3. Playwright MCP available through the platform's MCP config.
4. `gh` CLI auth only when PR creation is being observed.

## Codex CLI Current Surface

Codex CLI is verified against version `0.135.0`.

Current constraints:

- Command hooks cover shell/policy events such as `PreToolUse`.
- Codex command hooks do not expose Claude Code's Task-style parallel subagent surface.
- Floor workflows therefore use prompt-level/sequential skill prompts.
- Sequential execution is driven through the current positional prompt interface: `codex exec [OPTIONS] [PROMPT]`.
- Global Codex config snippets are printed for manual merge; project renderers do not patch global config files.

## Manual Host UX Observation

Only interactive Codex shell UX remains manual:

1. Start Codex CLI in a fresh repo that has passed the automated Codex operational fixture gate.
2. Run `run /agent-all for "smoke task"`.
3. With the fixture dev server and Playwright MCP available, run
   `run /visual-qa for the configured project`.
4. Run `run /thrift`, `run /thrift summarise`, and `run /thrift audit`.
5. Confirm the shell routes through the expected prompt-level workflows and
   reaches each summary without host-runtime errors.

Everything else above is already covered by automated contract tests.

## Other Platform Runtime Checks

The following checks remain host-runtime only because they depend on external
CLI UX, editor panels, or real tool sessions:

| Platform | Runtime observation |
|---|---|
| Cursor | Generated rules and agents appear in Cursor, background agents run where supported. |
| Copilot CLI | Generated instructions and hooks are accepted by the installed `gh copilot` build. |
| Gemini CLI | Generated `GEMINI.md`, skills, subprocess helpers, and MCP snippets are accepted by the installed Gemini CLI. |
| VS Code Copilot | The editor loads `.github/copilot-instructions.md`; CLI-only hooks are ignored by the editor as documented. |

## Runtime Issue Capture

When a live host check fails:

1. Save the exact CLI version.
2. Save the command entered and the shortest useful stderr/stdout excerpt.
3. Add the failure to a new plan under `docs/superpowers/plans/`.
4. Promote any deterministic repro into `tests/lib/` before changing implementation.

This checklist is intentionally short. Release confidence comes from the
automated contracts plus the small set of host-runtime observations above.
