# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a Cursor workspace (presence of `.cursor/` or
   `cursor-workspace.json`). If absent: warn that the rule write target
   `.cursor/rules/` will be created from scratch.
2. Confirm `pwd` is a git repo (recommended for recap reproducibility).
   If not: warn but continue.
3. Detect context-mode-cursor availability by checking
   `.cursor/mcp.json` for a `context-mode` MCP entry. If missing: warn
   that the rule's coerce suggestions ("prefer `ctx_execute` for large
   outputs") will be advisory without a recipient.
4. If `.thrift.json` missing AND `--force` not passed: tell the user
   Phase 1 will seed it from defaults.

## Output to user

```
Thrift preflight OK (Cursor port).
  workspace:        <found|absent>
  context-mode:     <available|unavailable>
  config:           <found|will-seed>
```

## Notes vs Claude Code Phase 0

- No `ctx_stats` MCP probe (cannot call MCP tools from install renderer).
  Detection is filesystem-based via `.cursor/mcp.json`.
- No existing-hooks scan — Cursor has no settings file with a hooks
  array. Rules are file-per-file and `.cursor/rules/thrift.mdc` either
  exists or doesn't.
- No state-file push. There is no `.thrift-state.json` on Cursor.
