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

1. When Phase 0 allowed first-task scaffold creation, create `docs/tasks/`, seed `docs/tasks/index.md`, and seed `docs/tasks/_template.md` from the operational task ledger template before reading the index. Use `plugins/harness-builder/skills/agent-init/templates/task-ledger/index.md.hbs` and `_template.md.hbs` as the source templates.
2. Read `docs/tasks/index.md` as `indexText` and list existing filenames under `docs/tasks/`.
3. Compute `nextN = allocateTaskId({ indexText, filenames, requestedId })` from `lib/task-id-allocator.mjs`.
4. Compute `slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "task"`.
5. Write `docs/tasks/<NN>-<slug>.md` by rendering the full task template. The document must include the required task-ledger sections `Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, and `Verification`; include a `Handoff` section for Phase 6 updates.
6. Add the new task to `docs/tasks/index.md` under `Active` with a link to `docs/tasks/<NN>-<slug>.md`.
7. Validate the rendered task doc with `validateTaskDoc(text)` and abort if required sections are missing.
8. Stash `task = {path, title}` in state.

### Branch C — prompt + brainstormFirst true (default)

**0. Orchestrator routing check (do this first).** Judge the deliverable against `references/orchestrator-routing.md`. If the intent is *evidence-producing* — research, an audit across many units, a design/findings report, with no durable code change yet — the built-in `Workflow` (ultracode) tool is the correct orchestrator, **not** `/agent-all`. In that case: recommend it to the user; if they agree, STOP this pipeline and instruct them to run a `Workflow` sweep that writes a `validateTaskDoc`-compliant task doc under `docs/tasks/`, then re-enter with `/agent-all <taskdoc> --no-brainstorm` (resumes at Branch A — no double-planning). Decide at this brainstorming-scale gauge; only continue to step 1 below when the deliverable is a durable, gated code change that ships as a PR.

1. Invoke `Skill` with `superpowers:brainstorming` passing the prompt as `args`. Brainstorming will write its own design doc to `docs/superpowers/specs/`.
2. After it completes, locate the newest file under `docs/superpowers/specs/` (sort by mtime).
3. When Phase 0 allowed first-task scaffold creation, create `docs/tasks/`, seed `docs/tasks/index.md`, and seed `docs/tasks/_template.md` from the operational task ledger template before reading the index. Use `plugins/harness-builder/skills/agent-init/templates/task-ledger/index.md.hbs` and `_template.md.hbs` as the source templates.
4. Read `docs/tasks/index.md` as `indexText` and list existing filenames under `docs/tasks/`.
5. Compute `nextN = allocateTaskId({ indexText, filenames, requestedId })`.
6. Compute `slug` from the prompt, falling back to the spec title, then to `task`.
7. Render `docs/tasks/<NN>-<slug>.md` from the full task template, using the brainstorm output to populate `Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`, `Progress Snapshot`, `Verification`, and `Handoff` instead of copying ad hoc markdown.
8. Add the new task to `docs/tasks/index.md` under `Active`.
9. Validate the rendered task doc with `validateTaskDoc(text)` and abort if required sections are missing.
10. Stash `task` in state.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output to user

Print: `Task ready: <task.path> ("<task.title>")`.
