# Phase 2 — Plan

## Steps

1. The coordinator drafts a plan from `task.path` into
   `docs/superpowers/plans/<YYYY-MM-DD>-<slug>.md` via `apply_patch`.
   Plan format same as Claude port:
   - `# <Plan title>` heading.
   - `## Context`, `## Goals`, `## Non-goals`.
   - `## Task list` with `### Task N: <title>` headings.
   - Each task lists `Files to create/modify`, `role:`, `Verification steps`.

2. Stash `plan = {path, title}` in state. If no plan file produced: abort
   with `plan drafting failed`.

3. Push `{phase: 2, completedAt}` to `phases`.

## Output

Print: `Plan written: <plan.path>`.
