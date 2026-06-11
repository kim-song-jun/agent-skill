# Phase 2 — Plan

## Steps

1. The coordinator drafts a plan from `task.path` directly into
   `.agent-skill/plans/<YYYY-MM-DD>-<slug>.md` via `apply_patch`. Plan
   format same as Claude port:
   - One `# <Plan title>` heading.
   - `## Context`, `## Goals`, `## Non-goals`.
   - `## Task list` with `### Task N: <title>` headings.
   - Each task lists `Files to create/modify` and `Verification steps`.

2. Persist the plan summary to `store_memory` so dispatched `task` subagents
   in Phase 3 can read it without a file round-trip:
   ```
   store_memory(
     key="agent-all/plan",
     scope="repository",
     value=JSON.stringify({path, title, taskCount, waves}),
   )
   ```

3. Stash `plan = {path, title}` in state. If no plan file produced: abort
   with `plan drafting failed`.

4. Push `{phase: 2, completedAt}` to `phases`.

## Output

Print: `Plan written: <plan.path>. Memory key: agent-all/plan.`
