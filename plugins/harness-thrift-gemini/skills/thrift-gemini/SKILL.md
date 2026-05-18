---
name: thrift-gemini
description: >
  Gemini CLI port of /thrift — cost-conscious long-session optimisation.
  Patches ~/.gemini/settings.json hooks (BeforeTool/AfterTool/SessionStart)
  with thrift telemetry + Vertex prompt-cache priming (minimum-token gated,
  storage-time aware) + gemini-flash summariser advisory. See
  plugins/harness-thrift/skills/thrift/SKILL.md for source-of-truth.
---

# /thrift (Gemini port)

Bootstraps cost-conscious patterns in the current project for the **Gemini
CLI**. Reads `.thrift.json` (or seeds it), patches
`~/.gemini/settings.json` with `BeforeTool` / `AfterTool` / `SessionStart`
hook arrays, and starts a Vertex cache-prime + AfterTool summariser-trigger
loop.

## Usage

```
/thrift-gemini                         # one-time setup; idempotent
/thrift-gemini summarise               # manual summariser trigger
/thrift-gemini audit                   # write audit report now
/thrift-gemini --force                 # re-seed .thrift.json
```

## Flags

- `--force` — overwrite existing `.thrift.json`.
- `--no-instrument` — skip the settings.json patch (just seed config).
- `--dry-run` — print what would be patched; don't write.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | detect context-mode-gemini + Gemini CLI + BeforeTool surface + Vertex tier |
| 1 | `phases/1-config.md` | seed/load .thrift.json + compute thresholds (incl. Vertex min-token) |
| 2 | `phases/2-instrument.md` | patch ~/.gemini/settings.json (append-only to hook arrays) |
| 3 | `phases/3-summariser.md` | summarise current window via gemini-flash (manual OR auto) |
| 4 | `phases/4-cache-prime.md` | Vertex context caching, ROI-gated by minTokenThreshold + tier |
| 5 | `phases/5-audit.md` | write end-of-session audit (Vertex rates + storage-time cost) |

## Rules

1. **Append-only hook patches.** Never modify or remove existing entries in
   `~/.gemini/settings.json` `hooks.{BeforeTool,AfterTool,SessionStart}`.
   Use `thrift-` command-path sentinel for safe revert.
2. **Cache prime is disabled by default.** Vertex caching has a minimum
   token threshold — sub-threshold prime calls pay full cost and yield no
   cache. Enable explicitly via `.thrift.json` `cache.enabled = true`.
3. **Free-tier guardrail.** On `cache.vertex.tier === "free"` the ROI gate
   refuses to prime regardless of `cache.enabled`. Free-tier rate limits
   make priming counterproductive.
4. **Summariser is advisory in v1.** Writes summary to file + suggests
   `/compress` (Gemini's compact equivalent). v2 will be programmatic
   once Gemini exposes a compact API.
5. **Audit always runs** at SessionStart-detected new session start (Gemini
   has no native `SessionEnd`; we infer end via next SessionStart or via
   `/thrift-gemini audit` manual invocation).

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`. Same shape as CC version + `cache.vertex` block.
- `lib/cost-estimator.mjs` — `estimate({...})` with Vertex/Gemini rate table; cache-read + cache-write + storage-time terms.
- `lib/settings-patcher.mjs` — patches `~/.gemini/settings.json` (nested JSON `hooks.<event>[]` arrays). Append-only, sentinel-revert.
- `lib/vertex-cache-eval.mjs` — Vertex-specific ROI gate (minTokenThreshold check + storageTime payback period + free-tier short-circuit).

## On error

- `.thrift.json` invalid → abort with field-level errors.
- Existing hook entry conflict (same matcher + same non-thrift command) →
  warn + skip; continue registering the others.
- Cache prime sub-threshold → log "skipped: <accumulatedTokens> < <minTokenThreshold>"; continue.
- Cache prime fails (network, Vertex quota) → log + continue.
- Summariser model call fails → log to `.thrift-state.json`; user can retry.

## When done (Phase 5)

Print:
```
Thrift audit: <duration> session, <turns> turns, $<actual> actual vs $<baseline> baseline (saved <%>).
Vertex storage spend: $<storage> ({{storageHours}}h)
Report: <output-path>
```

## Gemini primitive map

| Action | Gemini |
|---|---|
| Hook event names | `BeforeTool` / `AfterTool` / `SessionStart` (no `SessionEnd`) |
| Hook file | `~/.gemini/settings.json` (single JSON, not per-event TOML/YAML) |
| Compact equivalent | `/compress` slash command |
| Summariser model | `gemini-flash` (cheapest Gemini family) |
| Cache surface | Vertex context caching — min-token gated, storage-time billed |
| Tier check | `gemini auth list` (future) OR `cache.vertex.tier` config (v1) |

## References

- `references/porting-notes.md` — phase-by-phase deltas vs CC
- `plugins/harness-thrift/skills/thrift/SKILL.md` — source-of-truth
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — Gemini section
