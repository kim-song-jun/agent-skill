# Phase 2 — Instrument as rule

## Why no settings patcher

Cursor's automation surface is `.cursor/rules/*.mdc` files — there is
no central settings file with a hooks array (unlike Claude Code's
`.claude/settings.local.json`). Phase 2 therefore writes a single
**rule file** instead of patching a shared registry.

## Inputs

- `templates/rules/thrift.mdc.hbs` — the Cursor rule template.
- Context: `{everyNTurns, everyMTokensOutput, summariserModel,
  coerceBashWhenOutputExceeds, coerceReadWhenOutputExceeds, date}`.

## Steps

1. Compute destination: `<target>/.cursor/rules/thrift.mdc`.
2. If file exists AND `--force` not passed: abort with refuse-to-overwrite
   error (same shape as `harness-floor-cursor/bin/init.mjs`).
3. Render `templates/rules/thrift.mdc.hbs` with the resolved context
   (defaults from `.thrift.json` after Phase 1, overridable via
   `--ctx`).
4. Create `.cursor/rules/` if missing.
5. Write the rendered rule.
6. Print:
   ```
   Instrument (as rule): wrote .cursor/rules/thrift.mdc (alwaysApply: true).
   No hook patching — Cursor has no programmatic hook surface.
   ```

## Revert

Delete `.cursor/rules/thrift.mdc` manually. There is no append-only
sentinel because the file is owned entirely by this skill.

## On error

- `.cursor/` not writable: abort with the OS error.
- Template render fails: abort + leave the target untouched.

## Contract differences from Claude Code Phase 2

| Aspect | Claude Code | Cursor |
|---|---|---|
| Targets | `.claude/settings.local.json` + `.claude/hooks/*.mjs` | `.cursor/rules/thrift.mdc` |
| Strategy | append-only patch with sentinel | full-file write (force-replace) |
| Hook scripts | 5 `.mjs` files generated | none — rule text encodes intent |
| Revert | `unpatchSettings({sentinel: /thrift-.*\.mjs/})` | `rm .cursor/rules/thrift.mdc` |
