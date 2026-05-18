# Phase 1 — Intent

## Branches

### Branch A — `taskPath` exists OR `state.iter > 0`

Skip brainstorming. Use the existing `docs/tasks/<N>-<slug>.md` as the task.
Stash `task = {path, title}` (title from first `#` heading).

### Branch B — `prompt` with `--no-brainstorm` OR `config.defaults.brainstormFirst === false`

Write the prompt verbatim to a new file:
1. Find next `N` by scanning `docs/tasks/` for leading integers.
2. Slug from prompt: lowercase, non-alphanum → `-`, max 40 chars.
3. Write `docs/tasks/<N>-<slug>.md` with `# <Title>\n\n<prompt>`.
4. Stash `task` in state.

### Branch C — `prompt` with brainstormFirst true (default)

Cursor has no programmatic brainstorming skill. The coordinator instead
opens a structured Q&A in chat using the same axes as
`superpowers:brainstorming` (problem → constraints → options → tradeoffs →
chosen direction). When the user accepts the direction, write the synthesis
to `docs/superpowers/specs/<date>-<slug>.md` and copy to `docs/tasks/<N>-<slug>.md`.

If the workspace has `harness-floor` (Claude Code) installed in parallel,
the coordinator may instead instruct the user to run
`@superpowers:brainstorming` and paste back the spec path.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output

Print: `Task ready: <task.path> ("<task.title>")`.
