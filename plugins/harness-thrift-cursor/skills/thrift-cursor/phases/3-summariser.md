# Phase 3 — Summariser

Cursor exposes no programmatic compact API and no Notification hook,
so this phase is **fully advisory**. The `.cursor/rules/thrift.mdc`
rule includes a clause directing the planner to suggest a
summarisation pass when the conversation has grown past the configured
thresholds — but Cursor cannot count tool calls or output tokens
authoritatively from a rule alone. The planner uses its own
self-assessment of "how long this chat has been running."

## Triggers (advisory)

1. **Self-triggered by planner.** The rule text says: "After roughly
   `{{everyNTurns}}` of your turns, or whenever you have produced
   ~`{{everyMTokensOutput}}` output tokens, propose a summarisation
   pass to the user."
2. **User-triggered.** The user asks: "Please summarise this chat per
   the thrift rule."

## Steps (when actually generating a summary in Cursor)

Cursor has no plugin-callable transcript API, so the summariser is
literally a chat message the planner produces. Suggested shape:

1. Identify the last `preserveLastTurns` (default 6) turns. Keep them
   verbatim.
2. For all earlier turns, produce a one-line bullet per turn capturing
   the action taken + the relevant file path(s) touched.
3. List any open TODOs or unresolved questions.
4. Write the summary to `.agent-skill/reports/thrift/cursor-summary-<YYYY-MM-DD>-<HHMM>.md`.
5. Tell the user: "Summary at `<path>`. Consider starting a fresh chat
   with this file in context to reduce token spend going forward."

## What's missing vs Claude Code Phase 3

| Capability | Claude Code | Cursor |
|---|---|---|
| `PostToolUse` auto-trigger | yes | no — relies on planner self-assessment |
| Notification hook | yes (advisory v1) | no — relies on inline chat message |
| Anthropic SDK heuristic summariser | yes (`--use-haiku` flag) | n/a — planner writes the summary itself |
| `.thrift-state.json` recordSummariser() | yes | no — no state file |
| Threshold accuracy | byte-counted in hook | planner estimate only |

## On error

- The planner cannot reliably count tokens. If the user complains the
  rule fired "too late" or "too early," tighten `everyNTurns` and/or
  `everyMTokensOutput` in `.thrift.json` — the rule re-reads them on
  the next chat turn (rules are reloaded per turn).
