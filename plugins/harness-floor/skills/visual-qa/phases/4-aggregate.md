# Phase 4 — Aggregate + Diff + Report

## Steps

1. Walk `<slug-dir>/` recursively for `*.analysis.json` files. Use `ctx_batch_execute` with shell `find` or Node fs walk.

2. Parse each JSON. Skip entries with `error` field (record them under `errored`).

3. For each valid analysis, expand its `issues[]` into flat records, attaching `page`, `component`, `state`, `bp`, `imagePath` (derived from the JSON file's path).

4. Load prior run if `state.priorRunPath` set:
   ```javascript
   const prior = JSON.parse(readFileSync(`${priorRunPath}/report.json`, "utf-8"));
   ```

5. Diff:
   ```javascript
   import { diffRuns } from "./lib/diff-runs.mjs";
   const diff = diffRuns(currentIssues, prior);
   ```

6. Compute severity counts for the report header (new/resolved/unchanged × critical/major/minor totals).

7. Identify `incompletePages` from `state.perPageStatus`.

8. Write `<slug-dir>/report.json`:
   ```json
   {
     "slug": "...",
     "timestamp": "<iso>",
     "matrix": { "totalCaptures": N },
     "issues": [<currentIssues>],
     "diff": <diff>,
     "perPageStatus": <state.perPageStatus>,
     "estCostUSD": <state.estCostUSD>,
     "errored": [<errored captures>]
   }
   ```

9. Render `templates/report.md.hbs` with the computed context. Write to `<slug-dir>/report.md`.

10. Push `{phase: 4, completedAt}` to `phases` in state.

## Output to user

Print: `Report written: <slug-dir>/report.md`.
