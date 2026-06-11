# Policy Hook Engine Schema

Date: 2026-06-11

## Scope

`agent-all` policy decisions use one Node.js engine under
`plugins/harness-floor/skills/agent-all/lib/policy/`. Claude floor hooks call
the canonical engine directly. Generated Claude/Codex project hooks are copied
standalone into target repos, so they embed a small compatible adapter that
emits the same schema and audit log format.

## Event Schema

Schema version: `agent-policy-event/v1`

Required fields:

- `event`: one of `BeforeLoopIteration`, `AfterBreakCondition`,
  `BeforeAgentSpawn`, `AfterAgentReturn`, `BeforeToolUse`, `BeforeCommit`,
  `BeforeVerification`, `AfterVerification`, `BeforeHandoff`,
  `BeforePRCreate`, `NonTTYDecision`.
- `platform`: one of `claude`, `codex`, `cursor`, `copilot`, `gemini`,
  `vscode-copilot`, `unknown`.
- `runId`: stable run identifier. Defaults to `default`.

Optional fields:

- `taskId`, `displayId`, `iteration`, `phase`, `toolName`.
- `changedFiles`: array of repo paths.
- `costUSD`: accumulated cost at the decision point.
- `breakCondition`: normalized break-condition spec.
- `agent`: `{ role, reason, budgetImpactUSD, id }`.
- `payload`: event-specific structured data.

Loop runners must emit `BeforeLoopIteration` before running the break
condition and `AfterBreakCondition` after collecting its result.
Verification adapters emit `BeforeVerification` before adapter execution and
`AfterVerification` with normalized evidence before evidence is persisted.

## Result Schema

Schema version: `agent-policy-result/v1`

Fields:

- `policyId`: stable policy identifier.
- `action`: one of `allow`, `warn`, `rewrite_prompt`, `ask_user`,
  `requires_justification`, `deny`, `stop_loop`, `escalate`.
- `severity`: one of `info`, `warning`, `error`, `critical`.
- `reason`: human-readable reason.
- `patch`: optional structured patch suggestion.
- `nextAction`: optional recovery instruction.
- `details`: optional structured details.

`deny`, `stop_loop`, `ask_user`, and `requires_justification` are blocking.
`warn`, `rewrite_prompt`, and `escalate` are non-blocking unless the host
platform elects to enforce them.

## Default Policies

The canonical engine enforces:

- Loop runaway prevention through max iteration checks and missing
  break-condition warnings in unlimited mode.
- Repeated failure signature detection.
- Max cost exceeded.
- Hard-blocked command.
- Commit without explicit pathspec after `--`.
- Missing implementer `verification_passed` evidence when `STATUS: DONE`.
- Missing reviewer audit tokens:
  `VERIFICATION_AUDIT`, `QA_AUDIT`, `ORCHESTRATION_AUDIT`.
- Dynamic agent spawn validation for role, reason, budget impact, wave cap,
  and same-role repeat cap.
- Non-TTY auto decision logging.
- Secret/privacy redaction for control-plane artifacts before handoff/session
  prompts, verification evidence, visual/debug reports, logs, or PR bodies are
  stored or shared. High-severity findings deny by default; medium findings are
  masked.

Project policy merges from `.agent-all.json` `policy` and
`.agent-skill/policy.json`. `.agent-skill/policy.json` wins on conflicts.

## Audit Log

Policy evaluation appends one JSON object per line to:

`.agent-skill/runs/<run-id>/policy-log.jsonl`

Each entry contains timestamp, event metadata, final action/severity, policy
results, and payload key names. It intentionally records payload keys rather
than raw payload bodies to avoid dumping command output or agent reports into
the audit trail. Redaction audit entries are written separately as
`.agent-skill/runs/<run-id>/redaction-audit.jsonl` and contain only
rule/count/severity/action metadata, never the original secret candidate.

## Platform Behavior

- Claude floor hook: hard enforcement for Task dispatch/return policy and
  canonical JSONL audit logging.
- Generated Claude project hook: hard enforcement for Bash policy and Task
  audit-token policy through an embedded compatible adapter.
- Generated Codex project hook: hard enforcement for shell command policy
  through an embedded compatible adapter. Codex Task-governance tokens remain
  absent because Codex does not expose the Claude Task subagent surface.
- Cursor, Copilot, Gemini, VS Code Copilot: surface the same result schema as
  soft warnings/logs unless an explicitly reviewed platform hook is installed.
