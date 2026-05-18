# Phase 1 — Config

## Steps

1. If `.thrift.json` missing OR `--force` passed:
   - Render `templates/thrift.config.json.hbs` with ctx:
     `{everyNTurns: 25, everyMTokensOutput: 30000,
       summariserModel: "claude-haiku-4-5-20251001",
       date: "<YYYY-MM-DD>"}`.
   - Write to `.thrift.json`.
   - **Note:** unlike the Claude Code template, no `cachePrimingStrategy`
     context variable is consumed — the `cache` section is omitted entirely.

2. Load `.thrift.json` via `loadConfig()` from `lib/config-loader.mjs`.
   - If `errors`: print each as `<field>: <message>` and abort.

3. Stash derived thresholds for the planner's reference. There is no
   `.thrift-state.json`, but the rule's text includes the configured
   thresholds inline so the planner can apply them without re-reading
   `.thrift.json`.

## Output to user

```
Thrift config (Cursor): turns=<N>, tokens=<M>, summariser=<model>.
(cache prime: omitted — Cursor has no cache surface)
```

## Schema differences from Claude Code

- **`cache` section removed.** Claude Code's `cache.primingStrategy`,
  `cache.warmInterval`, `cache.shareCohortAcross`, `cache.enabled` all
  drop. The `lib/config-loader.mjs` here does not validate any cache
  fields and treats their presence as ignored extra keys.
- All other sections (`summariser`, `contextMode`, `audit`) match the
  Claude Code shape so users can copy `.thrift.json` between workspaces
  with at most a stripping of the unused `cache` block.
