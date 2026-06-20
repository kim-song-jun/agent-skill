---
name: thrift
description: >
  Use when a long GitHub Copilot CLI session needs cost control, context growth
  management, summarisation, file-backed state, or an end-of-session cost audit.
---

# /thrift (Copilot port)

Bootstraps cost-conscious patterns in a Copilot-CLI project. Reads
`.thrift.json` (or seeds it), patches `.github/hooks/thrift-*.json` with
official Copilot hook registrations, writes summariser + audit state to local
files, and surfaces end-of-session audit via Copilot's `agentStop` hook. A
host-provided private memory adapter can be enabled explicitly, but the public
Copilot CLI contract is file-backed by default.

## Usage

```
/thrift-copilot                       # one-time setup; idempotent
/thrift-copilot summarise             # manual summariser trigger
/thrift-copilot audit                 # write audit report now
/thrift-copilot --force               # re-seed .thrift.json
/thrift-copilot --no-instrument       # skip hook installation
/thrift-copilot --dry-run             # preview without writing
```

## Flags

- `--force` — overwrite existing `.thrift.json`.
- `--no-instrument` — skip the `.github/hooks/*.json` patch (just seed config).
- `--dry-run` — print what would be patched; don't write.
- `--store-memory` — enable a host-provided private memory adapter. Defaults to
  file-only state because current public Copilot CLI docs do not expose
  a memory primitive for this harness.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | detect context-mode-copilot + Copilot version + optional memory adapter |
| 1 | `phases/1-config.md` | seed/load .thrift.json + compute thresholds |
| 2 | `phases/2-instrument.md` | patch `.github/hooks/thrift-*.json` (append-only) |
| 3 | `phases/3-summariser.md` | summarise current window; write file-backed state |
| 4 | `phases/4-cache-prime.md` | **disabled by default** — Copilot intermediates the model layer; document opt-in |
| 5 | `phases/5-audit.md` | write audit report + optional memory adapter mirror |

## Rules

1. **Append-only hook patches.** Never modify or remove existing entries
   in `.github/hooks/*.json`. Use `thrift-` command-path sentinel for
   safe revert via `unpatchHooks`.
2. **Cache prime is disabled by default and warns on opt-in.** Copilot
   sits between the user and the underlying model, so direct prime calls
   are not observably effective. Enable only if a future Copilot release
   exposes cache-hit telemetry.
3. **Summariser is advisory.** Writes summary to file and notifies via stderr
   (Copilot surfaces stderr in the TUI). No `/compact` equivalent exists in
   Copilot — advisory is "consider starting a fresh session or running
   `gh copilot reset`".
4. **Audit always runs** on `agentStop`. Phase 5 reads from
   `.thrift-state.json`.
5. **Memory adapter is opt-in.** If `storeMemory.enabled` is true and the
   supplied invoker is unavailable, the bridge falls back to file-only mode and
   records a `storeMemoryDegraded: true` flag in state.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` →
  `{ok, config | errors, warning?}`. Independent copy with a
  Copilot-flavoured `storeMemory` section in DEFAULTS.
- `lib/cost-estimator.mjs` — `estimate({tokensInUncached, tokensInCached,
  tokensOut, model})` → `{actualUSD, baselineUSD, savedRatio, breakdown}`.
  OpenAI rate table (`gpt-5`, `gpt-5-nano`, etc.). All rates marked
  `assumed; verify against current OpenAI pricing`.
- `lib/settings-patcher.mjs` — `patchHooks({hooksDir, hooksToAdd,
  dryRun})` / `unpatchHooks({hooksDir, sentinel})`. Writes one JSON
  file per event under `.github/hooks/`. Append-only.
- `lib/store-memory-bridge.mjs` — `storeMemoryWrite({key, value,
  scope, invoker})` and `storeMemoryRead({key, scope, invoker})` with a
  file fallback at `.thrift/store-memory-fallback/<key>.json`. Invoker
  is a host-supplied private memory adapter; pass a mock in tests.

## On error

- `.thrift.json` invalid → abort with field-level errors (Phase 1).
- Existing hook conflict (same `command` already registered) → skip
  that specific entry; continue with the others.
- Cache prime never runs unless `cache.enabled = true` AND
  `cache.intermediationWarning = false` (force opt-in).
- Summariser model call fails → log to `.thrift-state.json`; user can
  retry via `/thrift-copilot summarise`.
- Memory adapter invoker throws → fall back to file at
  `.thrift/store-memory-fallback/<key>.json`; record degradation.

## When done (Phase 5)

Print:
```
Thrift audit: <duration> min session, <turns> turns,
  $<actual> actual vs $<baseline> baseline (saved <%>).
  Report: <output-path>
  Memory adapter: <ok|degraded|disabled>
```

## References

- `references/porting-notes.md` — Copilot-vs-CC primitive differences,
  known unknowns, future spike list.
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`
  — decomposition spec (Copilot section ~1.5w).
- `plugins/harness-thrift/skills/thrift/SKILL.md` — Claude Code
  source-of-truth.
