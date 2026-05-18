# Phase 1 — Config

## Steps

1. If `.thrift.json` missing OR `--force` passed:
   - Render `templates/thrift.config.json.hbs` with ctx:
     `{everyNTurns: 25, everyMTokensOutput: 30000,
       summariserModel: "gpt-5-nano", cachePrimingStrategy: "tools-only",
       date: "<YYYY-MM-DD>"}`.
   - Write to `.thrift.json` via `apply_patch`.

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
Thrift-codex config: turns=<N>, tokens=<M>, summariser=<model>, cache=<enabled|disabled>.
```

## Notes — summariser model on Codex

The default `gpt-5-nano` is a **TBD placeholder**. Codex's exposed
model roster is fluid and the cheapest-summariser slot needs probing
against the live `codex models list` (or equivalent). Acceptable
overrides via `summariser.model`:

- Any model the user's Codex install lists in its model roster.
- If the chosen model is not in `cost-estimator.mjs`'s rate table,
  Phase 5 audit `actualUSD` / `baselineUSD` for that model will report
  `null` (unknown rate) — telemetry-only mode for that model.
