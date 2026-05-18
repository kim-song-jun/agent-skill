# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo (recommended for state file + audit
   reproducibility). If not: warn but continue — thrift works without
   git.
2. Detect context-mode availability: call the `ctx_stats` MCP tool. If
   it errors with `unknown tool` or `not connected`: warn — contextMode
   coercion features will be disabled. Other thrift features still work.
3. Detect existing hook entries in `.claude/settings.local.json` (if
   any). Record them for the append-only patcher in Phase 2.
4. If `.thrift.json` missing AND `--force` not passed: tell the user
   Phase 1 will seed it from defaults.
5. Push `{phase: 0, completedAt: "<iso>", contextModeAvailable: <bool>,
   existingHooks: <count>}` to `.thrift-state.json`.

## Output to user

```
Thrift preflight OK.
  context-mode: <available|unavailable>
  existing hooks: <count>
  config: <found|will-seed>
```
