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

## MVP scope (this iteration)

- ✅ thrift-core (config-loader, threshold-evaluator, cost-estimator)
- ✅ thrift-audit (Phase 5 audit report)
- ✅ thrift-instrument (hook templates + Phase 2 patcher)
- ✅ thrift-summariser (Phase 3 advisory summary writer)
- ✅ thrift-cache (Phase 4 prime, disabled by default)

## Status

v0.1 — implementation matches the design spec
(`docs/superpowers/specs/2026-05-18-harness-thrift-design.md`) with
the v1-advisory-summariser pathway documented in
`docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`.
Live Claude Code verification deferred (sandbox lacks running CC).

## Future work

- v2 summariser using Claude Code's programmatic compact API once
  surfaced.
- Per-platform ports (`harness-thrift-{codex,copilot,gemini,cursor}`)
  — decomposition spec deferred.
- Token counting accuracy improvements (current: byte-count heuristic).
