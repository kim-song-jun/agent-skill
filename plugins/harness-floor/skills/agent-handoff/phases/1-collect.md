# Phase 1 — Collect

## Steps

1. Read the task doc.
2. Use `extractTaskDoc({ taskPath, taskText, state })` to collect:
   - title
   - goal
   - completed checklist items
   - remaining checklist items
   - blockers
   - progress snapshot
   - verification evidence
3. Read `.agent-all-state.json` if present. Invalid JSON is ignored and noted
   as absent; do not attempt repair in this command.
4. Collect only safe git state with `readGitState()`:
   - `git branch --show-current`
   - `git status --short`
   - `git log --oneline -n 10`
5. Build next-action candidates. The recommended action is always
   `/agent-all <task> --resume`.

## Safety

Do not run `git reset`, reseed commands, commands containing `--apply`, or
`docker volume rm`. The rendered session prompt must list those as
`User approval required / 사용자 승인 필요`.
