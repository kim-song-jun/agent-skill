# Phase 4 — Aggregate + Diff + Report

1. Walk `<slug-dir>/**/<image>.analysis.json` via `shell_command("find ...")`.
   Read each file. Merge into flat issues keyed by
   `{page, breakpoint, component, state}`.

2. If `priorRunDir`: read its `report.json`. Diff per-issue. Bucket as
   `new`, `resolved`, `unchanged` (compare by composite key).

3. Render `<slug-dir>/report.json`, pass it through
   `redactArtifactContent({ artifactPath: "<slug-dir>/report.json", content, config })`,
   append a redaction audit summary when findings exist, and only then write it
   via `apply_patch`, including:
   - `matrix.totalCaptures`
   - `issues`
   - `diff`
   - `perPageStatus`
   - `estCostUSD`
   - `errored`

4. **Comprehensive-mode verdict.** When `state.mode === "comprehensive"`:
   ```javascript
   import { computeVerdict, firstRunVerdict } from "./lib/verdict.mjs";

   const policy = config.comprehensive.verdict;
   let verdict;
   if (!state.priorRunDir) {
     verdict = firstRunVerdict({
       thisRun: { issues: currentIssues },
       firstRun: policy.firstRun,
     });
   } else {
     const baseline = JSON.parse(
       readFileSync(`${state.priorRunDir}/report.json`, "utf-8"),
     );
     verdict = computeVerdict({
       thisRun: { issues: currentIssues },
       baseline: { issues: baseline.issues ?? [] },
       failOn: policy.failOn ?? ["critical", "major"],
     });
   }

   // Pass verdict JSON through the same redaction gate, then write
   // <slug-dir>/verdict.json and set state.verdict.
   ```

5. **DOM-hash cache writeback.** Also in comprehensive mode, when
   `state.domHashCache` exists:
   ```javascript
   import { writeCache } from "./lib/dom-hash.mjs";
   writeCache(state.domHashCachePath, state.domHashCache);
   ```

6. Render `templates/report.md.hbs`. Pass the Markdown through the same
   redaction gate before writing `<slug-dir>/report.md` via `apply_patch`.
   High-severity findings block the write; medium findings are masked.

7. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
   In comprehensive mode, also persist `verdict` and the `verdict.json` path.
