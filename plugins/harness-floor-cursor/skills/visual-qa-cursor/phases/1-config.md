# Phase 1 — Config + Matrix

1. Load `.visual-qa.json`. Validate required fields: `baseUrl`, `pages` or
   `flows`, `breakpoints`, `analysis.model`.
2. Build the capture matrix:
   - For each `page × breakpoint`: one `_page` capture.
   - For each `page.components[] × states[] × breakpoint`: one component capture.
   - For each `flows[].steps[] × breakpoint`: one flow-step capture.
3. Estimate cost: `(matrix.length × analysis.model.imageRate) + flat overhead`.
   Use a static rate table (e.g., $0.003/image for claude-sonnet-4-6).
4. Unless `--yes` or estimate ≤ `--budget`: ask in chat
   `<matrix.length> captures, est. cost $<X>. Proceed? [y/N]`. Abort on N.
5. Push `{phase: 1, completedAt, matrixSize, estCostUSD}` to state.

## Shell helpers

```bash
# Build the matrix + estimate cost in one pipeline.
node -e '
const cfg = require("fs").readFileSync(".visual-qa.json","utf-8");
Promise.all([
  import("./.cursor/visual-qa/lib/matrix-builder.mjs"),
  import("./.cursor/visual-qa/lib/cost-estimator.mjs"),
]).then(([mb, ce]) => {
  const parsed = JSON.parse(cfg);
  const matrix = mb.buildMatrix(parsed);
  const usd = ce.estimateCost(matrix, parsed.analysis?.model ?? "claude-sonnet-4-6");
  console.log(JSON.stringify({ matrixSize: matrix.length, estCostUSD: usd }, null, 2));
});'
```
