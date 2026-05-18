# Phase 2 — Instrument

## Inputs

- `~/.codex/config.toml` (user-global Codex config; TOML, not JSON)
- This skill's hook templates under `templates/hooks/thrift-*.toml.hbs`

## Steps

1. Render each TOML hook template (`templates/hooks/thrift-*.toml.hbs`)
   into one composite snippet via `lib/settings-patcher.mjs`'s helper.
   Each template contributes a `[[hooks.<event>]]` table bracketed
   by sentinel comment lines:

   ```toml
   # thrift: thrift-pretool-bash-telemetry
   [[hooks.pre_tool_use]]
   matcher = "shell_command"
   command = "node \"<HOOKS_DIR>/thrift-pretool-bash-telemetry.mjs\""
   # end thrift: thrift-pretool-bash-telemetry
   ```

2. Determine the install directory for the hook scripts. Convention:
   `<project>/.codex/hooks/` (matches existing `harness-builder-codex`
   convention). Create directory if missing via `shell_command("mkdir -p
   .codex/hooks")`.

3. Render the hook script bodies (the actual `.mjs` files referenced
   by `command = "node ..."` above) into `<project>/.codex/hooks/`.
   The script bodies are the **same** as the CC version since Codex
   hooks pipe JSON payloads on stdin too — the only difference is the
   registration format.

4. Call
   `patchCodexConfig({configPath: "~/.codex/config.toml",
     hooksToAdd: <renderedSnippets>, dryRun: cliDryRun})`
   from `lib/settings-patcher.mjs`.

5. Print summary:
   ```
   Instrument: applied=<N>, skipped=<N> (already present per sentinel).
   Hook scripts: .codex/hooks/thrift-*.mjs
   Config patched: ~/.codex/config.toml
   ```

6. Push `{phase: 2, completedAt, applied, skipped}` to `.thrift-state.json`.

## Revert (called by `/thrift-codex uninstall` or manual cleanup)

`unpatchCodexConfig({configPath, sentinelPrefix: "thrift:"})` removes
any block bracketed by `# thrift: <name>` ... `# end thrift: <name>`
sentinels. Safe to call when nothing's installed. Does NOT delete the
`.mjs` hook scripts themselves (user can `rm -rf .codex/hooks/thrift-*`
manually) — only removes the registration.

## On error

- `~/.codex/config.toml` missing → abort with `run codex once to seed
  ~/.codex/config.toml first`. (The patcher refuses to create
  config.toml from scratch — too risky without knowing user's other
  config keys.)
- `[hooks]` section already contains the same sentinel block:
  skip + report. Re-runs are idempotent.
- Hook script render fails (template error): abort + leave config.toml
  untouched.

## TOML patcher simplification

The patcher is **deliberately minimal**:

- Detects line-prefix `[hooks]` or `[[hooks.<event>]]`. Does NOT
  parse inline-table or multiline-string TOML syntax. Assumes
  hook-related stanzas are at the top level (per Codex docs).
- Append happens at the **end of file** with a leading newline.
  If the file lacks a `[hooks]` section, the snippet's
  `[[hooks.<event>]]` tables stand on their own (TOML is happy).
- Remove finds matching `# thrift: <name>` / `# end thrift: <name>`
  comment lines and deletes the (inclusive) span between them.
- If sentinels are mismatched or missing, the patcher does nothing
  rather than corrupt the file.

See `lib/settings-patcher.mjs` for the exact rules and
`references/porting-notes.md` for why we avoided a full TOML parser.
