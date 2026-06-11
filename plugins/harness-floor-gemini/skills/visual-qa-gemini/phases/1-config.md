# Phase 1 — Config + Matrix

1. Load `.visual-qa.json`. Validate `baseUrl`, `pages`/`flows`, `breakpoints`, `analysis.model`.
2. Build capture matrix (pages × breakpoints × components × states + flow steps).
3. Estimate cost via static rate table.
4. Unless `--yes` or within `--budget`, build an
   `agent-interaction/v1` confirmation and render it with
   `../agent-all-gemini/lib/interactions/renderer-gemini.mjs`. Use
   `kind: "budget_warning"` when cost or capture count is high; use
   `kind: "confirmation"` otherwise. Append the result to
   `.agent-skill/runs/<run-id>/interactions.jsonl` with
   `appendInteractionLog({ source: "visual-qa" })`. `--yes` may skip
   only when `matrix.length <= 5000`; over 5000 captures must use
   `nonTtyPolicy: "pause"` so non-TTY cannot auto-approve the run.
5. Push `{phase: 1, completedAt, matrixSize, estCostUSD}` to state.
6. Write matrix JSON to `/tmp/visual-qa/matrix.json` for subprocess access.
