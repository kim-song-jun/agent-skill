# harness-data

Data analysis harness for Claude Code. It adds a disciplined workflow for
notebooks, SQL validation, dataset artifacts, and batch-style analysis tasks.

## What it does

- Provides a data task shape for dataset/source, snapshot, reproducibility,
  validation queries, artifacts, risks, and cleanup.
- Routes notebook execution through `/agent-all --loop` with
  `verify:notebook-data` evidence.
- Routes SQL validation through `verify:sql-db`, including destructive SQL
  blocking unless `allowDestructive=true` is explicitly approved.
- Routes CSV/JSON/JSONL/Parquet existence and shape checks through artifact
  diff metadata in the same verification evidence file.

## Usage

```sh
/data-runner notebook .agent-skill/tasks/42-analysis.md
/data-runner sql .agent-skill/tasks/42-analysis.md
/data-runner artifact-diff .agent-skill/tasks/42-analysis.md
```

The skill emits `/agent-all` commands such as:

```sh
/agent-all .agent-skill/tasks/42-analysis.md --loop \
  --break-condition='{"type":"verification-adapter","adapter":"notebook-data","config":{"command":"jupyter nbconvert --execute analysis.ipynb","notebooks":["analysis.ipynb"],"requiredArtifacts":["outputs/summary.csv"],"seed":"42","dataSnapshot":"snapshot-2026-06-11"}}'
```

## Evidence

Evidence is written by `agent-all` to
`.agent-skill/runs/<run-id>/verification-evidence.jsonl` with
`verification-evidence/v1` entries for `verify:notebook-data` and
`verify:sql-db`.

## Release surface

- `data-runner`: prompt-level command planner for notebook, SQL, and artifact
  diff verification.
- Runtime helpers live in `harness-floor` `agent-all/lib/data` so installed
  floor bundles and platform ports share the same behavior.
