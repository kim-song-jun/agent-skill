# Phase 0 — Preflight (Copilot)

## Steps

1. Confirm `pwd` is a git repo (recommended for state file + audit
   reproducibility). If not: warn but continue — thrift works without
   git.
2. Detect Copilot CLI version. Prefer `gh copilot -- --version` when the
   GitHub CLI extension is installed, and otherwise record `unknown`.
   If the CLI is missing: warn, but keep file-backed thrift features enabled.

   > Live check note: the public `gh copilot` wrapper reports "Copilot CLI not
   > installed" unless the extension is present. Do not gate file-backed thrift
   > behavior on a private version cutoff.

3. Detect context-mode-copilot availability: try calling the
   `ctx_stats` MCP tool (or any context-mode MCP tool). If it errors
   with `unknown tool` or `not connected`: warn — contextMode coercion
   features will degrade to telemetry-only.

4. Detect optional memory adapter availability only when
   `storeMemory.enabled === true`. Call
   `storeMemoryRead({key: "thrift/preflight-probe", invoker, scope: "repository"})`.
   On error: set `storeMemoryAvailable = false` and continue. The bridge
   transparently falls back to file mode.

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
  memory adapter: <available|unavailable|disabled>
  existing hooks: <count>
  config: <found|will-seed>
```
