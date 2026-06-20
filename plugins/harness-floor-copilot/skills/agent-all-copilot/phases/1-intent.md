# Phase 1 — Intent

## Branches

### Branch A — `taskPath` exists OR `state.iter > 0`

Skip brainstorming. Use the existing `.agent-skill/tasks/<display-id>-<slug>.md`.
Read identity frontmatter when present and stash `task = {id, displayId, path,
title}` (title from first `#` heading). Legacy `docs/tasks/<N>-<slug>.md`
remains readable during migration.

### Branch B — `prompt` with `--no-brainstorm` OR `config.defaults.brainstormFirst === false`

Write the prompt verbatim to a new file via `create` / `edit`:
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
design/findings report, with no durable code change yet — the `task` tool
fan-out is the correct orchestrator, **not** `/agent-all`. In that
case: recommend it to the user; if they agree, STOP this pipeline and
instruct them to run a `task`-dispatched sweep that writes a
`validateTaskDoc`-compliant task doc under `.agent-skill/tasks/`, then
re-enter with `/agent-all <taskdoc> --no-brainstorm` (resumes at
Branch A — no double-planning). Only continue to step 1 below when the
deliverable is a durable, gated code change that ships as a PR.

Copilot has no `superpowers:brainstorming` skill. The coordinator runs a
structured Q&A in chat with the user:

1. Prompt: "What's the user problem?" — capture via `ask_user` or chat input.
2. Prompt: "Constraints?" — capture.
3. Prompt: "Options + tradeoffs?" — coordinator drafts 2-3 options.
4. Prompt: "Chosen direction?" — capture.
5. Synthesize via `create` / `edit` into `.agent-skill/specs/<date>-<slug>.md`.
6. Allocate canonical/display ids, reserve the registry entry with `recordTask()`,
   then copy the spec into the reserved `.agent-skill/tasks/<display-id>-<slug>.md`
   with identity frontmatter. Write the task doc and updated task index through
   `writeTaskDocArtifact()`.
7. Persist a summary into `.agent-all-state.json` and the generated task doc.

If the user prefers a non-interactive brainstorm, pass `--no-brainstorm` to
skip this branch.

## All branches

Push `{phase: 1, completedAt}` to `phases` via `edit`.

## Output

Print: `Task ready: <task.path> ("<task.title>")`.
