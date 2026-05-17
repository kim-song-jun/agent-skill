# Phase 1 — Intent

## Inputs (from state)

- `taskPath` (if Phase 0 set it) OR `prompt`
- `config.defaults.brainstormFirst`
- CLI: `--no-brainstorm`
- `state.iter` (for loop iterations)

## Branches

### Branch A — taskPath exists OR state.iter > 0

Skip brainstorming entirely. Use the existing `docs/tasks/<N>-<slug>.md` file as the task. Stash `task` in state with `{path, title}` (title from first `#` heading of the file).

### Branch B — prompt + (--no-brainstorm OR config.defaults.brainstormFirst === false)

Write the prompt verbatim to a new task file:
1. `nextN = scanDir("docs/tasks/").map(parseLeadingInt).max() + 1` (default 1 if empty).
2. `slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)`.
3. Write file `docs/tasks/<nextN>-<slug>.md` with content:
   ```
   # <slug rendered as Title Case>

   <prompt>
   ```
4. Stash `task = {path, title}` in state.

### Branch C — prompt + brainstormFirst true (default)

1. Invoke `Skill` with `superpowers:brainstorming` passing the prompt as `args`. Brainstorming will write its own design doc to `docs/superpowers/specs/`.
2. After it completes, locate the newest file under `docs/superpowers/specs/` (sort by mtime).
3. Copy or symlink that file's content to `docs/tasks/<nextN>-<slug>.md` (title from spec's first `#`).
4. Stash `task` in state.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output to user

Print: `Task ready: <task.path> ("<task.title>")`.
