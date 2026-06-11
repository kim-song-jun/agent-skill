# Phase 4 — Aggregate + Diff + Report

1. Walk `<slug-dir>/**/<image>.analysis.json` via `read_bash("find ...")`
   plus `read_file` per file. Merge into `report.json` keyed by
   `{page, breakpoint, component, state}`.
2. If `priorRunDir`: `read_file("<priorRunDir>/report.json")`. Diff per-issue.
   Bucket each as `new`, `resolved`, `unchanged` (compare by
   `{component, state, breakpoint, severity, descriptionHash}`).
3. Render `templates/report.md.hbs`. Pass it through
   `redactArtifactContent({ artifactPath: "<slug-dir>/report.md", content, config })`,
   append a redaction audit summary when findings exist, and write only the
   redacted content to `<slug-dir>/report.md` via `apply_patch`.
4. Render `<slug-dir>/report.json`, pass it through the same redaction gate,
   and write via `apply_patch` only if high-severity findings did not block it.
5. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
