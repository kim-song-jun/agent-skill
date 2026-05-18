# Phase 2 — Instrument

## Inputs

- `.claude/settings.local.json` (project-local, gitignored)
- This skill's hook templates under `templates/hooks/*.mjs.hbs`

## Steps

1. Determine the install directory for the hook scripts. Convention:
   `<project>/.claude/hooks/` (matches existing harness-builder
   convention). Create directory if missing.

2. Render each hook template (`templates/hooks/thrift-*.mjs.hbs`) to
   `.claude/hooks/thrift-*.mjs` and `chmod +x`.

3. Build the standard hooks-to-add object via
   `buildStandardThriftHooks({hooksDir: ".claude/hooks"})` from
   `lib/settings-patcher.mjs`.

4. Call `patchSettings({settingsPath: ".claude/settings.local.json",
   hooksToAdd: standardHooks, dryRun: cliDryRun})`.

5. Print summary:
   ```
   Instrument: applied=<N>, skipped=<N> (already registered).
   Hook scripts: .claude/hooks/thrift-*.mjs
   ```

6. Push `{phase: 2, completedAt, applied, skipped}` to `.thrift-state.json`.

## Revert (called by Phase 5 audit OR manual `/thrift uninstall`)

`unpatchSettings({settingsPath, sentinel: /thrift-.*\.mjs/})` removes
any hook entries whose command path matches the sentinel. Safe to call
when nothing's installed. Does NOT delete the hook scripts themselves
(user can do that manually) — only removes the registration.

## On error

- `.claude/settings.local.json` exists but is unparseable: abort with
  `cannot parse settings.local.json — refusing to patch`. Tell user to
  fix manually.
- `.claude/hooks/` not writable: abort with the OS error.
- Hook script render fails (template error): abort + leave settings.local.json
  untouched.
