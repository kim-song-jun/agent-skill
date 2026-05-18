# harness-thrift-codex

Theme B (cost-conscious long-session optimisation) ported to Codex CLI.
Sibling of `harness-thrift` (Claude Code source-of-truth). Mirrors the
six-phase pipeline but speaks Codex's TOML-hook config format and an
OpenAI-rate cost table.

## What changes vs the CC version

| Surface | Claude Code | Codex |
|---|---|---|
| Hook config file | `.claude/settings.local.json` (JSON) | `~/.codex/config.toml` (TOML, user-global) |
| Hook event names | `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd` | `pre_tool_use`, `post_tool_use`, `session_start`, `session_end` (per Codex `[hooks]` schema) |
| Write primitive | `Edit` / `Write` | `apply_patch` |
| Shell primitive | `Bash` | `shell_command` |
| Notification surface | `Notification` hook | stderr from a `post_tool_use` hook + writes to `~/.codex/notifications/thrift-<ts>.md` |
| Summariser model | `claude-haiku-4-5-20251001` | **TBD: probe current Codex roster.** Tentative `gpt-5-nano` if exposed; otherwise the cheapest currently-listed model |
| Cache-read multiplier | 0.1× input | 0.5× input (OpenAI pricing as of 2026-05; verify quarterly) |
| Cache prime mechanic | Anthropic SDK no-op | Codex `exec_command` session-priming (heuristic; may not be observably effective) |
| Settings patcher | JSON patcher | Minimal TOML patcher — sentinel-line markers in `[hooks]` block |

All six phases (0 preflight → 5 audit) are supported.

## Install

Once registered in the marketplace:

```
codex plugins install harness-thrift-codex
```

Then in your project:

```
/thrift-codex                 # one-time setup: seeds .thrift.json + patches ~/.codex/config.toml
/thrift-codex summarise       # manual summariser trigger
/thrift-codex audit           # ad-hoc audit report (otherwise auto on session_end)
```

## Configuration

`.thrift.json` at project root (same schema as CC):

```json
{
  "summariser": {
    "everyNTurns": 25,
    "everyMTokensOutput": 30000,
    "preserveLastTurns": 6,
    "model": "gpt-5-nano"
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

## MVP scope

- [x] thrift-core (config-loader, cost-estimator with OpenAI rates)
- [x] thrift-instrument (hook TOML templates + minimal TOML patcher)
- [x] phase docs (all six)
- [x] install.mjs (renders `.thrift.json` + writes Codex hook TOML snippet)

## Status

v0.1 — scaffold of phase docs, TOML patcher, OpenAI rate table.
Live Codex CLI verification deferred (sandbox lacks running Codex CLI;
session-cache semantics for OpenAI through Codex are unconfirmed —
see `skills/thrift-codex/references/porting-notes.md`).

## Known limitations

1. **Summariser model TBD.** Codex's available model roster is fluid;
   the default `gpt-5-nano` is a placeholder. Override via
   `summariser.model` in `.thrift.json`.
2. **Cache-prime is a heuristic on Codex.** OpenAI cache hit rate
   is not surfaced in Codex's `exec_command` response metadata in v1,
   so Phase 4 `savedRatio` becomes an estimate, not a measurement.
3. **TOML patcher is minimal.** It detects the `[hooks]` table header,
   appends entries, and removes via sentinel comment lines. It does
   **not** handle nested TOML structures, multiline strings, or
   inline-table style. Assumes one `[hooks]` section per file. See
   `lib/settings-patcher.mjs` for assumptions.

## References

- `skills/thrift-codex/SKILL.md` — entry point
- `skills/thrift-codex/references/porting-notes.md` — Codex-specific gotchas
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — porting decomposition spec
