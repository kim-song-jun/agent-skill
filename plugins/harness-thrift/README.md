# harness-thrift

Theme B — cost-conscious long-session optimisation for Claude Code.
Sits between Theme A (`harness-builder`, install-time scaffolding) and
Theme C (`harness-floor`, cost-unrestricted runtime).

## What it does

- **Coerces raw tool output** away from the conversation surface using
  context-mode (when available).
- **Primes the Anthropic prompt cache** every ~4 minutes (just under
  the 5-minute TTL) so the system+tools cohort stays warm during human
  thinking pauses.
- **Auto-summarises long sessions** at configurable thresholds
  (`every N turns` OR `every M output tokens`).
- **Audits each session** at end, comparing actual cost to a naive
  baseline (no thrift).

## Install

Once registered in the marketplace:

```
/plugin install harness-thrift@<marketplace>
```

Then in your project:

```
/thrift                # one-time setup; seeds .thrift.json + patches .claude/settings.local.json
/thrift summarise      # manual summariser trigger
/thrift audit          # ad-hoc audit report (otherwise auto at SessionEnd)
```

## Configuration

`.thrift.json` at project root:

```json
{
  "summariser": {
    "everyNTurns": 25,
    "everyMTokensOutput": 30000,
    "preserveLastTurns": 6
  },
  "cache": {
    "primingStrategy": "tools-only",
    "warmInterval": 240,
    "enabled": false
  },
  "contextMode": {
    "coerceBashWhenOutputExceeds": 20,
    "coerceReadWhenOutputExceeds": 200
  },
  "audit": {
    "outputPath": "docs/thrift/audit-<date>.md"
  }
}
```

## Release surface

- [x] thrift-core (config-loader, threshold-evaluator, cost-estimator)
- [x] thrift-audit (Phase 5 audit report)
- [x] thrift-instrument (hook templates + Phase 2 patcher)
- [x] thrift-summariser (Phase 3 advisory summary writer)
- [x] thrift-cache (Phase 4 prime, disabled by default)

## Runtime validation

v0.1 implements the design spec
(`docs/superpowers/specs/2026-05-18-harness-thrift-design.md`) and
the v1 advisory summariser pathway documented in
`docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`.
Before treating hooks as enforcement on a specific machine, run a small
Claude Code smoke test that exercises `PreToolUse`, `PostToolUse`,
`SessionStart`, and `SessionEnd` hooks after `/thrift` installs them.

## Release caveats

- Programmatic compact is not exposed by Claude Code yet, so summariser
  output remains advisory and suggests manual compact behavior.
- Platform ports live in their own plugins (`harness-thrift-codex`,
  `harness-thrift-copilot`, `harness-thrift-gemini`,
  `harness-thrift-cursor`) and should be installed through the matching
  platform renderer.
- Token counting uses the current byte-count heuristic; cost audit remains
  conservative telemetry rather than billing-grade accounting.
