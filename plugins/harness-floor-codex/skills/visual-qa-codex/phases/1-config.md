# Phase 1 — Config + Matrix

## Inputs

- `.visual-qa.json` at project root
- environment variables referenced as `${env:NAME}`
- CLI flags: `--yes`, `--budget`, `--force`

## Steps

1. Load `.visual-qa.json`. Validate:
   - `baseUrl`
   - `breakpoints`
   - `analysis.model`
   - `pages`/`flows` only when `mode === "declared"`
   - `comprehensive.scope.include` when `mode === "comprehensive"`

   Determine mode:
   ```javascript
   const mode = config.mode ?? "declared";
   ```

2. Build matrix by mode:

   - **`mode === "declared"`**:
     Build the existing declared matrix from `pages × breakpoints × components × states + flow steps`.

   - **`mode === "comprehensive"`**:
     Discover pages and components before building the matrix:
     ```javascript
     import { crawl } from "./lib/crawler.mjs";
     import { walkDom } from "./lib/dom-walker.mjs";

     let pages = await crawl({
       scope: config.comprehensive.scope,
       fetchPageLinks: async (path) => {
         // Use Playwright MCP to navigate and extract same-origin links.
       },
     });

     if (config.comprehensive.cache?.gitDiffScope !== false) {
       const { scopeDiff } = await import("./lib/git-diff-scoper.mjs");
       const verdict = scopeDiff({ changedFiles, cwd: "." });
       if (verdict.scope === "none") pages = [];
       if (verdict.scope === "some") {
         const allowed = new Set(verdict.paths);
         pages = pages.filter((page) => allowed.has(page.path));
       }
       state.diffScope = verdict.scope;
     }

     const matrix = [];
     for (const page of pages) {
       const snapshot = await capturePageSnapshot(page.path);
       const components = walkDom(snapshot);
       for (const bp of config.breakpoints) {
         matrix.push({ kind: "page", page: page.path, breakpoint: bp.name });
         for (const comp of components) {
           matrix.push({
             kind: "component",
             page: page.path,
             breakpoint: bp.name,
             selector: comp.selector,
             componentKind: comp.kind,
             states: ["default", ...comp.states],
           });
         }
       }
     }
     ```

3. Estimate cost using the static visual-qa rate table. If `--budget` is
   set and the estimate is higher, abort with a clear budget error.

4. Unless `--yes` or the estimate is within `--budget`, build an
   `agent-interaction/v1` confirmation and render it with
   `../agent-all-codex/lib/interactions/renderer-codex.mjs`. Use
   `kind: "budget_warning"` when cost or capture count is high; use
   `kind: "confirmation"` otherwise. Append the result to
   `.agent-skill/runs/<run-id>/interactions.jsonl` with
   `appendInteractionLog({ source: "visual-qa" })`. `--yes` may skip
   only when `matrix.length <= 5000`; over 5000 captures must use
   `nonTtyPolicy: "pause"` so non-TTY cannot auto-approve the run.

5. Push `{phase: 1, completedAt, mode, matrixSize, estCostUSD}` to state.
   Also persist the matrix grouped by page so Phase 3 can invoke
   `.codex/skills/visual-qa-page/SKILL.md` sequentially.
