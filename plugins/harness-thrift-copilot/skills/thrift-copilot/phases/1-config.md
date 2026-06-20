# Phase 1 — Config (Copilot)

## Steps

1. If `.thrift.json` missing OR `--force` passed:
   - Render `templates/thrift.config.json.hbs` with ctx:
     ```javascript
     {
       everyNTurns: 25,
       everyMTokensOutput: 30000,
       summariserModel: "gpt-5-nano",
       cachePrimingStrategy: "intermediated",
       storeMemoryEnabled: false,
       storeMemoryScope: "repository",
       date: "<YYYY-MM-DD>"
     }
     ```
   - Write to `.thrift.json`.

2. Load `.thrift.json` via `loadConfig()` from `lib/config-loader.mjs`.
   - If `errors`: print each as `<field>: <message>` and abort.

3. Compute derived thresholds for the summariser (stashed in state for
   fast hook access):
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
Thrift config:
  turns=<N>, tokens=<M>,
  summariser=<model>,
  cache=<enabled|disabled (intermediated; see notes)>,
  memory_adapter=<enabled|disabled>
```

## Notes

- The default `summariserModel: "gpt-5-nano"` is a fast/cheap OpenAI
  model. Copilot intermediates which model is actually used; the
  config field is a *hint* rather than a binding selector. Document
  this in Phase 3.

  > **TODO: verify gpt-5-nano availability via Copilot's model surface.**
  > Update default if Copilot publishes a documented "cheap summariser"
  > recommendation.
