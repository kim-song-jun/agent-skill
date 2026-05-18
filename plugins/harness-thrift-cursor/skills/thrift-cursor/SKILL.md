---
name: thrift-cursor
description: >
  Cursor port of /thrift (Theme B — cost-conscious long-session optimisation).
  Advisory-only rule + config. Cursor has no programmatic hooks and no exposed
  prompt cache, so this port collapses to a `.cursor/rules/thrift.mdc` directive
  the planner reads on every turn. See plugins/harness-thrift/skills/thrift/SKILL.md
  for the source-of-truth pipeline.
---

# /thrift (Cursor port)

Installs cost-conscious patterns in the current Cursor workspace by
writing a `.thrift.json` config and a `.cursor/rules/thrift.mdc` rule
that the planner respects on every turn.

## Why an advisory rule instead of hooks

Cursor's automation surface is rule-based (`.cursor/rules/*.mdc`) —
there is no `PreToolUse` / `PostToolUse` / `SessionStart` /
`SessionEnd` equivalent. The Claude Code version's Phase 2 (instrument)
patches `.claude/settings.local.json` with hook entries; on Cursor that
machinery doesn't exist. The advisory rule encodes the same intent:
"prefer context-mode for large outputs, suggest summarisation every N
turns, recap before ending a long session." Enforcement falls to the
planner reading the rule each turn.

Cursor also exposes no prompt-cache primitive, so the Claude Code
**Phase 4 (cache prime)** is **removed** in this port — there is
nothing to prime.

The Claude Code **Phase 5 (audit)** degrades from a quantified token-cost
report to a textual recap, because Cursor does not surface token counts
in its planner output.

## Usage

```
node plugins/harness-thrift-cursor/bin/install.mjs /path/to/project [--force] [--dry-run]
```

After install, the rule is applied to every chat automatically. There
is no `/thrift` slash command on Cursor — the workflow is chat-driven.

## Flags (install)

- `--force` — overwrite existing `.thrift.json` and `.cursor/rules/thrift.mdc`.
- `--dry-run` — print what would be written; do not write.
- `--ctx <path>` — JSON file overriding template context defaults.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | detect Cursor workspace + optional context-mode-cursor |
| 1 | `phases/1-config.md` | seed/load `.thrift.json` (cache section omitted) |
| 2 | `phases/2-instrument-as-rule.md` | write `.cursor/rules/thrift.mdc` (replaces hook patching) |
| 3 | `phases/3-summariser.md` | advisory: planner suggests a manual summarisation pass at threshold |
| — | (no Phase 4) | cache prime removed — Cursor exposes no cache surface |
| 5 | `phases/5-audit.md` | advisory: planner writes a textual recap before session end |

## Rules

1. **Single-file rule write.** Phase 2 writes (or overwrites with
   `--force`) one file: `.cursor/rules/thrift.mdc`. There is no
   append-only patcher because there is no settings file to share with
   other plugins.
2. **No metrics collection.** `.thrift-state.json` is not produced —
   Cursor's planner has no API to read tool-call counts or token usage.
3. **Summariser is advisory always.** Even more so than the Claude Code
   v1: no Notification, no auto-trigger. The rule asks the planner to
   suggest a summarisation pass when it detects the conversation has
   grown long.
4. **Cache prime omitted.** Phase 4 of the Claude Code skill is removed
   entirely. The `.thrift.json` schema omits the `cache` section to
   avoid implying an unimplemented feature.
5. **Audit is a textual recap.** Phase 5 writes
   `docs/thrift/cursor-recap-<date>.md` containing a free-form summary
   of what happened in the session — no token counts, no cost numbers.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`.
  Same contract as the Claude Code version but with the `cache` section
  removed from `DEFAULTS` and validation.
- `lib/cost-estimator.mjs` — `estimate({tokensInUncached, tokensInCached,
  tokensOut, model})` → `{actualUSD, baselineUSD, savedRatio, breakdown}`.
  Independent copy (Option B from the decomposition spec). Documented as
  **advisory rates** — Cursor does not surface token counts at runtime
  so this estimator is useful only when the user pastes token counts
  themselves into the recap.

## Templates

- `templates/thrift.config.json.hbs` — `.thrift.json` seed (no cache section).
- `templates/rules/thrift.mdc.hbs` — `alwaysApply: true` Cursor rule.
- `templates/audit-report.md.hbs` — recap shape (used if the user runs
  the planner to fill the recap from pasted numbers).

## On error

- `.thrift.json` invalid → install reports the field errors and aborts.
- `.cursor/` directory missing → install creates it.
- `.cursor/rules/thrift.mdc` already exists without `--force` → install
  refuses with the same message pattern as harness-floor-cursor's
  `init.mjs`.

## When done

Install prints:

```
Thrift install summary (Cursor):
  target:       <path>
  config:       .thrift.json
  rule:         .cursor/rules/thrift.mdc
  cache prime:  omitted (Cursor has no cache surface)
  audit:        advisory recap only (no token metrics)
```

## References

- `references/porting-notes.md` — Cursor-specific simplifications
- `plugins/harness-thrift/skills/thrift/SKILL.md` — source-of-truth Claude Code skill
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — Cursor section
