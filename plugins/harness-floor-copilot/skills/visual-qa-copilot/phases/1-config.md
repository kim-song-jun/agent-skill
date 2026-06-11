# Phase 1 — Config + Matrix

1. Load `.visual-qa.json`. Validate required fields: `baseUrl`, `pages` or
   `flows`, `breakpoints`, `analysis.model`.
2. Build the capture matrix:
   - For each `page × breakpoint`: one `_page` capture.
   - For each `page.components[] × states[] × breakpoint`: one component capture.
   - For each `flows[].steps[] × breakpoint`: one flow-step capture.
3. Estimate cost: `(matrix.length × imageRate) + flat overhead`. Use static
   rate table (e.g., $0.003/image for claude-sonnet-4-6).
4. Unless `--yes` or within `--budget`, build an
   `agent-interaction/v1` confirmation and render it with
   `../agent-all-copilot/lib/interactions/renderer-copilot.mjs`. Use
   `kind: "budget_warning"` when cost or capture count is high; use
   `kind: "confirmation"` otherwise. Append the result to
   `.agent-skill/runs/<run-id>/interactions.jsonl` with
   `appendInteractionLog({ source: "visual-qa" })`. `--yes` may skip
   only when `matrix.length <= 5000`; over 5000 captures must use
   `nonTtyPolicy: "pause"` so non-TTY cannot auto-approve the run.
5. Push `{phase: 1, completedAt, matrixSize, estCostUSD}` to state.
6. Persist matrix summary to `store_memory(key="visual-qa/matrix", scope="repository")`.
