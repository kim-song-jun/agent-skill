# Phase 2 — Instrument

## Inputs

- `.claude/settings.local.json` (project-local, gitignored)
- This skill's hook templates under `templates/hooks/*.mjs.hbs`
- This skill's runtime libs under `lib/*.mjs` (the hooks import these)

> **The hooks import their lib modules.** Each rendered hook does
> `import("../../lib/<x>.mjs")` because in the *source* layout the hook
> templates live at `templates/hooks/` and reach up to `skills/thrift/lib/`.
> After install the hooks live at `<project>/.claude/hooks/` and their libs
> must live beside them at `<project>/.claude/hooks/lib/`. So rendering the
> hook is **not enough** — you MUST also (a) rewrite the import paths and
> (b) copy the lib modules next to the hooks. Skipping this makes every hook
> throw `ERR_MODULE_NOT_FOUND` at fire time (silently, for the audit hook),
> so the user believes thrift is active while it does nothing.

## Recommended: run the bundled installer (single source of truth)

The plugin ships `bin/install.mjs`, which performs every step below in one
pass (render hooks **with the import rewrite**, copy the lib tree + the audit
template, then patch `settings.local.json`). Prefer it over the manual walk —
it cannot drift from the working render/rewrite/copy logic:

```
node <harness-thrift-plugin-root>/bin/install.mjs <project-dir> \
  [--ctx <phase1-ctx.json>] [--force] [--dry-run] [--no-instrument]
```

`<harness-thrift-plugin-root>` is this skill's plugin root — the directory two
levels above this `skills/thrift/` skill that contains `bin/install.mjs`.
Pass `--ctx` with the threshold values Phase 1 computed (or omit to use the
defaults already seeded in `.thrift.json`). Use `--dry-run` for `cliDryRun`.
After it prints its summary, skip to step 5 (state push).

## Manual steps (equivalent to the installer — keep in lockstep with `bin/install.mjs`)

1. Determine the install directory for the hook scripts. Convention:
   `<project>/.claude/hooks/` (matches existing harness-builder
   convention). Create directory if missing.

2. Render each hook template (`templates/hooks/thrift-*.mjs.hbs`) to
   `.claude/hooks/thrift-*.mjs` and `chmod +x`. **As you write each rendered
   hook, rewrite its sibling-import paths** (identical to
   `rewriteHookImports` in `bin/install.mjs`):
   - `"../../lib/`  →  `"./lib/`
   - `"../audit-report.md.hbs"`  →  `"./audit-report.md.hbs"`

3. **Copy the lib tree the hooks import** so the rewritten `import("./lib/…")`
   resolves at runtime:
   - copy every `lib/*.mjs` (this skill's `lib/`) → `.claude/hooks/lib/`
   - copy the render helper `bin/lib/render.mjs` → `.claude/hooks/lib/render.mjs`
     (the audit hook imports `./lib/render.mjs`; it is not in `skills/thrift/lib`)
   - copy `templates/audit-report.md.hbs` → `.claude/hooks/audit-report.md.hbs`
     (the audit hook reads `./audit-report.md.hbs` at fire time)

4. Build the standard hooks-to-add object via
   `buildStandardThriftHooks({hooksDir: ".claude/hooks"})` from
   `lib/settings-patcher.mjs`, then call
   `patchSettings({settingsPath: ".claude/settings.local.json",
   hooksToAdd: standardHooks, dryRun: cliDryRun})`.

5. Print summary:
   ```
   Instrument: applied=<N>, skipped=<N> (already registered).
   Hook scripts: .claude/hooks/thrift-*.mjs
   Lib copied:   .claude/hooks/lib/*.mjs
   ```

6. Push `{phase: 2, completedAt, applied, skipped}` to `.thrift-state.json`.

## Verify (do not skip)

After install, fire the audit hook once to confirm the lib imports resolve:
`CLAUDE_PROJECT_DIR=<project> node <project>/.claude/hooks/thrift-sessionend-audit.mjs`
should print `<system-reminder>thrift audit written: …</system-reminder>` to
stderr and create the report. No marker / no report ⇒ the lib copy or import
rewrite was skipped — go back to steps 2–3.

## Revert (called by Phase 5 audit OR manual `/thrift uninstall`)

`unpatchSettings({settingsPath, sentinel: /thrift-.*\.mjs/})` removes
any hook entries whose command path matches the sentinel. Safe to call
when nothing's installed. Does NOT delete the hook scripts themselves
(user can do that manually) — only removes the registration. (The
installer's `--uninstall` flag does the same.)

## On error

- `.claude/settings.local.json` exists but is unparseable: abort with
  `cannot parse settings.local.json — refusing to patch`. Tell user to
  fix manually.
- `.claude/hooks/` not writable: abort with the OS error.
- Hook script render fails (template error): abort + leave settings.local.json
  untouched.
- Lib copy fails (`.claude/hooks/lib/` not writable): abort — do NOT patch
  settings, or you register hooks that cannot import their libs.
