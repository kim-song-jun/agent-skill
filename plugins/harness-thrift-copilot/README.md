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

From this repo, install the Copilot thrift surface into a project with:

```
./scripts/install-platform.sh --platform=copilot --theme=thrift --target=/path/to/project
```

This writes:
- `<target>/.thrift.json` (config seed)
- `<target>/.github/hooks/thrift-*.json` (Copilot-flavoured hook
  registrations — see *Hook format* below)
- `<target>/.github/hooks/scripts/thrift-*.mjs` (the actual hook scripts)
- `<target>/.github/hooks/scripts/lib/*.mjs` (shared lib modules)

For direct renderer use, run:

```
node plugins/harness-thrift-copilot/bin/install.mjs /path/to/project [--force]
```

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

Runtime validation for Copilot remains prompt-level plus hook-file review:
inspect `.github/hooks/thrift-*.json`, then run the target Copilot CLI command
that lists or previews project hooks for the installed CLI version.

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

## Release surface

- thrift-copilot-core: config-loader and cost-estimator with the OpenAI rate
  table used by GitHub Copilot CLI accounting.
- thrift-copilot-instrument: `.github/hooks/*.json` patcher with
  append-only sentinel revert)
- thrift-copilot-store-memory-bridge: file fallback when `store_memory` MCP
  tooling is unavailable.
- Six thrift phases: preflight, telemetry/coercion, summary pressure,
  memory mirror, disabled-by-default cache prime, and audit.

## Status

The Copilot port ships as a project-local Theme B surface. Hook registration is
file-based under `.github/hooks/`, and phase 4 remains disabled by default
because Copilot intermediates the underlying model layer.

## Cross-plugin isolation

This plugin **does not import** from `harness-thrift` or any other
plugin. The lib modules (config-loader, cost-estimator, settings-patcher,
store-memory-bridge) are independent copies with rate tables and
patcher logic tailored to Copilot. See `references/porting-notes.md`
for the rationale.

## Known limits

- Spike `store_memory` payload-size limits + GC behaviour.
- Confirm `.github/hooks/*.json` event names against the installed Copilot CLI
  version used by the target project.
- If Copilot exposes per-call token counts, swap the heuristic byte→token
  estimator for a real count.
- Wire to `context-mode-copilot` once that port exists.
