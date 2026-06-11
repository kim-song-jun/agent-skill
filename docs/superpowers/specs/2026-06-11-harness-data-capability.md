# Harness Data Capability

## Problem

Data analysis tasks need evidence that ordinary test runners do not capture:
notebook kernel state, SQL validation results, ETL artifacts, report outputs,
and destructive data operation risk. The harness must make these checks
repeatable without coupling to one notebook, database, or warehouse runtime.

## Capability Family

`harness-data` introduces the data-oriented capability family:

- MVP: `notebook-runner`, `sql-validator`, `artifact-diff`, `data-handoff`
- Reserved: `data-init`, `data-analyze`, `dataset-profiler`,
  `batch-job-runner`

The installable Claude plugin exposes `/data-runner`. Runtime verification
stays in `harness-floor` `agent-all` so `/agent-all --loop` can use the same
adapters across normal floor runs and data-specific tasks.

## Task Template

`.agent-skill/tasks/_template.md` includes a `Data Task Addendum` with:

- Dataset / Source
- Data Snapshot
- Assumptions
- Reproducibility
- Validation Queries
- Artifacts
- Data Risks
- Rollback / Cleanup

These fields are required for data tasks and optional for non-data tasks.

## Verification Adapters

`verify:notebook-data` supports:

- optional clean execution command
- `.ipynb` cell error inspection
- required output artifacts
- deterministic seed and data snapshot metadata
- Node/platform environment summary
- artifact diff metadata

`verify:sql-db` supports:

- SQL file and inline query safety checks
- destructive SQL blocking by default
- optional validation command
- runner JSON stdout parsing
- row-count, schema, null-count, duplicate-count, and outlier-count assertions
- required artifacts and explain plan paths

`artifact-diff` supports:

- required report/artifact existence
- CSV/TSV/JSON/JSONL shape comparison
- Parquet presence/size evidence
- JSON metric thresholds

## Policy Integration

Destructive SQL/data operations are denied by the shared
`agent-policy-event/v1` policy engine unless the adapter payload has
`allowDestructive=true`. The SQL adapter also performs static destructive SQL
detection so platform ports without the full policy engine still block by
default.

## Handoff

`/agent-handoff` scans
`.agent-skill/runs/<run-id>/verification-evidence.jsonl` and includes recent
`verify:notebook-data`, `verify:sql-db`, and `verify:batch-job` evidence in
the handoff body and metadata.

## Non-goals

- Supporting every database or warehouse dialect.
- Owning notebook execution engines directly.
- Proving semantic correctness of the analysis result beyond configured
  validation evidence.
