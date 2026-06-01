# harness-thrift-codex

Theme B (cost-conscious long-session optimisation) ported to Codex CLI.
Sibling of `harness-thrift` (Claude Code source-of-truth). Mirrors the
six-phase pipeline but speaks Codex's TOML-hook config format and an
OpenAI-rate cost table.

## What changes vs the CC version

| Surface | Claude Code | Codex |
|---|---|---|
| Hook config file | `.claude/settings.local.json` (JSON) | `~/.codex/config.toml` (TOML, user-global) |
| Hook event names | `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd` | `PreToolUse`, `PostToolUse`, `SessionStart`, `Stop` |
| Write primitive | `Edit` / `Write` | `apply_patch` |
| Shell primitive | `Bash` | `Bash` |
| Notification surface | `Notification` hook | stderr from a `PostToolUse` hook + writes to `~/.codex/notifications/thrift-<ts>.md` |
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
/thrift-codex                 # one-time setup: seeds .thrift.json + emits Codex TOML snippets
/thrift-codex summarise       # manual summariser trigger
/thrift-codex audit           # ad-hoc audit report (otherwise auto on Codex Stop)
```

For non-interactive release installs, `scripts/install-platform.sh --platform=codex --theme=all`
runs thrift with `--no-instrument`: it writes `.thrift.json` and `.codex/hooks/*.toml`
inside the target project, but does not create or patch `~/.codex/config.toml`.
Patch a Codex config only after explicit approval, either by passing `--config <path>`
to the installer or by re-running thrift without `--no-instrument` after Codex has
seeded the global config file.

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

## Release surface

- [x] thrift-core (config-loader, cost-estimator with OpenAI rates)
- [x] thrift-instrument (hook TOML templates + minimal TOML patcher)
- [x] phase docs (all six)
- [x] install.mjs (renders `.thrift.json` + writes Codex hook TOML snippets)
- [x] release-safe `--no-instrument` install path for fresh Codex environments

## Status

v0.1 — phase docs, TOML patcher, OpenAI rate table, and project-local
install artifacts. Runtime hook firing should still be smoke-tested in
the local Codex CLI before treating command hooks as enforcement.

## Known limitations

1. **Summariser model TBD.** Codex's available model roster is fluid;
   the default `gpt-5-nano` is a placeholder. Override via
   `summariser.model` in `.thrift.json`.
2. **Cache-prime is a heuristic on Codex.** OpenAI cache hit rate
   is not surfaced in Codex's `exec_command` response metadata in v1,
   so Phase 4 `savedRatio` becomes an estimate, not a measurement.
3. **TOML patcher is minimal.** It appends complete hook entries and
   removes them via sentinel comment lines. It does
   **not** handle nested TOML structures, multiline strings, or
   inline-table style. See `lib/settings-patcher.mjs` for assumptions.

## References

- `skills/thrift-codex/SKILL.md` — entry point
- `skills/thrift-codex/references/porting-notes.md` — Codex-specific gotchas
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — porting decomposition spec
