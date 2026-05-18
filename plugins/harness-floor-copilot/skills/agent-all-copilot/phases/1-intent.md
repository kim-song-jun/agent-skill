# Phase 1 — Intent

## Branches

### Branch A — `taskPath` exists OR `state.iter > 0`

Skip brainstorming. Use the existing `docs/tasks/<N>-<slug>.md`. Stash
`task = {path, title}` (title from first `#` heading).

### Branch B — `prompt` with `--no-brainstorm` OR `config.defaults.brainstormFirst === false`

Write the prompt verbatim to a new file via `apply_patch`:
1. Find next `N` by scanning `docs/tasks/`.
2. Slug from prompt: lowercase, non-alphanum → `-`, max 40 chars.
3. Write `docs/tasks/<N>-<slug>.md` with `# <Title>\n\n<prompt>`.
4. Stash `task` in state.

### Branch C — `prompt` with brainstormFirst true (default)

Copilot has no `superpowers:brainstorming` skill. The coordinator runs a
structured Q&A in chat with the user:

1. Prompt: "What's the user problem?" — capture via `ask_user` or chat input.
2. Prompt: "Constraints?" — capture.
3. Prompt: "Options + tradeoffs?" — coordinator drafts 2-3 options.
4. Prompt: "Chosen direction?" — capture.
5. Synthesize via `apply_patch` into `docs/superpowers/specs/<date>-<slug>.md`.
6. Copy spec to `docs/tasks/<N>-<slug>.md`.
7. Persist a summary to `store_memory(key="agent-all/spec", scope="repository", value=<spec summary JSON>)`.

If the user prefers a non-interactive brainstorm, pass `--no-brainstorm` to
skip this branch.

## All branches

Push `{phase: 1, completedAt}` to `phases` via `apply_patch`.

## Output

Print: `Task ready: <task.path> ("<task.title>")`.
