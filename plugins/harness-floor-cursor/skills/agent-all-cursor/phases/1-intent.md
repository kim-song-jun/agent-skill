# Phase 1 — Intent

## Branches

### Branch A — `taskPath` exists OR `state.iter > 0`

Skip brainstorming. Use the existing `.agent-skill/tasks/<display-id>-<slug>.md`
as the task. Read identity frontmatter when present and stash
`task = {id, displayId, path, title}` (title from first `#` heading). Legacy
`docs/tasks/<N>-<slug>.md` remains readable during migration.

### Branch B — `prompt` with `--no-brainstorm` OR `config.defaults.brainstormFirst === false`

Write the prompt verbatim to a new file:
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

**0. Orchestrator routing check (do this first).** Judge the deliverable against
`references/orchestrator-routing.md`. If the intent is *evidence-producing* —
research, an audit across many units, a design/findings report, with no durable
code change yet — Cursor's built-in background-agent fan-out is the correct
mechanism, **not** `/agent-all`. In that case: recommend it to the user;
if they agree, STOP this pipeline and instruct them to run a background fan-out
sweep that writes a `validateTaskDoc`-compliant task doc under
`.agent-skill/tasks/`, then re-enter `/agent-all` passing
`<taskdoc> --no-brainstorm` (resumes at Branch A — no double-planning). Only
continue to step 1 below when the deliverable is a durable, gated code change
that ships as a PR.

Cursor has no programmatic brainstorming skill. The coordinator instead
opens a structured Q&A in chat using the same axes as
`superpowers:brainstorming` (problem → constraints → options → tradeoffs →
chosen direction). When the user accepts the direction, write the synthesis
to `.agent-skill/specs/<date>-<slug>.md`, then allocate canonical/display ids,
reserve the registry entry with `recordTask()`, and copy to the reserved
`.agent-skill/tasks/<display-id>-<slug>.md`, writing the task doc and updated
task index through `writeTaskDocArtifact()`.

If the workspace has `harness-floor` (Claude Code) installed in parallel,
the coordinator may instead instruct the user to run
`@superpowers:brainstorming` and paste back the spec path.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output

Print: `Task ready: <task.path> ("<task.title>")`.
