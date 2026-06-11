# Phase 3 — Verify

## Steps

1. Confirm both sibling files exist unless `--dry-run` was used.
2. Parse embedded metadata from both files with `parseEmbeddedMetadata()`.
3. Confirm `discoverResumeArtifacts({ taskPath })` finds the handoff and
   session files that were just produced.
4. If non-TTY mode auto-selected the recommended action, confirm
   `.agent-skill/runs/handoff-audit.jsonl` has an event with:
   - `event: "non_tty_next_action_auto_selected"`
   - the task path
   - selected action `resume-agent-all`
5. Confirm `.agent-skill/runs/handoff/interactions.jsonl` has an
   `agent-interaction-log/v1` event from `agent-handoff` whose interaction
   kind is `resume` and selected option is `resume-agent-all`.
6. Print the resume command:
   `/agent-all <task> --resume`

## Exit Codes

- `0` — handoff/session generated or dry-run rendered successfully.
- `1` — missing task file, strict validation failure, metadata parse failure,
  or write failure.
