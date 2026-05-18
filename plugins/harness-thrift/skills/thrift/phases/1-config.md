# Phase 1 — Config

## Steps

1. If `.thrift.json` missing OR `--force` passed:
   - Render `templates/thrift.config.json.hbs` with ctx:
     `{everyNTurns: 25, everyMTokensOutput: 30000, summariserModel: "claude-haiku-4-5-20251001", cachePrimingStrategy: "tools-only", date: "<YYYY-MM-DD>"}`.
   - Write to `.thrift.json`.

2. Load `.thrift.json` via `loadConfig()` from `lib/config-loader.mjs`.
   - If `errors`: print each as `<field>: <message>` and abort.

3. Compute derived thresholds for the summariser (already inline in
   config; stash for fast access in `.thrift-state.json`):
   ```json
   {
     "thresholds": {
       "summariserTokenThreshold": <everyMTokensOutput>,
       "summariserTurnThreshold": <everyNTurns>
     }
   }
   ```

4. Push `{phase: 1, completedAt, config: <summary>}` to state.

## Output to user

```
Thrift config: turns=<N>, tokens=<M>, summariser=<model>, cache=<enabled|disabled>.
```
