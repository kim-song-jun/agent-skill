# Phase 5 — PR

## Inputs (from state)

- `task.path`, `task.title`
- `plan.path`
- `state.waves[]`
- `config.pr.{branchPrefix, baseBranch}`
- `config.defaults.createPR`
- CLI `--no-pr`

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip Phase 5. Push `{phase: 5, status: "skipped"}` and exit phase.

## Steps

1. Compute slug from task path: `slug = basename(task.path).replace(/^\d+-/, "").replace(/\.md$/, "")`.

2. Branch name: `branch = config.pr.branchPrefix + slug`.

3. Create or switch to branch:
   ```bash
   git rev-parse --verify <branch> 2>/dev/null && git checkout <branch> || git checkout -b <branch>
   ```

4. Push branch:
   ```bash
   git push -u origin <branch>
   ```
   If push fails (network, auth): warn and skip the next step; phase still pushes `{phase: 5, status: "pushed-locally"}`.

5. Compute PR body context:
   ```javascript
   const ctx = {
     task, plan,
     waves: state.waves.map(w => ({ status: w.status, tasks: w.tasks })),
     loop: { breakCondition: config.loop.breakCondition },
     breakConditionPassed: state.lastBreakConditionExit === 0,
     testsPass: state.waves.every(w => w.status === "completed"),
     reviewClean: state.waves.every(w => !w.gateVerdict?.issues?.some(i => i.severity === "critical")),
     iter: state.iter, maxIter: config.defaults.maxIter,
     costUSD: state.costUSD?.toFixed(2) ?? "0.00", maxCostUSD: config.defaults.maxCostUSD,
   };
   ```

6. Render `templates/pr-body.md.hbs` with `ctx` using `plugins/harness-builder/skills/agent-init/lib/render.mjs`.

7. Run full task ledger validation for `task.path`:
   ```javascript
   import { existsSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { validateTaskLedger } from "./lib/task-ledger.mjs";

   const indexText = existsSync("docs/tasks/index.md")
     ? readFileSync("docs/tasks/index.md", "utf8")
     : null;
   const taskText = existsSync(task.path)
     ? readFileSync(task.path, "utf8")
     : null;
   const result = validateTaskLedger({
     taskPath: task.path,
     taskText,
     indexText,
     templateExists: existsSync("docs/tasks/_template.md"),
     taskExists: (activePath) => existsSync(resolve(process.cwd(), activePath)),
   });
   if (!result.ok) { /* print errors and abort before PR creation */ }
   ```
   Abort PR creation on missing index/template, missing Active tasks, required task sections, or in-scope checkboxes that remain unchecked. The task ledger is the durable acceptance record; do not open a PR while it says scoped work is incomplete.

8. Create PR:
   ```bash
   gh pr create --base <config.pr.baseBranch> --title "<task.title>" --body "$(rendered)"
   ```
   Capture URL. If `gh` not installed / unauth: warn `gh missing — PR not created`, stash `prUrl: null`, continue.

9. Stash `prUrl` in state. Push `{phase: 5, completedAt}` to `phases`.

## Output to user

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
