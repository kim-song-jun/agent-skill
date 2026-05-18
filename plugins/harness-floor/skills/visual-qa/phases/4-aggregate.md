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

9. **Comprehensive-mode verdict.** When `state.mode === "comprehensive"`:
   ```javascript
   import { computeVerdict, firstRunVerdict } from "./lib/verdict.mjs";
   const policy = config.comprehensive.verdict;

   let verdict;
   if (!state.priorRunPath) {
     verdict = firstRunVerdict({ thisRun: { issues: currentIssues }, firstRun: policy.firstRun });
   } else {
     const baseline = JSON.parse(readFileSync(`${state.priorRunPath}/report.json`, "utf-8"));
     verdict = computeVerdict({
       thisRun:  { issues: currentIssues },
       baseline: { issues: baseline.issues ?? [] },
       failOn:   policy.failOn ?? ["critical", "major"],
     });
   }
   writeFileSync(`<slug-dir>/verdict.json`, JSON.stringify(verdict, null, 2));
   state.verdict = verdict;
   ```

10. **DOM-hash cache writeback.** Also in comprehensive mode, if
    `state.domHashCache` exists, write it back to
    `.visual-qa-cache/dom-hashes.json`:
    ```javascript
    import { writeCache } from "./lib/dom-hash.mjs";
    writeCache(state.domHashCachePath, state.domHashCache);
    ```

11. Render `templates/report.md.hbs` with the computed context. Write to `<slug-dir>/report.md`.

12. Push `{phase: 4, completedAt}` to `phases` in state.

## Output to user

Print: `Report written: <slug-dir>/report.md`. In comprehensive mode, also:
`Verdict: <pass|fail> — <verdict.reason>.`
