# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Run full task ledger validation for `task.path`:
   ```javascript
   import { validateTaskLedger } from "./lib/task-ledger.mjs";

   const taskRoot = task.path?.startsWith("docs/tasks/") ? "docs/tasks" : ".agent-skill/tasks";
   const indexText = /* read_file(`${taskRoot}/index.md`) or null if missing */;
   const taskText = /* read_file(task.path) or null if missing */;
   const result = validateTaskLedger({
     taskPath: task.path,
     taskText,
     indexText,
     templateExists: /* check_file_exists(`${taskRoot}/_template.md`) */,
     tasksDir: taskRoot,
     requireIdentity: !task.path?.startsWith("docs/tasks/"),
     taskExists: (activePath) => /* check_file_exists(activePath) */,
   });
   if (!result.ok) { /* print each error and ABORT before PR creation */ }
   ```
   **ABORT before branch creation, push, PR body rendering, or `gh pr create`**
   on missing index/template, missing Active tasks, required task sections
   (`Goal`, `Acceptance`, `Phases`, `Decision Matrix`, `Ambiguity Log`,
   `Progress Snapshot`, `Verification`, `Cost Telemetry`), duplicate Active
   entries, or in-scope checkboxes that remain unchecked. The task ledger is
   the durable acceptance record; do not open a PR while it says scoped work
   is incomplete. `lib/task-ledger.mjs` is vendored into this port — use it.

2. Compute slug: `slug = basename(task.path).replace(/^(?:\d+|T-\d{8}-\d{3}(?:-\d+)?)-/, "").replace(/\.md$/, "")`.
3. Branch: `branch = config.pr.branchPrefix + slug`.
4. Create or switch via `run_shell_command`:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
5. Push: `run_shell_command("git push -u origin '$branch'", { timeout: 300 })`. If
   push fails: warn, push `{phase: 5, status: "pushed-locally"}`, continue.
6. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop, verifications, iter, cost). Use the harness-builder render lib. Then
   run `redactArtifactContent({ artifactPath: "PR body", content: rendered, config })`,
   append a redaction audit summary when findings exist, and abort before
   `gh pr create` if `assertRedactionAllowed` blocks. Use the redacted body for
   every shell command; never pass the raw body to GitHub.
7. Create PR via `run_shell_command`:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(prBody)"
   ```
   If `gh` missing: warn `gh missing — PR not created`, stash `prUrl: null`.
8. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
