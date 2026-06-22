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
   Abort before branch creation, push, PR body rendering, or PR creation on missing index/template, missing Active tasks, required task sections, duplicate Active entries, or in-scope checkboxes that remain unchecked. The task ledger is the durable acceptance record; do not open a PR while it says scoped work is incomplete.

2. Compute slug from task path: `slug = basename(task.path).replace(/^(?:\d+|T-\d{8}-\d{3}(?:-\d+)?)-/, "").replace(/\.md$/, "")`.

3. Branch name: `branch = config.pr.branchPrefix + slug`.

4. Create or switch to branch:
   ```bash
   git rev-parse --verify <branch> 2>/dev/null && git checkout <branch> || git checkout -b <branch>
   ```

5. Push branch:
   ```bash
   git push -u origin <branch>
   ```
   If push fails (network, auth): warn and skip the next step; phase still pushes `{phase: 5, status: "pushed-locally"}`.

6. Compute PR body context:
   ```javascript
   const ctx = {
     task, plan,
     waves: state.waves.map(w => ({ status: w.status, tasks: w.tasks })),
     loop: { breakCondition: config.loop.breakCondition },
     breakConditionPassed: state.lastBreakConditionExit === 0,
     testsPass: state.waves.every(w => w.status === "completed"),
     reviewClean: state.waves.every(w => !w.gateVerdict?.issues?.some(i => i.severity === "critical")),
     iter: state.iter,
     maxIter: Object.hasOwn(config.loop ?? {}, "maxIter") ? config.loop.maxIter : config.defaults.maxIter,
     maxIterLabel: (Object.hasOwn(config.loop ?? {}, "maxIter") && (config.loop.maxIter == null || config.loop.maxIter === 0))
       ? "unlimited"
       : String(Object.hasOwn(config.loop ?? {}, "maxIter") ? config.loop.maxIter : config.defaults.maxIter),
     costUSD: state.costUSD?.toFixed(2) ?? "0.00", maxCostUSD: config.defaults.maxCostUSD,
   };
   ```

7. Render `templates/pr-body.md.hbs` with `ctx` using the skill-bundled
   `lib/render.mjs` (vendored from harness-builder; do not reach into another
   plugin's install dir). Before writing, shelling, or sending the body to
   GitHub, run the control-plane redaction gate:
   ```javascript
   import { assertRedactionAllowed, redactArtifactContent } from "./lib/security/artifact-redactor.mjs";
   import { writeRedactionAudit } from "./lib/security/redact-report-writer.mjs";

   const checked = redactArtifactContent({
     artifactPath: "PR body",
     content: rendered,
     config,
   });
   writeRedactionAudit({
     cwd: process.cwd(),
     runId: state.runId ?? "agent-all",
     config,
     artifactPath: "PR body",
     findings: checked.findings,
   });
   assertRedactionAllowed(checked);
   const prBody = checked.content;
   ```
   A high-severity secret/privacy candidate aborts before the PR body is
   written, shelled, or sent to GitHub; medium findings are masked and
   summarized without storing the original value.

8. Create PR:
   ```bash
   gh pr create --base <config.pr.baseBranch> --title "<task.title>" --body "$(prBody)"
   ```
   Capture URL. If `gh` not installed / unauth: warn `gh missing — PR not created`, stash `prUrl: null`, continue.

9. Stash `prUrl` in state. Push `{phase: 5, completedAt}` to `phases`.

10. **Wiki outcome (if `config.wiki.auto`).** Update the page Phase 2 created with
    what actually shipped — the *write* half of the auto-loop, final pass. Non-fatal.
    ```javascript
    import { findOrCreatePage, readPage, writePage, compile } from "./lib/wiki-log.mjs";
    if (config.wiki?.auto) {
      const target = findOrCreatePage(".wiki", task.title);
      const prior = readPage(".wiki", target.slug);          // read the plan-capture page to merge into
      // CONTRADICTION DETECTION: if the shipped outcome reverses a decision recorded
      // in `prior.content`, append BOTH (old + new) to contradictions — never overwrite.
      const res = writePage(".wiki", {
        title: task.title,
        slug: target.slug,
        grade: "B",                  // promoted C→B: now backed by shipped code
        tags: [],
        bluf: "<one-sentence: what shipped>",
        details: "<outcome: what was built + the changed-file map + the verification verdict>",
        contradictions: "<if the outcome diverged from the recorded plan/decision, record both sides here>",
        sources: [`task: ${task.path}`, `plan: ${plan.path}`, ...(prUrl ? [`PR: ${prUrl}`] : [])],
        related: [],
      });
      if (!res.ok) console.warn(`wiki outcome skipped: ${res.error}`);
      // COMPILE GATE (non-fatal): index↔pages must match (diff=0). Warn on drift; never abort.
      const audit = compile(".wiki");
      if (audit.ok && !audit.audit.ok) {
        console.warn(`wiki drift after write: index-only=${audit.audit.indexOnly?.join(",")} pages-only=${audit.audit.pagesOnly?.join(",")}`);
      }
    }
    ```
    Cross-link is carried in `sources` (task id + PR url). Author the prose; the
    helper writes the file + upserts the index row + re-grades C→B in place.

## Output to user

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>` plus, when `config.wiki.auto`, `Wiki: updated .wiki/<slug>.md (outcome, grade B)`.
