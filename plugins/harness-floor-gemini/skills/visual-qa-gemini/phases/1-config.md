# Phase 1 — Config + Matrix

1. Load `.visual-qa.json`. Validate `baseUrl`, `pages`/`flows`, `breakpoints`, `analysis.model`.
2. Build capture matrix (pages × breakpoints × components × states + flow steps).
3. Estimate cost via static rate table.
4. Unless `--yes` or `≤ --budget`: `ask_user("<N> captures, est. cost $<X>. Proceed? [y/N]")`.
5. Push `{phase: 1, completedAt, matrixSize, estCostUSD}` to state.
6. Write matrix JSON to `/tmp/visual-qa/matrix.json` for subprocess access.
