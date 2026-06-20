# Phase 1 — Intent

## Branches

### Branch A — `taskPath` exists OR `state.iter > 0`

Skip brainstorming. Use the existing `.agent-skill/tasks/<display-id>-<slug>.md`.
Read identity frontmatter when present and stash `task = {id, displayId, path,
title}` (title from first `#` heading). Legacy `docs/tasks/<N>-<slug>.md`
remains readable during migration.

### Branch B — `prompt` with `--no-brainstorm` OR `config.defaults.brainstormFirst === false`

Write the prompt verbatim via `write_file`:
1. Read `.agent-skill/tasks/index.md`, filenames under `.agent-skill/tasks/`,
   and `.agent-skill/registry/tasks.json` when present.
2. Slug from prompt: lowercase, non-alphanum → `-`, max 40 chars.
3. Allocate identity via `lib/task-id-allocator.mjs`, producing canonical
   `AS-TASK-<ULID>` plus display id `T-YYYYMMDD-NNN` with collision suffixing.
4. Reserve `.agent-skill/registry/tasks.json` via `recordTask()` from
   `lib/task-registry.mjs`. Registry writes use a lock plus atomic rename; if
   another session already claimed the display id, use the returned suffixed
   `display_id` and rewritten task path.
5. Write the reserved `.agent-skill/tasks/<display-id>-<slug>.md` with identity
   frontmatter and the required task-ledger sections via `writeTaskDocArtifact()`
   from `lib/task-doc-writer.mjs`; abort before storage if redaction blocks.
   Then add the task to `.agent-skill/tasks/index.md` and write the updated index
   through `writeTaskDocArtifact()`.
6. Stash `task = {id, displayId, path, title}` in state.

### Branch C — `prompt` with brainstormFirst true (default)

**0. Orchestrator routing check (do this first).** Judge the deliverable
against `references/orchestrator-routing.md`. If the intent is
*evidence-producing* — research, an audit across many units, a
design/findings report, with no durable code change yet — a parallel
Gemini headless fan-out sweep is the correct orchestrator, **not**
`/agent-all`. In that case: recommend it to the user; if they agree,
STOP this pipeline and instruct them to run a fan-out sweep that writes a
`validateTaskDoc`-compliant task doc under `.agent-skill/tasks/`, then
re-enter with `/agent-all <taskdoc> --no-brainstorm` (resumes at
Branch A — no double-planning). Decide at this brainstorming-scale gauge;
only continue to step 1 below when the deliverable is a durable, gated code
change that ships as a PR.

Gemini has no `superpowers:brainstorming` equivalent. The coordinator runs
a structured Q&A using `ask_user`:

1. `ask_user("What's the user problem?")` — capture.
2. `ask_user("Constraints?")` — capture.
3. Coordinator drafts 2-3 options.
4. `ask_user("Chosen direction (1/2/3)?")` — capture selection.
5. Synthesize via `write_file` into `.agent-skill/specs/<date>-<slug>.md`.
6. Allocate canonical/display ids, reserve the registry entry with `recordTask()`,
   then copy the spec into the reserved `.agent-skill/tasks/<display-id>-<slug>.md`
   with identity frontmatter. Write the task doc and updated task index through
   `writeTaskDocArtifact()`.

If `ask_user` not supported in the current Gemini session, fall back to
direct chat prompts.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output

Print: `Task ready: <task.path> ("<task.title>")`.
