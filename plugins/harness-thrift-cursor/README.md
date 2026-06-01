# harness-thrift-cursor

Theme B (cost-conscious long-session optimisation) ported to **Cursor** as
an **advisory-only** rule. Cursor has no programmatic hook system and no
exposed prompt-cache surface, so this port collapses the 6-phase Claude
Code pipeline into a single `.cursor/rules/thrift.mdc` directive plus a
seed `.thrift.json` config.

See the source-of-truth design in
`plugins/harness-thrift/skills/thrift/SKILL.md` (Claude Code) and the
per-platform decomposition in
`docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md`.

## What it does

- **Writes `.thrift.json`** at the workspace root (config shape mirrors
  the Claude Code port, minus the `cache` section).
- **Writes `.cursor/rules/thrift.mdc`** (`alwaysApply: true`) — a rule
  the planner reads on every chat turn. The rule encodes the workflow
  the Claude Code version implements with hooks:
  - Prefer `ctx_execute` over `run_shell_command` for any command
    expected to produce >20 lines of output (if context-mode-cursor is
    installed).
  - Every ~25 turns or after ~30k output tokens, suggest a summarisation
    pass (no programmatic compact API on Cursor).
  - Before ending a long session, write a one-page recap to
    `docs/thrift/cursor-recap-<date>.md`.

## What it does NOT do (vs Claude Code version)

| Feature | Claude Code | Cursor |
|---|---|---|
| Hook-based coerce telemetry | yes (`PreToolUse`) | no — rule-only advisory |
| Prompt cache prime (Phase 4) | yes (every ~4 min) | **N/A** — no cache surface |
| Programmatic summariser trigger | yes (`PostToolUse`) | no — rule asks user |
| Quantified audit (token cost) | yes | no — textual recap only |
| `.thrift-state.json` metrics | yes | no |

Net: this is the smallest port of the Theme B family. Estimated ~5 days
of implementation effort vs ~1.5–2 weeks for the Codex / Copilot /
Gemini siblings.

## Install

Cursor has no plugin loader. Use the release installer from this repo:

```
./scripts/install-platform.sh --platform=cursor --theme=thrift --target=/path/to/project
```

The platform installer delegates to the bundled renderer and keeps all
artifacts project-local. For direct renderer use, run:

```
node plugins/harness-thrift-cursor/bin/install.mjs /path/to/project [--force]
```

Direct renderer flags:
- `--force` - overwrite existing `.thrift.json` and `.cursor/rules/thrift.mdc`.
- `--dry-run` - print what would be written; do not write.
- `--ctx <path>` - JSON file overriding template context defaults
  (`everyNTurns`, `everyMTokensOutput`, `summariserModel`, `date`).

What gets written to `<target>`:

```
.thrift.json                     (config seed; cache section omitted)
.cursor/rules/thrift.mdc         (alwaysApply rule encoding the workflow)
```

## Release surface

- `.thrift.json` seed, with the cache section omitted because Cursor exposes
  no prompt-cache primitive.
- `.cursor/rules/thrift.mdc` advisory-only workflow rule.
- `bin/install.mjs` renderer for project-local install, dry-run, force, and
  context overrides.
- Cursor-adapted `lib/config-loader.mjs` and `lib/cost-estimator.mjs`; rate
  reporting remains advisory-only because Cursor does not surface token
  counts.

## Runtime validation

The release contract verifies the emitted files and stale-wording guardrails.
Runtime behavior is intentionally advisory-only: open Cursor in the target
workspace and confirm the rule appears in `.cursor/rules/thrift.mdc`, then ask
the planner to follow it for a long-session recap.

## Usage

After install, open any chat in your Cursor workspace. The rule is
applied automatically. There is no `/thrift` slash command — Cursor
respects the rule passively. To explicitly trigger a recap or summary,
ask the planner directly:

```
Please follow .cursor/rules/thrift.mdc and produce the end-of-session recap.
```

## Configuration

`.thrift.json` at workspace root:

```json
{
  "version": "0.1.0",
  "summariser": {
    "everyNTurns": 25,
    "everyMTokensOutput": 30000,
    "preserveLastTurns": 6,
    "preserveSpecPaths": true,
    "model": "claude-haiku-4-5-20251001"
  },
  "contextMode": {
    "coerceBashWhenOutputExceeds": 20,
    "coerceReadWhenOutputExceeds": 200,
    "blockedTools": []
  },
  "audit": {
    "estimateBaseline": "naive-cursor",
    "outputPath": "docs/thrift/cursor-recap-<date>.md"
  }
}
```

Note the absence of the `cache` section relative to the Claude Code
version — Cursor exposes no cache primitive so the field is omitted
to avoid implying an unimplemented feature.

## Status

The Cursor port ships as an advisory-only Theme B surface. It matches the
per-platform decomposition for Cursor while keeping runtime enforcement in the
Cursor rule layer rather than hook code.

## References

- `plugins/harness-thrift/` — source-of-truth Claude Code plugin
- `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` — per-platform spec
- `skills/thrift-cursor/references/porting-notes.md` — Cursor-specific simplifications
