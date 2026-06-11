# Phase 4 — Aggregate + Diff + Report

1. Walk `<slug-dir>/**/<image>.analysis.json` via `run_shell_command("find ...")`.
   Read each via `read_file`. Merge into `report.json` keyed by
   `{page, breakpoint, component, state}`.
2. If `priorRunDir`: `read_file("<priorRunDir>/report.json")`. Diff per-issue.
   Bucket as `new`, `resolved`, `unchanged`.
3. Render `templates/report.md.hbs`. Pass it through
   `redactArtifactContent({ artifactPath: "<slug-dir>/report.md", content, config })`,
   append a redaction audit summary when findings exist, and write only the
   redacted content to `<slug-dir>/report.md` via `write_file`.
4. Render `<slug-dir>/report.json`, pass it through the same redaction gate,
   and write via `write_file` only if high-severity findings did not block it.
5. Push `{phase: 4, completedAt, issueCount, newCount, resolvedCount}` to state.
