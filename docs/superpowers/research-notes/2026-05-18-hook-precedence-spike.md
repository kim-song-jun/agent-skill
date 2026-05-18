# Spike: hook precedence across harness-floor + context-mode + harness-thrift

**Date:** 2026-05-18
**Sandbox limitation:** Cannot run live CC + observe hook firing
order. Findings derived from CC hook semantics + the existing
`settings.local.json.hbs` pattern + harness-floor visual-qa hook
templates.

## Question

When harness-floor + context-mode + harness-thrift all register hooks
for the same event (e.g., `PreToolUse(Bash)`), what is the firing order?
Can they conflict? Does ordering matter for correctness?

## Evidence collected

1. **CC hooks are array-of-matchers per event.** Pattern from
   `plugins/harness-builder/skills/agent-init/templates/settings.local.json.hbs`:
   ```json
   "PreToolUse": [
     { "matcher": "Bash", "hooks": [...] }
   ]
   ```
   Multiple entries can match the same event. CC fires them in array
   order (first to last).

2. **Hooks can come from multiple sources.** Per CC docs (visible behavior
   in repo): hooks merge from `~/.claude/settings.json` (user-global),
   `.claude/settings.json` (project), `.claude/settings.local.json`
   (local override). Order of merge: global → project → local. Within
   each file, array order is preserved.

3. **PreToolUse hooks can BLOCK the tool call** by exiting non-zero with
   a message. This is destructive — if context-mode-router fires first
   and blocks, the harness-thrift coerce-bash hook never gets to suggest
   its own coercion.

4. **PostToolUse hooks cannot block** but can observe output. Multiple
   PostToolUse fire sequentially per matched tool call.

5. **SessionStart and SessionEnd are non-blocking** and run to completion
   in array order before the next hook executes.

6. **Stop hook can re-run the assistant** by exiting non-zero. If
   multiple Stop hooks fire and any one of them returns non-zero, the
   assistant continues. This is how the `/goal` system in this session
   works.

7. **Hook output is rendered as a system reminder** to the assistant on
   the next turn (visible in this session: PreToolUse:Bash hook output
   becomes `<system-reminder>` text).

## Hook conflict matrix

| Event | Existing hooks | New thrift hook | Risk |
|---|---|---|---|
| `PreToolUse(Bash)` | `context-mode-router.mjs` (suggests ctx_execute for large output) | `coerce-bash-to-ctx-execute.mjs` (same suggestion + token-cost message) | **Duplicate suggestion.** Both fire; user sees two reminders for the same thing. |
| `PreToolUse(Read)` | (none currently in repo) | `coerce-read-when-large.mjs` (suggests ctx_execute_file) | Clean — no conflict. |
| `PostToolUse(*)` | (none currently in repo) | `posttool-summariser-trigger.mjs` (accumulates token count, fires summariser at threshold) | Clean. |
| `SessionStart` | `cache-heal.mjs` (self-heals plugin cache) | `cache-prime.mjs` (warms Anthropic prompt cache) | Clean — different concerns, run sequentially. |
| `SessionEnd` | (none currently in repo) | `thrift-audit-report.mjs` (writes audit report) | Clean. |
| `Stop` | `session-summary.mjs` (writes session summary) | (none new) | N/A. |

## Critical conflict: PreToolUse(Bash) duplication

The existing `context-mode-router.mjs` already does what
`coerce-bash-to-ctx-execute.mjs` would do. Running both is wasted work
and double-noise to the user.

**Resolution options:**

- **A. Detection + skip.** harness-thrift's hook checks for the
  context-mode-router presence at registration time. If present, skips
  registering its own hook and instead extends the existing one with
  thrift-specific telemetry (record the coercion suggestion for audit).
- **B. Replace.** harness-thrift's hook does context-mode coercion AND
  thrift telemetry; instructs the user to remove context-mode-router
  during install. Risky: removes user's existing config.
- **C. Cooperate.** harness-thrift hook ONLY emits telemetry (records
  bash-call output size for audit) and does NOT emit a coercion message.
  Lets context-mode-router stay authoritative on coercion. Clean
  separation of concerns.

**Recommendation: Option C.** Coercion is context-mode's job; thrift
just observes for the audit. This means the
`pretool-context-mode-coerce.json.hbs` template renamed to
`pretool-thrift-telemetry.json.hbs` — it does NOT coerce, it OBSERVES.

## Firing order recommendation

For the same event with multiple hooks, recommended array order:

| Event | Order | Reasoning |
|---|---|---|
| `PreToolUse(Bash)` | 1. context-mode-router (existing) → 2. thrift-telemetry (new) | Router decides; telemetry observes the decision. |
| `PreToolUse(Read)` | 1. thrift-coerce-read (new, only registered if no other Read hook) | No existing hook to conflict with. |
| `PostToolUse(*)` | 1. thrift-posttool-summariser-trigger (new) | Single hook; no conflict. |
| `SessionStart` | 1. cache-heal (existing) → 2. thrift-cache-prime (new) | Heal infra first, then prime cache. |
| `SessionEnd` | 1. thrift-audit-report (new) | Single. |
| `Stop` | 1. session-summary (existing) → (thrift adds nothing) | Existing handles summary; thrift's audit runs at SessionEnd not Stop. |

## Implementation requirement for thrift-instrument

The `phases/2-instrument.md` doc must:

1. Read existing `.claude/settings.local.json` (if any).
2. Detect existing hooks per event.
3. **Append** thrift's hook entries to the end of each event's array
   (so existing hooks fire first).
4. **NEVER** modify or remove existing hook entries.
5. On `SessionEnd` (which fires Phase 5 audit), revert by removing
   only the thrift-prefixed entries — leaving everything else
   untouched.

To make revert reliable, thrift entries get a sentinel comment in their
JSON value or a known prefix in the command path
(`thrift-<name>.mjs`). Revert iterates and removes entries whose
command path matches `.*thrift-.*\.mjs`.

## Settings file precedence

| File | Precedence | thrift uses? |
|---|---|---|
| `~/.claude/settings.json` (user-global) | Lowest | NO — too invasive |
| `.claude/settings.json` (project, committed) | Middle | NO — would bind teammates |
| `.claude/settings.local.json` (local override, gitignored) | Highest | **YES** — thrift edits this file only |

This isolates thrift's hook registrations to the current user's local
session without affecting the committed project config.

## Time spent

Spike was supposed to take 2 days. Sandbox-bound version takes ~3 hours
(this doc + decision matrix). Live spike with running CC + observation
of actual firing order would still need to confirm:

1. Array-order assumption (1-to-N first-to-last firing).
2. Whether CC has any built-in hook deduplication.
3. Whether `.claude/settings.local.json` is honored even when
   `.claude/settings.json` doesn't exist.
4. Whether SessionEnd reliably fires on Ctrl-C / kill (`SIGTERM`).

These confirmations gate v2 of thrift-instrument; v1 makes documented
assumptions.

## Decisions for thrift-instrument v1

1. Coerce via Option C — telemetry-only PreToolUse(Bash) hook; let
   context-mode-router stay authoritative.
2. Patch `.claude/settings.local.json` only. Never touch global or
   committed config.
3. Use `thrift-` prefix on hook command paths for sentinel-based revert.
4. Append-only registration; never remove or modify other hooks.
5. Best-effort SessionEnd audit; fall back to in-memory state flushed
   on every summariser fire so audit can be reconstructed if SessionEnd
   misses.
