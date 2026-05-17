# Phase 1 — Config + Matrix

## Inputs

- `.visual-qa.json` at project root
- environment variables (for `${env:...}` substitution)
- CLI flags: `--yes`, `--force`, `--budget`

## Steps

1. Load config:
   ```javascript
   import { loadConfig } from "./lib/config-loader.mjs";
   const result = loadConfig(".visual-qa.json", process.env);
   if (!result.ok) { /* print result.errors as 'field: message', abort */ }
   const config = result.config;
   ```

2. Build matrix:
   ```javascript
   import { buildMatrix } from "./lib/matrix-builder.mjs";
   const matrix = buildMatrix(config);
   ```

3. Estimate cost:
   ```javascript
   import { estimateCost } from "./lib/cost-estimator.mjs";
   const estCostUSD = estimateCost(matrix, config.analysis?.model ?? "claude-sonnet-4-6");
   ```

4. If `--budget` is set and `estCostUSD > budget`: abort with `Estimated cost $X exceeds budget $Y. Reduce matrix or raise --budget.`

5. Print:
   ```
   Matrix: <matrix.length> captures across <distinct pages> pages, <flows> flows.
   Estimated LLM cost: ~$<estCostUSD>
   ```

6. If `matrix.length > 5000` OR `--yes` not set: ask `Proceed? [Y/n]` and wait. (`--yes` skips except when over 5000. Threshold raised from 500 — cost-unrestricted principle.)

7. Update state:
   - Push `{phase: 1, completedAt}` to `phases`.
   - Set top-level `matrix: {totalCaptures: matrix.length, byPage: {<page>: <count>}}`.
   - Set top-level `estCostUSD`.

## Output to user

Print: `Config OK. Matrix: <N> captures.`
