# Verification Adapter Interface

Date: 2026-06-11

## Problem

`/agent-all --loop --qa` has a strong completion story for web UI work because
it combines tests with `/visual-qa`. CLI tools, API services, notebooks, SQL,
and batch jobs need the same loop-grade completion evidence without forcing a
screenshot verdict.

## Interface

Adapters implement the shared `verification-adapter/v1` contract:

```ts
type VerificationAdapter = {
  id: string;
  label: string;
  detect(ctx: ProjectContext): Promise<DetectResult>;
  plan(task: TaskDoc, ctx: ProjectContext): Promise<VerificationPlan>;
  run(plan: VerificationPlan, ctx: RunContext): Promise<VerificationEvidence>;
  summarize(result: VerificationEvidence): string;
};
```

The canonical runtime lives in
`plugins/harness-floor/skills/agent-all/lib/verification-adapters/` and is
vendored to platform `agent-all` ports by `scripts/sync-lib.mjs`.

## Break Condition

`lib/break-resolver.mjs` now accepts:

```json
{
  "type": "verification-adapter",
  "adapter": "notebook-data",
  "config": {
    "notebooks": ["analysis.ipynb"],
    "requiredArtifacts": ["outputs/summary.csv"],
    "seed": "42"
  }
}
```

Adapter aliases are normalized to full ids:

- `visual-qa`, `web-ui` -> `verify:web-ui`
- `cli` -> `verify:cli`
- `api`, `api-contract`, `openapi` -> `verify:api-contract`
- `notebook`, `notebook-data`, `data` -> `verify:notebook-data`
- `sql`, `sql-db`, `db` -> `verify:sql-db`
- `batch`, `batch-job` -> `verify:batch-job`

Legacy `{ "type": "visual-qa" }` remains valid and can be wrapped as
`verify:web-ui` through `toVerificationAdapterSpec()`.

## Evidence

Every adapter returns `verification-evidence/v1`:

```ts
type VerificationEvidence = {
  schemaVersion: "verification-evidence/v1";
  adapter: "verify:web-ui" | "verify:cli" | "verify:api-contract" |
    "verify:notebook-data" | "verify:sql-db" | "verify:batch-job";
  status: "passed" | "failed" | "blocked" | "skipped";
  command?: string;
  artifacts?: string[];
  summary: string;
  failures?: Array<{ id: string; message: string; severity: string }>;
  reproducibility?: {
    seed?: string;
    environment?: string;
    dataSnapshot?: string;
  };
};
```

Phase 6 appends evidence to:

```text
.agent-skill/runs/<run-id>/verification-evidence.jsonl
```

Handoffs and task docs should reference this artifact and summarize the latest
entry, not paste raw command output.

## MVP Adapters

- `verify:web-ui`: wraps existing `/visual-qa` results. The legacy `--qa`
  shortcut still expands to `test-auto -> visual-qa comprehensive`, then records
  the web verdict as standard evidence.
- `verify:cli`: runs `config.command`, requires exit code 0, and optionally
  compares stdout to `config.goldenStdoutPath`.
- `verify:api-contract`: runs `config.smokeCommand` when supplied, otherwise
  validates a configured or discovered OpenAPI/Swagger file enough for a smoke
  gate.
- `verify:notebook-data`: verifies configured notebooks and required artifacts,
  with optional execution command, seed, and data snapshot metadata.
- `verify:sql-db`: runs a validation command or statically checks SQL inputs.
  Destructive SQL is blocked unless `allowDestructive: true` is explicit.
- `verify:batch-job`: runs a command with optional required artifact checks.

## Non-Goals

- Removing `/visual-qa`.
- Supporting every database or data platform directly.
- Automatically executing destructive external database queries.
