# Phase 4 — Hooks

## Steps

1. `mkdir -p .claude/hooks`
2. Copy these 3 files verbatim from `templates/hooks/` to `.claude/hooks/`:
   - `context-mode-router.mjs`
   - `session-summary.mjs`
   - `cache-heal.mjs`
3. Smoke-test each by running `node .claude/hooks/<file>.mjs < /dev/null` (or `< NUL` on Windows). Exit code must be 0. If any fails, print the stderr and abort — do not write `settings.local.json`.
4. Read `templates/settings.local.json.hbs` and render with `render(tpl, {})` (template has no variables but we still go through the engine for consistency).
5. If `.claude/settings.local.json` already exists:
   - Parse it.
   - Call `mergeSettings(current, additions)` from `lib/manifest-merge.mjs`.
   - Write the result back.
   Otherwise write the rendered template as-is.
6. Push `{ "phase": 4, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`.

## Output to user

Print: `Hooks installed: context-mode-router, session-summary, cache-heal`.
