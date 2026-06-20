# Advisory Hook Diagnostics Design

## Status

Approved for written spec review. This spec covers the next technical
improvement slice after the `v0.6.13` policy hook error guard release.

## Goal

Remove silent error handling from shipped advisory hooks while preserving their
fail-open runtime contract.

`v0.6.13` hardened policy hooks so malformed hook payloads fail closed. This
work applies the same "no invisible failure" standard to non-policy hooks, but
without changing advisory hooks into blockers.

## Scope

This slice covers Claude/harness-builder advisory hooks that are generated or
shipped as executable runtime assets:

- `plugins/harness-builder/skills/agent-init/templates/hooks/context-mode-router.mjs`
- `plugins/harness-builder/skills/agent-init/templates/hooks/cache-heal.mjs`
- `plugins/harness-builder/skills/agent-init/templates/hooks/session-summary.mjs`
- `plugins/harness-builder/hooks/context-mode-cache-heal.mjs`

The release guard added by this slice covers the same shipped advisory-hook
surface first. Broader hook families can opt in after their host-specific
failure contracts are reviewed.

## Non-Goals

- Changing policy hook behavior. Policy hooks already fail closed when their
  input cannot be trusted.
- Changing public slash command names or host routing.
- Changing generated hook registration paths.
- Changing thrift Gemini, thrift Copilot, Cursor, or VS Code Copilot hooks in
  this slice.
- Adding shared runtime imports to generated hook files.
- Writing hook diagnostics to stdout when stdout is part of a host hook
  contract.

## Runtime Contract

Advisory hooks are allowed to fail open because they optimize context,
summaries, or cache state. They must not block ordinary agent work when an
optional cache, summary, symlink, stdin, or JSON parse operation fails.

They must also not fail silently. Every caught exceptional path must either:

1. be an explicitly expected no-op state, such as empty stdin, or
2. emit a bounded diagnostic to `stderr` and continue.

Diagnostics use a stable prefix so tests and users can distinguish hook
warnings from normal command output:

```text
agent-skill hook warning: <hook-name>: <action>: <message>
```

The message is sanitized:

- first line only
- trimmed
- capped to 200 characters
- falls back to the error class or `unknown error`

## Hook-Specific Behavior

### `context-mode-router.mjs`

- Empty stdin remains a normal no-op payload.
- Malformed non-empty JSON emits a warning and continues with an empty payload.
- stdin read failures emit a warning and continue with an empty payload.
- Existing routing output behavior remains unchanged.

### `cache-heal.mjs`

- Expected absence of optional cache paths remains a no-op.
- Failed unlink, symlink, stat, read, or write operations emit warnings and
  continue.
- Cache healing must never emit diagnostics on stdout.

### `session-summary.mjs`

- Empty stdin remains a normal no-op payload.
- Malformed non-empty JSON emits a warning and continues without summary
  metadata.
- Summary file read/write failures emit warnings and continue.
- Summary output behavior remains unchanged.

### `context-mode-cache-heal.mjs`

- Cache repair remains best-effort.
- Failed filesystem repair operations emit warnings and continue.
- Successful repair output remains unchanged.

## Implementation Shape

Each target hook keeps a tiny local helper instead of importing shared code:

```js
const HOOK_NAME = "context-mode-router";

function formatHookError(error) {
  const raw = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error || "unknown error");
  const firstLine = raw.split(/\r?\n/, 1)[0].trim();
  return (firstLine || "unknown error").slice(0, 200);
}

function warnHook(action, error) {
  console.error(
    `agent-skill hook warning: ${HOOK_NAME}: ${action}: ${formatHookError(error)}`
  );
}
```

The helper is duplicated intentionally because generated hook assets must remain
standalone and portable inside initialized target repositories.

## Tests

Add a focused Node test for advisory hook diagnostics:

- target hook files do not contain empty `catch {}` blocks
- malformed non-empty JSON sent to `context-mode-router.mjs` exits `0`
- malformed non-empty JSON sent to `context-mode-router.mjs` emits the stable
  warning prefix to `stderr`
- malformed non-empty JSON sent to `session-summary.mjs` exits `0`
- malformed non-empty JSON sent to `session-summary.mjs` emits the stable
  warning prefix to `stderr`
- target hook files pass `node --check`

The test should execute real hook files with `node` rather than testing mocks.

## Release Guard

After the target hooks are fixed, add the diagnostic test to the release smoke
focused set so a future release cannot reintroduce empty catches in these
shipped advisory hooks.

The guard is intentionally scoped to the fixed files. A repository-wide shipped
hook debt guard should be designed after thrift Gemini and thrift Copilot hooks
have their own host contracts reviewed.

## Acceptance Criteria

- The target hook files contain no `catch {}` blocks.
- Expected no-op states remain silent.
- Unexpected caught errors emit bounded `stderr` warnings.
- Advisory hooks continue to exit `0` for malformed non-empty JSON where their
  existing contract is fail-open.
- No hook writes diagnostic warnings to stdout.
- New tests fail before the hook changes and pass after implementation.
- `node --test` passes.
- `./scripts/release-smoke.sh --fast --with-live-cli` passes before release.
- The release smoke focused list includes the new advisory diagnostics test.

## Follow-Up Technical Improvements

1. Review thrift Gemini hooks for the same no-silent-catch standard after their
   CLI hook failure contract is documented.
2. Review thrift Copilot templates and phase docs for stale markers and
   incomplete examples.
3. Add a broader shipped-hook debt guard once each supported host has an
   explicit fail-open or fail-closed contract.
4. Improve debt-scan classification so test regex fixtures and intentional
   warning strings are separated from real implementation debt.
