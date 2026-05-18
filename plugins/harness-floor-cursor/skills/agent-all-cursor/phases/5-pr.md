# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Compute slug from task path: `slug = basename(task.path).replace(/^\d+-/, "").replace(/\.md$/, "")`.
2. Branch: `branch = config.pr.branchPrefix + slug`.
3. Create or switch to branch:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
4. Push: `git push -u origin "$branch"`. If push fails (network/auth):
   warn, push `{phase: 5, status: "pushed-locally"}`, continue.
5. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop break condition, testsPass, reviewClean, iter, cost).
6. Create PR:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(rendered)"
   ```
   If `gh` missing or unauthenticated: warn `gh missing — PR not created`,
   stash `prUrl: null`, continue.
7. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

## Cursor-specific

The coordinator runs `git` and `gh` through Cursor's shell tool. If the
workspace has no terminal access (rare; Cursor allows it by default), it
emits the commands as a shell snippet for the user to run manually and
waits for the user to paste back the PR URL.

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
