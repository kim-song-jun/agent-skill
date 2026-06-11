# Phase 2 — Render

## Steps

1. Render `.agent-skill/handoff/<NN>-<slug>.handoff.md` with `renderHandoff()`.
2. Render `.agent-skill/handoff/<NN>-<slug>.session.md` with `renderSessionPrompt()`.
3. Embed machine-readable metadata in both files:
   - `agent-skill/handoff@1`
   - `agent-skill/session-prompt@1`
4. Include the generated file paths, next-action candidates, selected non-TTY
   action when any, `agent-interaction/v1` resume metadata, git summary, and
   task state in metadata.
5. If `--dry-run`, print both outputs and write nothing.
6. Otherwise, write atomically with temp-file then rename.

## Required Content

- Goal
- Source of truth list
- Current state summary
- Completed / remaining / blocker summaries
- Preflight gates
- Operating constraints
- Dangerous-command approval list
- Verification gates
- First action
