# harness-thrift-copilot

Theme B — cost-conscious long-session optimisation for **GitHub Copilot CLI**.
Per-platform port of `harness-thrift` (Claude Code source-of-truth) per the
decomposition spec
`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`.

Sits between Theme A (`harness-builder-copilot`, install-time scaffolding) and
Theme C (`harness-floor-copilot`, cost-unrestricted runtime).

## What it does (Copilot translation)

- **Coerces raw tool output** away from the conversation surface using
  context-mode-copilot (when available; degrades to telemetry-only).
- **Auto-summarises long sessions** at configurable thresholds
  (`every N turns` OR `every M output tokens`). Summary is mirrored into
  Copilot's native `store_memory` so it survives across sessions.
- **Audits each session** at end, comparing actual cost to a naive
  baseline. Audit state is mirrored into `store_memory` as well.
- **Phase 4 cache prime is disabled by default** — Copilot intermediates
  the underlying OpenAI/GitHub-Models layer, so direct prime calls are
  not observably effective.

## Install

Once registered in the marketplace:

```
/plugin install harness-thrift-copilot@<marketplace>
```

Then, in your project, scaffold the hooks + config:

```
node plugins/harness-thrift-copilot/bin/install.mjs <target>
```

This writes:
- `<target>/.thrift.json` (config seed)
- `<target>/.github/hooks/thrift-*.json` (Copilot-flavoured hook
  registrations — see *Hook format* below)
- `<target>/.github/hooks/scripts/thrift-*.mjs` (the actual hook scripts)
- `<target>/.github/hooks/scripts/lib/*.mjs` (shared lib modules)

## Hook format (Copilot vs Claude Code)

Copilot CLI's hook system uses `.github/hooks/*.json` — one JSON file per
event, each containing a `hooks: [{matcher?, command}]` array. This
differs from Claude Code's single `.claude/settings.local.json` JSON
arrays.

```
.github/hooks/
├── thrift-preToolUse.json       # bash + read telemetry/coercion
├── thrift-postToolUse.json      # summariser-threshold trigger
├── thrift-sessionStart.json     # cache-prime hint (no-op when disabled)
└── thrift-agentStop.json        # audit writer (Copilot's SessionEnd equivalent)
```

Hook files are append-only: existing user hooks in the same file are
preserved; thrift entries are added by sentinel match (`thrift-` command
prefix). `unpatchHooks()` removes only thrift entries.

> **TODO: verify Copilot ask_user / store_memory schemas against live
> CLI.** The hook payload shape, event names (`preToolUse` vs
> `pre_tool_use` vs `PreToolUse`), and matcher matching semantics are
> assumed per `plugins/harness-builder-copilot/skills/copilot-init/templates/hooks/*.json`.
> Verify by running `gh copilot hooks list` (or equivalent) on a live
> Copilot CLI.

## Configuration

`.thrift.json` at project root — same schema as CC's harness-thrift with
a Copilot-flavoured `cache` section (warns about intermediation):

```json
{
  "summariser": {
    "everyNTurns": 25,
    "everyMTokensOutput": 30000,
    "preserveLastTurns": 6,
    "model": "gpt-5-nano"
  },
  "cache": {
    "primingStrategy": "intermediated",
    "warmInterval": 240,
    "enabled": false,
    "intermediationWarning": true
  },
  "storeMemory": {
    "enabled": true,
    "scope": "repository",
    "keyPrefix": "thrift/"
  },
  "contextMode": {
    "coerceBashWhenOutputExceeds": 20,
    "coerceReadWhenOutputExceeds": 200
  },
  "audit": {
    "outputPath": "docs/thrift/audit-<date>.md",
    "mirrorToStoreMemory": true
  }
}
```

## MVP scope (this iteration)

- thrift-copilot-core (config-loader, cost-estimator subclass with
  OpenAI rate table)
- thrift-copilot-instrument (`.github/hooks/*.json` patcher with
  append-only sentinel revert)
- thrift-copilot-store-memory-bridge (file fallback when
  `store_memory` MCP tool isn't reachable)
- All 6 phases (0-preflight … 5-audit) documented; phase 4 documented
  as disabled-by-default

## Status

v0.1 — scaffold matches the decomposition spec. Live Copilot CLI
verification deferred (sandbox lacks Copilot binary + `store_memory`
MCP wiring).

## Cross-plugin isolation

This plugin **does not import** from `harness-thrift` or any other
plugin. The lib modules (config-loader, cost-estimator, settings-patcher,
store-memory-bridge) are independent copies with rate tables and
patcher logic tailored to Copilot. See `references/porting-notes.md`
for the rationale.

## Future work

- Spike `store_memory` payload-size limits + GC behaviour.
- Verify `.github/hooks/*.json` event names against a live Copilot CLI
  ≥v0.0.380.
- If Copilot exposes per-call token counts, swap the heuristic byte→token
  estimator for a real count.
- Wire to `context-mode-copilot` once that port exists.
