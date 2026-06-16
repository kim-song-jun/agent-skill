---
name: data-runner
description: >
  Plan data analysis verification for notebooks, SQL validation, artifact
  diffs, and batch-style artifacts. Use /data-runner before or during
  /agent-all analysis tasks that touch datasets, notebooks, SQL, ETL, reports,
  metrics, CSV/JSON/Parquet outputs, or destructive data operations.
---

# /data-runner

Prepare a data-focused `/agent-all --loop` verification plan. This skill does
not replace `/agent-all`; it selects the correct `verification-adapter` config
and makes the task document data-complete before execution.

## Usage

```sh
/data-runner notebook .agent-skill/tasks/42-analysis.md
/data-runner sql .agent-skill/tasks/42-analysis.md
/data-runner artifact-diff .agent-skill/tasks/42-analysis.md
/data-runner handoff .agent-skill/tasks/42-analysis.md
```

## Capability Family

MVP capabilities:

- `notebook-runner`: clean execution command, cell error detection,
  deterministic seed, data snapshot, output artifacts, environment summary.
- `sql-validator`: read-only validation queries, row/schema/null/duplicate/
  outlier assertions, explain plan artifacts, destructive SQL block.
- `artifact-diff`: CSV/JSON/JSONL/Parquet existence and shape checks, metric
  threshold checks, report existence checks.

Planned family names reserved by the workflow: `data-init`, `data-analyze`,
`dataset-profiler`, `batch-job-runner`, and `data-handoff`.

## Task Document Check

Before generating commands, make sure the task doc contains these data fields,
using `.agent-skill/tasks/_template.md` `Data Task Addendum` if needed.
Note: `.agent-skill/tasks/_template.md` is a runtime-rendered artifact produced by `/agent-init` — it is not present in the repo and must be generated before `/data-runner` can reference it.

- Dataset / Source
- Data Snapshot
- Assumptions
- Reproducibility
- Validation Queries
- Artifacts
- Data Risks
- Rollback / Cleanup

## Adapter Commands

Notebook clean execution:

```sh
/agent-all <task-doc> --loop \
  --break-condition='{"type":"verification-adapter","adapter":"notebook-data","config":{"command":"jupyter nbconvert --execute analysis.ipynb --to notebook --inplace","notebooks":["analysis.ipynb"],"requiredArtifacts":["outputs/summary.csv"],"seed":"42","dataSnapshot":"snapshot-id"}}'
```

SQL validation:

```sh
/agent-all <task-doc> --loop \
  --break-condition='{"type":"verification-adapter","adapter":"sql-db","config":{"files":["queries/validate.sql"],"command":"npm run validate:sql","assertions":[{"id":"row-count","type":"row-count","expected":10}],"requiredArtifacts":["reports/explain.txt"]}}'
```

Artifact diff:

```sh
/agent-all <task-doc> --loop \
  --break-condition='{"type":"verification-adapter","adapter":"notebook-data","config":{"requiredArtifacts":["outputs/summary.csv"],"artifactDiff":{"pairs":[{"baseline":"baseline/summary.csv","current":"outputs/summary.csv"}],"metrics":[{"id":"accuracy","path":"outputs/metrics.json","jsonPath":"accuracy","min":0.95}]}}}'
```

## Destructive Operations

Default behavior blocks SQL/data mutations such as `DELETE`, `DROP`,
`TRUNCATE`, `UPDATE`, `INSERT`, `ALTER`, `MERGE`, `GRANT`, `REVOKE`, and
`VACUUM`. Do not set `allowDestructive=true` unless the user explicitly
approves the exact source, target, backup, rollback, and cleanup path.

## Handoff

For long analysis work, run:

```sh
/agent-handoff <task-doc> --strict
```

The handoff should include recent `verify:notebook-data`, `verify:sql-db`, and
`verify:batch-job` evidence plus artifact paths from
`.agent-skill/runs/<run-id>/verification-evidence.jsonl`.

## When Done

Report the task doc path, adapter used, evidence log path, key artifacts,
validation assertions, and whether destructive operations were blocked or
explicitly approved.
