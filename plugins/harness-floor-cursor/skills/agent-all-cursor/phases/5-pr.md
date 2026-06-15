# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Run full task ledger validation for `task.path` using `validateTaskLedger`
   from `lib/task-ledger.mjs`:

   ```javascript
   import { validateTaskLedger } from "./lib/task-ledger.mjs";

   const taskRoot = task.path?.startsWith("docs/tasks/") ? "docs/tasks" : ".agent-skill/tasks";
   const indexText = /* read ${taskRoot}/index.md if it exists, else null */;
   const taskText  = /* read task.path if it exists, else null */;
   const result = validateTaskLedger({
     taskPath: task.path,
     taskText,
     indexText,
     templateExists: /* existsSync(`${taskRoot}/_template.md`) */,
     tasksDir: taskRoot,
     requireIdentity: !task.path?.startsWith("docs/tasks/"),
     taskExists: (activePath) => /* existsSync(resolve(cwd, activePath)) */,
   });
   if (!result.ok) { /* print each error and ABORT before PR creation */ }
   ```

   Abort before branch creation, push, PR body rendering, or `gh pr create`
   on any of: missing index/template, missing Active tasks, required task
   sections absent, duplicate Active entries, or in-scope checkboxes that
   remain unchecked. The task ledger is the durable acceptance record; do not
   open a PR while it says scoped work is incomplete.

   In Cursor, the coordinator runs this validation via the shell:
   ```bash
   node -e '
     import { validateTaskLedger } from "./.cursor/agent-all/lib/task-ledger.mjs";
     // ... read files and call validateTaskLedger as above ...
   '
   ```
   If the validation fails, print each error and stop — do not proceed to
   branch or push steps.

2. Compute slug from task path: `slug = basename(task.path).replace(/^(?:\d+|T-\d{8}-\d{3}(?:-\d+)?)-/, "").replace(/\.md$/, "")`.
3. Branch: `branch = config.pr.branchPrefix + slug`.
4. Create or switch to branch:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
5. Push: `git push -u origin "$branch"`. If push fails (network/auth):
   warn, push `{phase: 5, status: "pushed-locally"}`, continue.
6. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop break condition, testsPass, reviewClean, iter, cost). Then run
   `redactArtifactContent({ artifactPath: "PR body", content: rendered, config })`,
   append a redaction audit summary when findings exist, and abort before
   `gh pr create` if `assertRedactionAllowed` blocks. Use the redacted body for
   every shell command; never pass the raw body to GitHub.
7. Create PR:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(prBody)"
   ```
   If `gh` missing or unauthenticated: warn `gh missing — PR not created`,
   stash `prUrl: null`, continue.
8. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

## Cursor-specific

The coordinator runs `git` and `gh` through Cursor's shell tool. If the
workspace has no terminal access (rare; Cursor allows it by default), it
emits the commands as a shell snippet for the user to run manually and
waits for the user to paste back the PR URL.

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
