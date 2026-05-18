# Phase 2 — Instrument (Gemini)

## Inputs

- `~/.gemini/settings.json` (user-scope, NOT per-project)
- This skill's hook templates under `templates/hooks/*.mjs.hbs`

## Steps

1. Determine the install directory for the hook scripts. Convention:
   `<project>/.gemini/hooks/` (matches the harness-builder-gemini
   convention). Create directory if missing.

2. Render each hook template (`templates/hooks/thrift-*.mjs.hbs`) to
   `.gemini/hooks/thrift-*.mjs` and `chmod +x`.

3. Build the standard hooks-to-add object via
   `buildStandardThriftGeminiHooks({hooksDir: ".gemini/hooks"})` from
   `lib/settings-patcher.mjs`. This produces:
   ```json
   {
     "BeforeTool": [
       { "matcher": "run_shell_command", "command": "node .gemini/hooks/thrift-beforetool-bash-telemetry.mjs" },
       { "matcher": "read_file",         "command": "node .gemini/hooks/thrift-beforetool-read-coerce.mjs" }
     ],
     "AfterTool": [
       { "command": "node .gemini/hooks/thrift-aftertool-summariser-trigger.mjs" }
     ],
     "SessionStart": [
       { "command": "node .gemini/hooks/thrift-sessionstart-cache-prime.mjs" }
     ]
   }
   ```

4. Call `patchSettings({settingsPath: "~/.gemini/settings.json",
   hooksToAdd: standardHooks, dryRun: cliDryRun})`.

5. Print summary:
   ```
   Instrument: applied=<N>, skipped=<N> (already registered).
   Hook scripts: .gemini/hooks/thrift-*.mjs
   Affects: ALL Gemini sessions (user-scope hook file)
   ```

6. Push `{phase: 2, completedAt, applied, skipped}` to `.thrift-state.json`.

## Revert (called by `/thrift-gemini uninstall`)

`unpatchSettings({settingsPath, sentinel: /thrift-.*\.mjs/})` removes
any hook entries whose command path matches the sentinel. Safe to call
when nothing's installed. Does NOT delete the hook scripts themselves
(user can do that manually) — only removes the registration.

## On error

- `~/.gemini/settings.json` exists but is unparseable: abort with
  `cannot parse settings.json — refusing to patch`. Tell user to fix
  manually.
- `~/.gemini/hooks/` not writable: abort with the OS error.
- Hook script render fails (template error): abort + leave settings.json
  untouched.

## Notes vs CC

- **User-scope vs project-scope.** Gemini's settings live at
  `~/.gemini/settings.json` (one file across all projects). This patch
  affects every Gemini session, not just this project. Warn the user
  prominently. (Project-scope `.gemini/extensions/<name>/gemini-extension.json`
  is documented but not yet stable enough for v1.)
- **Event name translation.** CC `PreToolUse` → Gemini `BeforeTool`.
  CC `PostToolUse` → Gemini `AfterTool`. CC `SessionEnd` has **no Gemini
  equivalent** — audit fires on next SessionStart or via manual command.
- **Matcher tool names.** CC `Bash` → Gemini `run_shell_command`.
  CC `Read` → Gemini `read_file`. The patcher's `buildStandard…`
  helper encodes these mappings.
