# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Compute slug: `slug = basename(task.path).replace(/^\d+-/, "").replace(/\.md$/, "")`.
2. Branch: `branch = config.pr.branchPrefix + slug`.
3. Create or switch via `read_bash`:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
4. Push: `read_bash("git push -u origin '$branch'")`. If push fails: warn,
   push `{phase: 5, status: "pushed-locally"}`, continue.
5. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop, verifications, iter, cost). Use the harness-builder render lib.
6. Create PR via `read_bash`:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(rendered)"
   ```
   If `gh` missing: warn `gh missing — PR not created`, stash `prUrl: null`.
7. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
