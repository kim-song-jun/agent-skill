# Phase 2 — Plan

## Inputs (from state)

- `task.path`

## Steps

1. Invoke `Skill` with `superpowers:writing-plans` passing `task.path` as `args`.

2. writing-plans saves its output to `.agent-skill/plans/<date>-<slug>.md` by default; legacy `docs/superpowers/plans/<date>-<slug>.md` plans remain readable during migration. Capture that path. If writing-plans returns without a written file, abort with `writing-plans produced no plan file`.

3. Stash `plan = {path, title}` in state (title from first `#` of the plan file).

4. Push `{phase: 2, completedAt}` to `phases`.

## Output to user

Print: `Plan written: <plan.path>`.
