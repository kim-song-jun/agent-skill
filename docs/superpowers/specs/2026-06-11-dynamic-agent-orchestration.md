# Dynamic Agent Orchestration State

## Goal

`/agent-all` should choose implementers, reviewers, coordinators, and planner
escalations from current state instead of relying only on static task roles.
The state model is shared across Claude and Codex floor workflows:

```json
{
  "runId": "run-id",
  "wave": 0,
  "changedFiles": [],
  "changedDomains": [],
  "requiredAgents": [],
  "spawnedAgents": [],
  "failureSignatures": {},
  "blockedReasons": [],
  "budget": {}
}
```

## Routing Rules

- UI/frontend changes require `frontend-dev`, `design-reviewer`, and
  `qa-reviewer`.
- Migrations, fixtures, seeds, and backfills require `data-reviewer`.
- Auth, API, permission, token, session, secret, and destructive surfaces require
  `security-reviewer`.
- Frontend plus backend/API changes require `integration-dev`.
- Shared HOT files, CI/config, or broad non-doc changes require `orchestrator`.
- Repeated failure signatures at the configured threshold require
  planner/user decision before another implementation pass.

## Logging And Policy

Every dynamic spawn is evaluated as `agent-policy-event/v1` `BeforeAgentSpawn`
when the policy engine is available. Every dynamic spawn also records a JSONL
entry at `.agent-skill/runs/<run-id>/spawn-log.jsonl` with role, reason, wave,
cost estimate, and policy summary. Spawn policy enforces both the per-wave
dynamic-agent cap and a same-role repeat limit using `spawnedAgents` history,
so repeated failures escalate to planner/user decision instead of repeatedly
spawning the same implementer role.

## Non-goals

This does not introduce the built-in `Workflow` tool inside `/agent-all`.
`Workflow` remains a sibling route for evidence-producing sweeps; `/agent-all`
continues to own durable, gated, PR-shipping code changes.
