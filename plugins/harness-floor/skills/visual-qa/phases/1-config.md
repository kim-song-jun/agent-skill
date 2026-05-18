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
   Determine mode: `const mode = config.mode ?? "declared";` (default `declared` for back-compat).

2. **Build matrix — branches on mode:**

   - **`mode === "declared"`** (existing behaviour, no change):
     ```javascript
     import { buildMatrix } from "./lib/matrix-builder.mjs";
     const matrix = buildMatrix(config);
     ```

   - **`mode === "comprehensive"`**: discover pages via the crawler, then
     walk each one's DOM to derive components.
     ```javascript
     import { crawl } from "./lib/crawler.mjs";
     import { walkDom } from "./lib/dom-walker.mjs";

     const pages = await crawl({
       scope: config.comprehensive.scope,
       fetchPageLinks: async (path) => {
         // Drive Playwright MCP: navigate, capture <a href> values, return
         // { title, links: [...] }. See "Per-page fetchPageLinks contract"
         // below for the exact contract.
       },
     });

     // Optional cost-saver: git-diff scoping. When enabled (default in
     // comprehensive mode), the page list is filtered to only routes
     // affected by the iteration's git diff. `scope: "none"` short-
     // circuits the whole Phase 1; `scope: "all"` is the no-filter path;
     // `scope: "some"` filters `pages` to the listed paths.
     if (config.comprehensive.cache?.gitDiffScope !== false) {
       const { scopeDiff } = await import("./lib/git-diff-scoper.mjs");
       const changedFiles = await listChangedFilesSinceLastRun(); // helper
       const verdict = scopeDiff({ changedFiles, cwd: "." });
       if (verdict.scope === "none") {
         // No visual-impacting changes — emit an empty matrix and let
         // Phase 5 verdict default to "no-op pass".
         pages.length = 0;
       } else if (verdict.scope === "some") {
         const allowed = new Set(verdict.paths);
         for (let i = pages.length - 1; i >= 0; i--) {
           if (!allowed.has(pages[i].path)) pages.splice(i, 1);
         }
       }
       state.diffScope = verdict.scope;
     }

     const matrix = [];
     for (const page of pages) {
       const snapshot = await capturePageSnapshot(page.path); // see contract below
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

3. Estimate cost (same path for both modes):
   ```javascript
   import { estimateCost } from "./lib/cost-estimator.mjs";
   const estCostUSD = estimateCost(matrix, config.analysis?.model ?? "claude-sonnet-4-6");
   ```

4. If `--budget` is set and `estCostUSD > budget`: abort with `Estimated cost $X exceeds budget $Y. Reduce matrix or raise --budget.`

5. Print:
   ```
   Mode: <declared|comprehensive>.
   Matrix: <matrix.length> captures across <distinct pages> pages, <flows> flows.
   Estimated LLM cost: ~$<estCostUSD>
   ```

6. If `matrix.length > 5000` OR `--yes` not set: ask `Proceed? [Y/n]` and wait. (`--yes` skips except when over 5000. Threshold raised from 500 — cost-unrestricted principle.)

7. Update state:
   - Push `{phase: 1, completedAt}` to `phases`.
   - Set top-level `matrix: {totalCaptures: matrix.length, byPage: {<page>: <count>}}`.
   - Set top-level `mode`.
   - Set top-level `estCostUSD`.

## Per-page `fetchPageLinks` contract

Called once per discovered page. Implementation drives Playwright MCP:

```javascript
async function fetchPageLinks(path) {
  await mcp__plugin_playwright_playwright__browser_navigate({ url: `${baseUrl}${path}` });
  const snapshot = await mcp__plugin_playwright_playwright__browser_snapshot();
  // Extract <a href> values from the snapshot. Filter to same-origin
  // before returning. Title comes from <title> element or the snapshot
  // root.
  return { title: snapshot.title, links: extractAnchorHrefs(snapshot) };
}
```

The crawler is pure; the runtime fetcher is the only side-effecting
layer. Unit tests stub `fetchPageLinks` to verify scope/depth/dedup
behaviour deterministically.

## Per-page snapshot contract (for the DOM walker)

```javascript
async function capturePageSnapshot(path) {
  await mcp__plugin_playwright_playwright__browser_navigate({ url: `${baseUrl}${path}` });
  const raw = await mcp__plugin_playwright_playwright__browser_snapshot();
  // Map the snapshot into the dom-walker's expected shape:
  // { elements: [{ tag, attributes, path, text, visible }, ...] }
  return adaptSnapshotForDomWalker(raw);
}
```

The dom-walker derives selectors preferring `data-testid` > `data-qa-id`
> `id` > stable CSS path. Class-based selectors are never used (unstable
under Tailwind / CSS-in-JS).

## Output to user

Print: `Config OK. Mode: <mode>. Matrix: <N> captures.`
