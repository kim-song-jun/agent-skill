---
name: thrift-codex
description: >
  Codex CLI port of /thrift — cost-conscious long-session optimisation.
  TOML hooks in ~/.codex/config.toml, OpenAI cost table, session-priming
  variant of Phase 4. Same six-phase pipeline as harness-thrift (CC);
  see plugins/harness-thrift/skills/thrift/SKILL.md for source-of-truth.
---

# /thrift-codex

Bootstraps cost-conscious patterns in the current project on Codex CLI.
Reads `.thrift.json` (or seeds it), patches `~/.codex/config.toml`'s
`[hooks]` block append-only, and arms `session_start` cache-prime +
`post_tool_use` summariser-trigger flows.

## Usage

From an installed Codex project, open `codex` in the repo and type the public
harness entrypoints:

```
run /thrift
run /thrift summarise
run /thrift audit
```

This routes to the local `thrift-codex` workflow contract below. The
Codex-specific skill name remains visible so installed files, release audits,
and phase paths can stay platform-explicit.

```
/thrift-codex                          # one-time setup; idempotent
/thrift-codex summarise                # manual summariser trigger
/thrift-codex audit                    # write audit report now
/thrift-codex --force                  # re-seed .thrift.json
```

## Flags

- `--force` — overwrite existing `.thrift.json`.
- `--no-instrument` — skip the `~/.codex/config.toml` patch (just seed config).
- `--dry-run` — print what would be patched; don't write.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | detect context-mode-codex + Codex version + existing `[hooks]` block |
| 1 | `phases/1-config.md` | seed/load .thrift.json + compute thresholds |
| 2 | `phases/2-instrument.md` | patch ~/.codex/config.toml (append-only, sentinel-line revert) |
| 3 | `phases/3-summariser.md` | summarise current window (stderr-advisory on Codex) |
| 4 | `phases/4-cache-prime.md` | session-priming via exec_command (best-effort on OpenAI cache) |
| 5 | `phases/5-audit.md` | write end-of-session audit report |

## Rules

1. **Append-only hook patches.** Never modify or remove existing entries
   in `~/.codex/config.toml`. New entries are bracketed by sentinel
   comment lines: `# thrift: thrift-<name>` (start) and `# end thrift:
   thrift-<name>` (end). Revert deletes only blocks between matching
   sentinels.
2. **Cache prime is disabled by default.** On Codex this is doubly
   conservative — OpenAI cache hit rate is not directly observable via
   Codex, so the savings calc becomes a heuristic. Enable explicitly
   via `.thrift.json` `cache.enabled = true`.
3. **Summariser is advisory in v1.** Writes summary to file +
   suggests `/compact` in the Codex TUI via stderr (Codex has no
   `Notification` hook equivalent).
4. **Audit always runs** — Phase 5 reads incremental state from
   `.thrift-state.json` rather than relying solely on session_end hook.

## Codex primitive map

| Action | Codex primitive |
|---|---|
| Read file | implicit (model reads directly) |
| Write file | `apply_patch` |
| Shell (one-shot) | `shell_command` |
| Shell (cache prime / session reuse) | `exec_command` |
| Hook registration | `[hooks]` block in `~/.codex/config.toml` |
| Notification | stderr from a `post_tool_use` hook + write to `~/.codex/notifications/` |
| Prompt user | `ask_user` |

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`.
- `lib/cost-estimator.mjs` — `estimate({tokensInUncached, tokensInCached, tokensOut, model})` → `{actualUSD, baselineUSD, savedRatio}`. OpenAI rate table.
- `lib/settings-patcher.mjs` — `patchCodexConfig({configPath, hooksToAdd, dryRun})` → diff applied. Minimal TOML-aware append/remove.

## On error

- `.thrift.json` invalid → abort with field-level errors.
- Existing hook conflict (sentinel block with same name already present)
  → skip + report `skipped`. Re-runs are idempotent.
- `~/.codex/config.toml` not readable → abort with the OS error.
  The patcher refuses to create the file from scratch (user must run
  `codex` once first to seed it).
- Summariser call fails → log to `.thrift-state.json`; user can retry
  via `run /thrift summarise`.

## When done (Phase 5)

Print:
```
Thrift audit (Codex): <duration> session, <turns> turns, $<actual> actual vs $<baseline> baseline (saved <%>).
Report: <output-path>
```

## References

- `references/porting-notes.md` — Codex-specific decisions + open questions
- `plugins/harness-thrift/skills/thrift/SKILL.md` — CC source-of-truth pipeline
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — porting decomposition
