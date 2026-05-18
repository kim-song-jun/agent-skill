# Phase 2 — Plan

## Steps

1. The coordinator drafts a plan from `task.path` directly into
   `docs/superpowers/plans/<YYYY-MM-DD>-<slug>.md`. The plan format mirrors
   `superpowers:writing-plans`:
   - One `# <Plan title>` heading.
   - `## Context`, `## Goals`, `## Non-goals` sections.
   - `## Task list` containing numbered `### Task N: <title>` headings.
   - Each task lists `Files to create/modify` and `Verification steps`.

2. If `.cursor/agents/agent-all-planner.md` exists (future expansion), the
   coordinator may delegate plan drafting to that subagent instead. The
   default kit does not ship a planner agent — the coordinator does the
   drafting itself.

3. Stash `plan = {path, title}` in state. If no plan file was produced:
   abort with `plan drafting failed — coordinator wrote no file`.

4. Push `{phase: 2, completedAt}` to `phases`.

## Output

Print: `Plan written: <plan.path>`.
