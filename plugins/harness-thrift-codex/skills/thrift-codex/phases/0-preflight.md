# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo via `shell_command("git rev-parse --git-dir")`.
   If not: warn but continue — thrift works without git.
2. Confirm Codex CLI is installed and `~/.codex/config.toml` exists.
   If `~/.codex/config.toml` is missing: abort with
   `Codex config not found. Run codex once to seed ~/.codex/config.toml,
   then run /thrift again.`
3. Detect context-mode-codex availability. If the user has the matching
   context-mode plugin for Codex, the coerce telemetry hooks have a
   downstream recipient. Otherwise the coerce hooks degrade to pure
   observers. Probe by checking for `context-mode-router` strings or
   `ctx_execute` MCP tool registration in `~/.codex/config.toml`. Warn
   on absence; **do not** abort.
4. Probe actual hook support — two conditions must BOTH be true:
   a. `shell_command("codex --version")` returns a semver **≥ the minimum
      documented in `agent-builder-codex` templates** (currently ≥ 0.139.0).
      Record the detected version in state.
   b. `shell_command("codex --help")` output **contains the literal string
      `--dangerously-bypass-hook-trust`** — this is the authoritative
      runtime signal that the hooks subsystem is compiled in.
   If either condition fails → **HARD-ABORT** (see On error).
   Do NOT use `codex --strict-config` to validate hook event names — it
   round-trips a `[hooks]` block but does not validate event-name strings
   and therefore provides no useful gate signal.
5. Read `~/.codex/config.toml` and detect existing `[hooks]` table.
   Record `existingHookCount` + the sentinel lines already present
   (so Phase 2 patcher knows what to skip).
6. Emit a hook-TRUST advisory to the user:
   > **Important — hook trust:** After Phase 2 appends new hooks to
   > `~/.codex/config.toml`, Codex may treat them as **untrusted** and
   > silently skip them on the next run (no error, no output — they are
   > simply inert). On the first `codex` run after install, watch for a
   > trust prompt and approve the new hooks. If you prefer to bypass the
   > interactive prompt you may pass `--dangerously-bypass-hook-trust` to
   > `codex` yourself — but that is a security boundary and this tool will
   > **not** pass it on your behalf.
7. If `.thrift.json` missing AND `--force` not passed: tell the user
   Phase 1 will seed it from defaults.
8. Push `{phase: 0, completedAt: "<iso>", contextModeAvailable: <bool>,
   codexVersion: "<v>", existingHookCount: <n>}` to `.thrift-state.json`
   via `apply_patch`.

## Output to user

```
Thrift-codex preflight OK.
  codex:       <version>
  context-mode: <available|unavailable>
  config.toml:  ~/.codex/config.toml (existing hooks: <count>)
  .thrift.json: <found|will-seed>
```

## On error

- `~/.codex/config.toml` missing → abort (see step 2).
- `codex` binary not on PATH → abort: `Codex CLI not found on PATH.`
- Hook support gate fails (version below minimum, OR
  `--dangerously-bypass-hook-trust` absent from `codex --help`) →
  **HARD-ABORT**:
  ```
  Codex hook support not detected.
  Required: codex >= 0.139.0 with hooks subsystem enabled
  (probe: `codex --help | grep dangerously-bypass-hook-trust`).
  Upgrade codex and re-run /thrift.
  ```
  Hard-abort is mandatory here because the settings-patcher is
  append-only and can never surface a failure later — if hooks are
  unsupported the appended config stanzas will be silently inert with
  no downstream error.
