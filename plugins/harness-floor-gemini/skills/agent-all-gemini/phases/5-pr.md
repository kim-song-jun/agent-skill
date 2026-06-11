# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Compute slug: `slug = basename(task.path).replace(/^\d+-/, "").replace(/\.md$/, "")`.
2. Branch: `branch = config.pr.branchPrefix + slug`.
3. Create or switch via `run_shell_command`:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
4. Push: `run_shell_command("git push -u origin '$branch'", { timeout: 300 })`. If
   push fails: warn, push `{phase: 5, status: "pushed-locally"}`, continue.
5. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop, verifications, iter, cost). Use the harness-builder render lib. Then
   run `redactArtifactContent({ artifactPath: "PR body", content: rendered, config })`,
   append a redaction audit summary when findings exist, and abort before
   `gh pr create` if `assertRedactionAllowed` blocks. Use the redacted body for
   every shell command; never pass the raw body to GitHub.
6. Create PR via `run_shell_command`:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(prBody)"
   ```
   If `gh` missing: warn `gh missing — PR not created`, stash `prUrl: null`.
7. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
