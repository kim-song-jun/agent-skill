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

8. Write `<slug-dir>/report.json` only after passing the redaction gate:
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
   Render the JSON string, call
   `redactArtifactContent({ artifactPath: "<slug-dir>/report.json", content, config })`,
   append any `redaction-audit.jsonl` summary with rule/count/severity/action
   only, and abort the write if the result is blocked. Never store the raw JSON
   when a high-severity secret/privacy candidate is detected.

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
   import { assertRedactionAllowed, redactArtifactContent } from "../agent-all/lib/security/artifact-redactor.mjs";
   const verdictCheck = redactArtifactContent({
     artifactPath: `<slug-dir>/verdict.json`,
     content: JSON.stringify(verdict, null, 2),
     config,
   });
   assertRedactionAllowed(verdictCheck);
   writeFileSync(`<slug-dir>/verdict.json`, verdictCheck.content);
   state.verdict = verdict;
   ```

10. **DOM-hash cache writeback.** Also in comprehensive mode, if
    `state.domHashCache` exists, write it back to
    `.visual-qa-cache/dom-hashes.json`:
    ```javascript
    import { writeCache } from "./lib/dom-hash.mjs";
    writeCache(state.domHashCachePath, state.domHashCache);
    ```

11. Render `templates/report.md.hbs` with the computed context. Pass the
    Markdown through `redactArtifactContent({ artifactPath:
    "<slug-dir>/report.md", content, config })` before writing to
    `<slug-dir>/report.md`; high severity blocks the report write, medium
    severity is masked, and the redaction audit stores only rule/count metadata.
    When `config.report?.mdSideBySide !== false` (default true) AND
    `state.captures` is non-empty, append a per-element 2-column
    `Before / After` table beneath each verdict — with a second row for
    `Baseline / Current` when `capture.hasBaseline === true`.
    If `config.artifact?.exportDocs === true`, explicitly mirror the final
    Markdown report with `mirrorArtifactToDocs({ artifactPath:
    "<slug-dir>/report.md", content: reportMarkdown, config })` from
    `../agent-all/lib/artifact-paths.mjs`; default runs keep the report only
    under `.agent-skill/reports/visual-qa/`.

11b. **Optional `report.html` (default on).** When `config.report?.html !== false`:
    ```javascript
    import { renderHtmlArtifact } from "./lib/report-html.mjs";
    const { html } = renderHtmlArtifact({
      slug: state.slug,
      generatedAt: new Date().toISOString(),
      baseUrl: config.baseUrl,
      captures: state.captures,    // populated by phase 3 with elementId, confidence, hasBaseline, screenshots{before,after,baseline?}
    }, { config, artifactPath: `<slug-dir>/report.html`, writeAudit: true, runId: state.runId || "visual-qa" });
    writeFileSync(`<slug-dir>/report.html`, html);
   ```
    Self-contained: inline CSS + JS, no external assets. Lightbox modal with arrow-key navigation between `before` / `after` / `baseline`.

12. Push `{phase: 4, completedAt}` to `phases` in state.

## Output to user

Print: `Report written: <slug-dir>/report.md`. In comprehensive mode, also:
`Verdict: <pass|fail> — <verdict.reason>.`
