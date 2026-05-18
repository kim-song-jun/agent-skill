# Phase 1 — Config (Gemini)

## Steps

1. If `.thrift.json` missing OR `--force` passed:
   - Render `templates/thrift.config.json.hbs` with ctx:
     ```
     {
       everyNTurns: 25,
       everyMTokensOutput: 30000,
       summariserModel: "gemini-flash",
       cachePrimingStrategy: "tools-only",
       vertexMinTokenThreshold: 32000,
       vertexStorageTimeHours: 1,
       vertexTier: "paid",
       date: "<YYYY-MM-DD>"
     }
     ```
   - Write to `.thrift.json`.

2. Load `.thrift.json` via `loadConfig()` from `lib/config-loader.mjs`.
   - If `errors`: print each as `<field>: <message>` and abort.

3. Compute derived thresholds for the summariser AND Vertex cache
   (stash for fast access in `.thrift-state.json`):
   ```json
   {
     "thresholds": {
       "summariserTokenThreshold": <everyMTokensOutput>,
       "summariserTurnThreshold": <everyNTurns>,
       "vertexCacheMinTokens": <cache.vertex.minTokenThreshold>,
       "vertexCacheStorageHours": <cache.vertex.storageTimeHours>
     }
   }
   ```

4. Push `{phase: 1, completedAt, config: <summary>}` to state.

## Output to user

```
Thrift-gemini config: turns=<N>, tokens=<M>, summariser=<model>, cache=<enabled|disabled>, vertex-tier=<tier>, min-tokens=<K>.
```

## Notes vs CC

- New `cache.vertex` section (minTokenThreshold, storageTimeHours, tier) —
  not present in the CC schema.
- `summariser.model` default is `"gemini-flash"` (not `claude-haiku-4-5`).
  See `lib/cost-estimator.mjs` `SUPPORTED_MODELS` for the full Gemini
  family table.
- The portable fields (everyNTurns, everyMTokensOutput, preserveLastTurns,
  preserveSpecPaths, contextMode, audit.estimateBaseline (now `"naive-gemini"`),
  audit.outputPath) are identical to CC and Codex/Copilot ports.
