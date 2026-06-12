# Phase 4 — Aggregate + Diff + Report

1. Read every `<slug-dir>/**/<image>.analysis.json`. Merge into a single
   `report.json` keyed by `{page, breakpoint, component, state}`.
2. If `priorRunDir`: read its `report.json` and diff per-issue. Bucket each
   issue as `new`, `resolved`, or `unchanged` (compare by
   `{component, state, breakpoint, severity, descriptionHash}`).
3. **Comprehensive-mode verdict.** When `state.mode === "comprehensive"`:
   compute `verdict` with `lib/verdict.mjs`, using
   `config.comprehensive.verdict.failOn ?? ["critical", "major"]`, write
   `<slug-dir>/verdict.json` through the same redaction gate, and set
   `state.verdict`. On a first run, use `firstRunVerdict()` with
   `config.comprehensive.verdict.firstRun`.
4. Render `templates/report.md.hbs` with the merged data. Pass the Markdown
   through `redactArtifactContent({ artifactPath: "<slug-dir>/report.md", content, config })`,
   append a redaction audit summary when findings exist, and write only the
   redacted content to `<slug-dir>/report.md`.
5. Render `<slug-dir>/report.json` (structured form, next run's prior), pass it
   through the same redaction gate, and block the write on high-severity
   secret/privacy findings.
6. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
   In comprehensive mode, also persist `verdict` and the `verdict.json` path.

## Shell helpers

```bash
# Diff current issues vs prior run (when priorRunDir is set).
node -e '
import("./.cursor/visual-qa/lib/diff-runs.mjs").then(m => {
  const cur = JSON.parse(require("fs").readFileSync("<slug-dir>/report.json","utf-8"));
  const prior = JSON.parse(require("fs").readFileSync("<priorRunDir>/report.json","utf-8"));
  console.log(JSON.stringify(m.diffRuns(cur.issues, prior), null, 2));
});'
```
