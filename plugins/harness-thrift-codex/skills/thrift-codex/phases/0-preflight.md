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
4. Detect Codex CLI version via `shell_command("codex --version")`.
   Required: a version that supports the `[hooks]` block (record the
   detected version in state; spec recommends ≥ the version documented
   in `agent-builder-codex` templates).
5. Read `~/.codex/config.toml` and detect existing `[hooks]` table.
   Record `existingHookCount` + the sentinel lines already present
   (so Phase 2 patcher knows what to skip).
6. If `.thrift.json` missing AND `--force` not passed: tell the user
   Phase 1 will seed it from defaults.
7. Push `{phase: 0, completedAt: "<iso>", contextModeAvailable: <bool>,
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
- Codex version below the `[hooks]`-supporting threshold → warn but
  continue; Phase 2 will surface the actual failure if the patch
  is rejected.
