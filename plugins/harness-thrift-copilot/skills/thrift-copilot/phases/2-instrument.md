# Phase 2 — Instrument (Copilot)

## Inputs

- `.github/hooks/` directory (Copilot CLI convention; one JSON file per
  event)
- This skill's hook templates under `templates/hooks/*.json.hbs`
- The actual hook scripts under `templates/hooks/scripts/*.mjs.hbs`

## Steps

1. Determine the install directories:
   - Hook registrations: `<project>/.github/hooks/`
   - Hook scripts: `<project>/.github/hooks/scripts/`
   - Shared lib for hook scripts: `<project>/.github/hooks/scripts/lib/`

   Create directories if missing.

2. Render each hook **registration** template
   (`templates/hooks/thrift-*.json.hbs`) to
   `.github/hooks/thrift-<event>.json`. The registration files contain
   `{ "hooks": [{matcher, command}, ...] }` per the Copilot convention
   (mirroring `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/*.json`).

3. Render each hook **script** template
   (`templates/hooks/scripts/thrift-*.mjs.hbs`) to
   `.github/hooks/scripts/thrift-*.mjs` and `chmod +x`.

4. Copy `lib/*.mjs` to `.github/hooks/scripts/lib/` so the hook scripts
   can `import("./lib/<x>.mjs")`. (The same import-rewrite trick as the
   CC version — replace `../../lib/` with `./lib/`.)

5. Build the standard hooks-to-add object via
   `buildStandardThriftHooks({hooksScriptsDir: ".github/hooks/scripts"})`
   from `lib/settings-patcher.mjs`.

6. Call `patchHooks({hooksDir: ".github/hooks", hooksToAdd:
   standardHooks, dryRun: cliDryRun})`. The patcher writes (or merges
   into) one JSON file per event:
   - `.github/hooks/thrift-preToolUse.json`
   - `.github/hooks/thrift-postToolUse.json`
   - `.github/hooks/thrift-sessionStart.json` (no-op when cache prime
     disabled)
   - `.github/hooks/thrift-agentStop.json` (Copilot's `SessionEnd`
     equivalent)

7. Print summary:
   ```
   Instrument: applied=<N>, skipped=<N> (already registered).
   Hook registrations: .github/hooks/thrift-*.json
   Hook scripts:       .github/hooks/scripts/thrift-*.mjs
   ```

8. Push `{phase: 2, completedAt, applied, skipped}` to
   `.thrift-state.json`.

## Revert (called by Phase 5 audit OR manual `/thrift-copilot uninstall`)

`unpatchHooks({hooksDir, sentinel: /thrift-.*\.mjs/})` removes any
hook entries whose `command` matches the sentinel. The whole
`.github/hooks/thrift-*.json` file is deleted if it becomes empty.
Safe to call when nothing's installed.

## On error

- `.github/hooks/thrift-*.json` exists but is unparseable: abort with
  `cannot parse <path> — refusing to patch`. Tell user to fix manually.
- `.github/hooks/scripts/` not writable: abort with the OS error.
- Hook script render fails (template error): abort + leave
  `.github/hooks/` untouched.

## Why one-file-per-event

Copilot's documented convention (per
`plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/`
and the spec) is **one JSON file per event**, not a single
`settings.local.json` with all events nested. The patcher honours this
by routing each event-array of hooksToAdd into its own JSON file
(creating if missing, merging append-only if exists).

> **TODO: verify Copilot's exact event-name casing.** This port uses
> camelCase (`preToolUse`, `postToolUse`, `sessionStart`, `agentStop`)
> per `harness-builder-copilot`'s existing templates. If a live Copilot
> CLI uses different casing (`pre_tool_use`, `PreToolUse`, etc.), the
> filename convention and matcher names must be updated together.
