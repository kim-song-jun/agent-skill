# Skill Utility Benchmark

This spec defines the first deterministic evaluation harness for issue #22. It
does not call live model APIs. It compares fixture-recorded outcomes so release
and CI smoke gates can measure whether extra harness behavior improves success
rate enough to justify token, cost, and intervention overhead.

## Commands

```bash
node scripts/skill-eval.mjs --smoke
node scripts/skill-eval.mjs --smoke --no-write --json
node scripts/skill-eval.mjs --full --date=2026-06-11
```

Default output is:

```text
.agent-skill/evals/<date>/
  summary.md
  summary.json
  runs.jsonl
  artifacts/fixture-manifest.json
```

`--smoke` is the CI-safe path. It uses representative smoke fixtures and the
`baseline` vs `agent-all` modes only. `--full` expands to visual QA, quality
gate, dynamic orchestration, and verification-adapter modes. Full eval remains a
manual or release-candidate step until live model execution is explicitly wired.

## Fixture Schema

Fixtures live under `tests/fixtures/evals/*.json` and use
`agent-skill-eval-fixture/v1`.

```json
{
  "schemaVersion": "agent-skill-eval-fixture/v1",
  "id": "small-web-ui-task",
  "title": "Small web UI interaction fix",
  "category": "small-web-ui",
  "smoke": true,
  "baselineFailure": "Baseline prompt passes unit checks but misses a visual regression.",
  "acceptanceCriteria": ["Primary interaction test passes"],
  "modes": {
    "baseline": {
      "passed": false,
      "iterations": 2,
      "wallClockMs": 360000,
      "manualInterventions": 1,
      "failedReviewerGates": 0,
      "qualityDebtFindings": 1,
      "rollbackCount": 0,
      "telemetryRecords": [
        {
          "platform": "fixture",
          "model": "baseline-prompt",
          "source": "benchmark",
          "inputTokens": 1800,
          "outputTokens": 900,
          "totalTokens": 2700,
          "costUSD": 0.0044
        }
      ]
    }
  }
}
```

Required modes are `baseline` and `agent-all`. Full fixtures may also include:

- `agent-all+visual-qa`
- `agent-all+quality-gate`
- `agent-all+dynamic-orchestration`
- `agent-all+verification-adapters`

## Metrics

Each run records:

- pass/fail
- iterations
- token estimate
- cost estimate
- wall-clock time
- manual intervention count
- failed reviewer gate count
- quality debt finding count
- rollback count

Cost is summarized through the shared `agent-cost-telemetry/v1` implementation,
so fixture output and live `/agent-all` telemetry use the same metric names:
`totalTokens`, `totalUSD`, `byPlatform`, `byModel`, and `bySource`.

## Report Schema

`summary.json` uses `agent-skill-eval-report/v1` and contains:

- `fixtures`: selected fixture metadata and acceptance criteria.
- `runs`: per-fixture, per-mode run records with `costTelemetry.summary`.
- `summary.modeSummary`: pass rate, mean iterations, total cost, cost overhead
  against baseline, manual interventions, failed reviewer gates, quality debt
  findings, and rollback count.

`runs.jsonl` stores the same per-run records one per line for later trend
analysis. The initial runner stores numeric telemetry summaries only; it does
not persist prompt text, transcripts, or model output.

## Acceptance Coverage

- Minimum fixtures: `small-web-ui-task`, `backend-api-task`, and
  `docs-only-task`.
- Baseline and harness modes are compared in smoke mode.
- Pass rate and cost overhead are present in Markdown and JSON reports.
- Full eval and CI-safe smoke eval are distinct CLI modes.
- Reports write under `.agent-skill/evals/`.
- Cost records are summarized with the #21 cost telemetry module.
