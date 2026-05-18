# Phase 1 — Intent

## Branches

### Branch A — `taskPath` exists OR `state.iter > 0`

Skip brainstorming. Use the existing `docs/tasks/<N>-<slug>.md`. Stash
`task = {path, title}` (title from first `#` heading).

### Branch B — `prompt` with `--no-brainstorm` OR `config.defaults.brainstormFirst === false`

Write the prompt verbatim via `apply_patch`:
1. Find next `N` by scanning `docs/tasks/`.
2. Slug from prompt: lowercase, non-alphanum → `-`, max 40 chars.
3. Write `docs/tasks/<N>-<slug>.md` with `# <Title>\n\n<prompt>`.
4. Stash `task` in state.

### Branch C — `prompt` with brainstormFirst true (default)

Codex has no `superpowers:brainstorming` equivalent. The coordinator runs
a structured Q&A using `ask_user`:

1. `ask_user("What's the user problem?")` — capture.
2. `ask_user("Constraints?")` — capture.
3. Coordinator drafts 2-3 options.
4. `ask_user("Chosen direction (1/2/3)?")` — capture selection.
5. Synthesize via `apply_patch` into `docs/superpowers/specs/<date>-<slug>.md`.
6. Copy spec to `docs/tasks/<N>-<slug>.md`.

If `ask_user` not available in the running Codex session, fall back to
prompting in the chat surface directly.

## All branches

Push `{phase: 1, completedAt}` to `phases` via `apply_patch`.

## Output

Print: `Task ready: <task.path> ("<task.title>")`.
