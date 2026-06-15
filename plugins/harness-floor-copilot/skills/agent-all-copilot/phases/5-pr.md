# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Run full task ledger validation for `task.path`:
   ```javascript
   import { existsSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { validateTaskLedger } from "./lib/task-ledger.mjs";

   const taskRoot = task.path?.startsWith("docs/tasks/") ? "docs/tasks" : ".agent-skill/tasks";
   const indexText = existsSync(`${taskRoot}/index.md`)
     ? readFileSync(`${taskRoot}/index.md`, "utf8")
     : null;
   const taskText = existsSync(task.path)
     ? readFileSync(task.path, "utf8")
     : null;
   const result = validateTaskLedger({
     taskPath: task.path,
     taskText,
     indexText,
     templateExists: existsSync(`${taskRoot}/_template.md`),
     tasksDir: taskRoot,
     requireIdentity: !task.path?.startsWith("docs/tasks/"),
     taskExists: (activePath) => existsSync(resolve(process.cwd(), activePath)),
   });
   if (!result.ok) { /* print errors and abort before PR creation */ }
   ```
   Abort before branch creation, push, PR body rendering, or PR creation on
   missing index/template, missing Active tasks, required task sections,
   duplicate Active entries, or in-scope checkboxes that remain unchecked.
   The task ledger is the durable acceptance record; do not open a PR while
   it says scoped work is incomplete.

2. Compute slug: `slug = basename(task.path).replace(/^(?:\d+|T-\d{8}-\d{3}(?:-\d+)?)-/, "").replace(/\.md$/, "")`.
3. Branch: `branch = config.pr.branchPrefix + slug`.
4. Create or switch via `read_bash`:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
5. Push: `read_bash("git push -u origin '$branch'")`. If push fails: warn,
   push `{phase: 5, status: "pushed-locally"}`, continue.
6. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop, verifications, iter, cost). Use the harness-builder render lib. Then
   run `redactArtifactContent({ artifactPath: "PR body", content: rendered, config })`,
   append a redaction audit summary when findings exist, and abort before
   `gh pr create` if `assertRedactionAllowed` blocks. Use the redacted body for
   every shell command; never pass the raw body to GitHub.
7. Create PR via `read_bash`:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(prBody)"
   ```
   If `gh` missing: warn `gh missing — PR not created`, stash `prUrl: null`.
8. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
