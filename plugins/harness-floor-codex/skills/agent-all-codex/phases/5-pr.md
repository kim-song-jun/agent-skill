# Phase 5 — PR

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip. Push
`{phase: 5, status: "skipped"}`.

## Steps

1. Run full task ledger validation for `task.path` (ABORT before branch,
   push, PR body render, or PR creation on any failure):
   ```javascript
   import { existsSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { validateTaskLedger } from "./.codex/skills/agent-all/lib/task-ledger.mjs";

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
   if (!result.ok) { /* print each error and abort before branch creation */ }
   ```
   Abort on: missing index or template, missing Active tasks, required task
   sections absent, duplicate Active entries, or in-scope checkboxes that
   remain unchecked. The task ledger is the durable acceptance record; do not
   open a PR while it says scoped work is incomplete.

2. Compute slug: `slug = basename(task.path).replace(/^(?:\d+|T-\d{8}-\d{3}(?:-\d+)?)-/, "").replace(/\.md$/, "")`.
3. Branch: `branch = config.pr.branchPrefix + slug`.
4. Create or switch via `shell_command`:
   ```bash
   git rev-parse --verify "$branch" 2>/dev/null && git checkout "$branch" || git checkout -b "$branch"
   ```
5. Push: `shell_command("git push -u origin '$branch'", { timeout: 300 })`. If
   push fails: warn, push `{phase: 5, status: "pushed-locally"}`, continue.
6. Render `templates/pr-body.md.hbs` with PR context (waves, plan, task,
   loop, verifications, iter, cost). Use the harness-builder render lib. Then
   run `redactArtifactContent({ artifactPath: "PR body", content: rendered, config })`,
   append a redaction audit summary when findings exist, and abort before
   `gh pr create` if `assertRedactionAllowed` blocks. Use the redacted body for
   every shell command; never pass the raw body to GitHub.
7. Create PR via `shell_command`:
   ```bash
   gh pr create --base <baseBranch> --title "<task.title>" --body "$(prBody)"
   ```
   If `gh` missing: warn `gh missing — PR not created`, stash `prUrl: null`.
8. Stash `prUrl` in state. Push `{phase: 5, completedAt}`.

9. **Wiki outcome (if `config.wiki.auto`).** Update the page Phase 2 created with
   what shipped (the *write* half, final pass). Non-fatal.
   ```javascript
   import { findOrCreatePage, readPage, writePage, compile } from "./.codex/skills/agent-all/lib/wiki-log.mjs";
   if (config.wiki?.auto) {
     const target = findOrCreatePage(".wiki", task.title);
     const prior = readPage(".wiki", target.slug);
     const res = writePage(".wiki", {
       title: task.title, slug: target.slug, grade: "B", tags: [],
       bluf: "<one-sentence: what shipped>",
       details: "<outcome: what was built + changed-file map + verification verdict>",
       contradictions: "<if the outcome diverged from the recorded plan, record both sides>",
       sources: [`task: ${task.path}`, `plan: ${plan.path}`, ...(prUrl ? [`PR: ${prUrl}`] : [])],
     });
     if (!res.ok) console.warn(`wiki outcome skipped: ${res.error}`);
     const audit = compile(".wiki");   // compile gate (non-fatal): warn on drift, never abort
     if (audit.ok && !audit.audit.ok) console.warn(`wiki drift after write: index-only=${audit.audit.indexOnly?.join(",")} pages-only=${audit.audit.pagesOnly?.join(",")}`);
   }
   ```

## Output

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>` plus, when `config.wiki.auto`, `Wiki: updated .wiki/<slug>.md (outcome, grade B)`.
