# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `git rev-parse --git-dir` exit 0.
2. Validate the positional task path:
   - Must be a readable Markdown file.
   - Expected form is `.agent-skill/tasks/<NN>-<slug>.md`; legacy
     `docs/tasks/<NN>-<slug>.md` remains accepted during migration. Other
     Markdown paths are allowed only when the user explicitly passes them.
3. Resolve output artifacts with `handoffPathsForTask(taskPath)`:
   - `.agent-skill/handoff/<NN>-<slug>.handoff.md`
   - `.agent-skill/handoff/<NN>-<slug>.session.md`
4. Parse flags:
   - `--dry-run` prints content only.
   - `--strict` requires all task-ledger sections but permits unfinished
     checklist items.
   - `--yes` or non-TTY mode auto-selects the recommended next action through
     the shared `agent-interaction/v1` resolver.
5. Do not require a clean worktree. This command exists to capture in-progress
   state before a session handoff.

## Output

Print `Preflight OK. task=<path> dryRun=<bool> strict=<bool> nonTTY=<bool>`.
