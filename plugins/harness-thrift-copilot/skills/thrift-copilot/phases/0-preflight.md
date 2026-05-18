# Phase 0 — Preflight (Copilot)

## Steps

1. Confirm `pwd` is a git repo (recommended for state file + audit
   reproducibility). If not: warn but continue — thrift works without
   git.
2. Detect Copilot CLI version. Assume `gh copilot --version` (or the
   in-session equivalent) returns something. If the CLI is missing or
   below v0.0.380 (the version that introduced `store_memory` per the
   decomposition spec): warn — `store_memory` mirroring will be disabled
   and Phase 5 falls back to file-only.

   > **TODO: verify Copilot version detection mechanism against live
   > CLI.** The exact `--version` flag and the v0.0.380 cutoff are
   > working assumptions per
   > `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`.

3. Detect context-mode-copilot availability: try calling the
   `ctx_stats` MCP tool (or any context-mode MCP tool). If it errors
   with `unknown tool` or `not connected`: warn — contextMode coercion
   features will degrade to telemetry-only.

4. Detect `store_memory` MCP tool availability. Call
   `storeMemoryRead({key: "thrift/preflight-probe", invoker, scope: "repository"})`.
   On error: set `storeMemoryAvailable = false` and continue. The
   `store-memory-bridge` lib transparently falls back to file mode.

5. Detect existing entries in `.github/hooks/thrift-*.json` (if any).
   Record them for the append-only patcher in Phase 2.

6. If `.thrift.json` missing AND `--force` not passed: tell the user
   Phase 1 will seed it from defaults.

7. Push the following to `.thrift-state.json`:
   ```json
   {
     "phase": 0,
     "completedAt": "<iso>",
     "copilotVersion": "<detected-or-unknown>",
     "contextModeAvailable": <bool>,
     "storeMemoryAvailable": <bool>,
     "existingHooks": <count>
   }
   ```

## Output to user

```
Thrift preflight OK.
  Copilot version: <detected|unknown>
  context-mode-copilot: <available|unavailable>
  store_memory: <available|unavailable>
  existing hooks: <count>
  config: <found|will-seed>
```
