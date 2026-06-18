---
name: thrift
description: >
  Use when a long scaffolded agent session needs cost control, context growth
  management, summarisation, prompt cache priming, or an end-of-session cost
  audit.
---

# /thrift

Bootstraps cost-conscious patterns in the current project. Reads
`.thrift.json` (or seeds it), patches `.claude/settings.local.json`
with hooks, and starts a SessionStart cache-prime + PostToolUse
summariser-trigger loop.

## Usage

```
/thrift                          # one-time setup; idempotent
/thrift summarise                # manual summariser trigger
/thrift audit                    # write audit report now
/thrift --force                  # re-seed .thrift.json
```

## Flags

- `--force` — overwrite existing `.thrift.json`.
- `--no-instrument` — skip the settings.local.json patch (just seed config).
- `--dry-run` — print what would be patched; don't write.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | detect context-mode + CC + existing hooks |
| 1 | `phases/1-config.md` | seed/load .thrift.json + compute thresholds |
| 2 | `phases/2-instrument.md` | patch .claude/settings.local.json (append-only) |
| 3 | `phases/3-summariser.md` | summarise current window (manual OR auto-triggered) |
| 4 | `phases/4-cache-prime.md` | warm prompt cache every warmInterval seconds |
| 5 | `phases/5-audit.md` | write end-of-session audit report |

## Rules

1. **Append-only hook patches.** Never modify or remove existing hooks
   in `.claude/settings.local.json`. Use `thrift-` command-path sentinel
   for safe revert.
2. **Cache prime is disabled by default.** Short sessions can lose money
   to priming. Enable explicitly via `.thrift.json` `cache.enabled = true`.
3. **Summariser is advisory in v1.** Writes summary to file + emits
   Notification asking user to `/compact` + reference summary path.
   v2 will be programmatic once CC API surfaces.
4. **Audit always runs** even on Ctrl-C — Phase 5 reads incremental
   state from `.thrift-state.json` rather than relying solely on
   SessionEnd hook.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`.
- `lib/threshold-evaluator.mjs` — `shouldFireSummariser({turnsSinceLastSummary, tokensSinceLastSummary, config})` → `{fire, reason}` (reason: `"turns"|"tokens"|null`). Also `estimateTokensFromBytes(bytes, contentType?)`.
- `lib/cost-estimator.mjs` — `estimate({tokensInUncached, tokensInCached, tokensOut, model})` → `{actualUSD, baselineUSD, savedRatio, breakdown}`. Also `estimateSession(records)` for per-session aggregation.
- `lib/summariser.mjs` — `async summarise({turns, preserveLastTurns?, preserveSpecPaths?, summariseFn})` → `{summaryText, droppedTurnCount, preservedRefs, tokensBefore, tokensAfterEstimate}`. `summariseFn` is required (a caller-supplied model call); `heuristicSummariseFn()` returns a dependency-free fallback.
- `lib/settings-patcher.mjs` — `patchSettings({settingsPath, hooksToAdd, dryRun})` → diff applied. Also `unpatchSettings(...)` and `buildStandardThriftHooks({hooksDir})`.

## On error

- `.thrift.json` invalid → abort with field-level errors.
- Existing hook conflict detected (same matcher already calls a
  non-thrift script) → warn + skip that specific hook entry; continue
  registering the others.
- Cache prime fails (network) → log + continue (other features unaffected).
- Summariser model call fails → log to `.thrift-state.json`; user can
  retry via `/thrift summarise`.

## When done (Phase 5)

Print:
```
Thrift audit: <duration> session, <turns> turns, $<actual> actual vs $<baseline> baseline (saved <%>).
Report: <output-path>
```

## References

- `docs/superpowers/specs/2026-05-18-harness-thrift-design.md` — full design
- `docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md` — v1 vs v2 summariser decision
- `docs/superpowers/research-notes/2026-05-18-hook-precedence-spike.md` — append-only patch protocol
