# Phase 1 — Intent

## Inputs (from state)

- `taskPath` (if Phase 0 set it) OR `prompt`
- `requestedId` (if Phase 0 accepted `--task-id=<N>`)
- `config.defaults.brainstormFirst`
- CLI: `--no-brainstorm`
- `state.iter` (for loop iterations)

## Branches

### Branch A — taskPath exists OR state.iter > 0

Skip brainstorming entirely. Use the existing `docs/tasks/<N>-<slug>.md` file as the task.

1. Read the task doc.
2. Validate it with `validateTaskDoc(text)` from `lib/task-ledger.mjs`. If `ok === false`, abort and print each error so the task ledger can be repaired before work continues.
3. Stash `task` in state with `{path, title}` (title from first `#` heading of the file).

### Branch B — prompt + (--no-brainstorm OR config.defaults.brainstormFirst === false)

Create a durable task ledger entry from the free-form prompt:

1. Read `docs/tasks/index.md` as `indexText` and list existing filenames under `docs/tasks/`.
2. Compute `nextN = allocateTaskId({ indexText, filenames, requestedId })` from `lib/task-id-allocator.mjs`.
3. Compute `slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task"`.
4. Write `docs/tasks/<NN>-<slug>.md` by rendering the full task template. The document must include the required task-ledger sections `Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, and `Verification`; include a `Handoff` section for Phase 6 updates.
5. Add the new task to `docs/tasks/index.md` under `Active` with a link to `docs/tasks/<NN>-<slug>.md`.
6. Validate the rendered task doc with `validateTaskDoc(text)` and abort if required sections are missing.
7. Stash `task = {path, title}` in state.

### Branch C — prompt + brainstormFirst true (default)

1. Invoke `Skill` with `superpowers:brainstorming` passing the prompt as `args`. Brainstorming will write its own design doc to `docs/superpowers/specs/`.
2. After it completes, locate the newest file under `docs/superpowers/specs/` (sort by mtime).
3. Read `docs/tasks/index.md` as `indexText` and list existing filenames under `docs/tasks/`.
4. Compute `nextN = allocateTaskId({ indexText, filenames, requestedId })`.
5. Compute `slug` from the prompt, falling back to the spec title, then to `task`.
6. Render `docs/tasks/<NN>-<slug>.md` from the full task template, using the brainstorm output to populate `Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, `Verification`, and `Handoff` instead of copying ad hoc markdown.
7. Add the new task to `docs/tasks/index.md` under `Active`.
8. Validate the rendered task doc with `validateTaskDoc(text)` and abort if required sections are missing.
9. Stash `task` in state.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output to user

Print: `Task ready: <task.path> ("<task.title>")`.
