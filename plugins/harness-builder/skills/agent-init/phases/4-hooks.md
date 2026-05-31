# Phase 4 — Hooks

## Steps

1. If `--dry-run` is set, print the planned hook files and settings changes without writing:
   - Hook files: `.claude/hooks/context-mode-router.mjs`, `.claude/hooks/session-summary.mjs`, `.claude/hooks/cache-heal.mjs`, plus `.claude/hooks/agent-policy-hook.mjs` when operational.
   - Settings changes: `.claude/settings.local.json` hook registrations, including the Bash `PreToolUse` policy hook when operational.
   - Smoke-test commands that would run for each hook.
   - Record the phase plan for the Phase 5 summary, then continue without creating directories, copying hooks, smoke-testing generated files, writing settings, or updating `.claude/.agent-init-state.json`.
2. `mkdir -p .claude/hooks`
3. Copy these base hook files verbatim from `templates/hooks/` to `.claude/hooks/`:
   - `context-mode-router.mjs`
   - `session-summary.mjs`
   - `cache-heal.mjs`
4. If `operationalProfile` is true, also copy `agent-policy-hook.mjs`. Lite mode skips policy hook generation.
5. Smoke-test each copied hook by running `node .claude/hooks/<file>.mjs < /dev/null` (or `< NUL` on Windows). Exit code must be 0. Also run `node --check .claude/hooks/agent-policy-hook.mjs` when the policy hook is copied. If any check fails, print the stderr and abort — do not write `settings.local.json`.
6. Read `templates/settings.local.json.hbs` and render with the Phase 1 context, including `operationalProfile` and `liteProfile`.
7. When operational, the rendered settings must include `agent-policy-hook.mjs` in the Bash `PreToolUse` hook list alongside `context-mode-router.mjs`. The policy hook must run from the generated project path: `node "${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-policy-hook.mjs"`. Lite mode must not register the policy hook.
8. If `.claude/settings.local.json` already exists:
   - Parse it.
   - Parse the rendered settings as `additions`.
   - Call `mergeSettings(current, additions)` from `lib/manifest-merge.mjs`.
   - Write the result back.
   Otherwise write the rendered template as-is.
9. Push `{ "phase": 4, "completedAt": "<iso>" }` onto `phases` in `.agent-init-state.json`.

## Output to user

Print: `Hooks installed: context-mode-router, session-summary, cache-heal` plus `, agent-policy-hook` when operational.
