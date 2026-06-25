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
    **Token-aware: the outcome prose is authored by the same cheap wiki-scribe model,
    not the main thread.**
    a. **Mechanical prep (orchestrator, ~0 model tokens):**
    ```javascript
    import { findOrCreatePage, readPage, writePage, compile } from "./lib/wiki-log.mjs";
    if (config.wiki?.auto) {
      const target = findOrCreatePage(".wiki", task.title);
      const prior = readPage(".wiki", target.slug);   // the plan-capture page to merge into
    ```
    b. **Delegate authoring (Task subagent, `model: config.wiki.model`, default `haiku`).**
    > `description`: `Update wiki page: <task.title>`
    > `model`: `config.wiki.model`
    > `prompt`: "Concise wiki scribe. The recorded plan page is below; the shipped outcome is
    > `<changed-file map + verification verdict + PR>`. Return JSON `{ bluf: <what shipped, ≤1 sentence>,
    > details: <what was built + file map + verdict>, contradictions: <if the outcome reverses a decision
    > in the page, BOTH sides; else ''> }`. Recorded page:\n`<prior.content>`"
    c. **Persist + compile gate (orchestrator, install-safe context):**
    ```javascript
      const authored = /* scribe's returned { bluf, details, contradictions } */;
      const res = writePage(".wiki", {
        title: task.title, slug: target.slug, grade: "B", tags: [],   // C→B: now backed by shipped code
        bluf: authored.bluf, details: authored.details, contradictions: authored.contradictions,
        sources: [`task: ${task.path}`, `plan: ${plan.path}`, ...(prUrl ? [`PR: ${prUrl}`] : [])],
      });
      if (!res.ok) console.warn(`wiki outcome skipped: ${res.error}`);
      const audit = compile(".wiki");   // compile gate (non-fatal): warn on drift, never abort
      if (audit.ok && !audit.audit.ok) console.warn(`wiki drift after write: index-only=${audit.audit.indexOnly?.join(",")} pages-only=${audit.audit.pagesOnly?.join(",")}`);
    }
    ```
    Cross-link rides in `sources` (task id + PR url). The scribe (cheap model)
    authors; `writePage` runs here in skill context (install-safe) and re-grades C→B.

11. **Emit a run-record** (feeds the evolution loop). After the gate passes,
    record this run's scaffold + outcome so `/agent-init` can learn from it:

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/../../../scripts/emit-run-record.mjs" \
      --run-id="<runId>" --category="<taskCategory>" --passed=<true|false> \
      --iterations=<N> --roles-invoked="<comma-separated roles actually dispatched this run>"
    ```

    `rolesActuallyInvoked` = the role agents you actually dispatched in Phase 3
    (not the full scaffolded roster). This is the delta the actuator learns from.

## Output to user

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>` plus, when `config.wiki.auto`, `Wiki: updated .wiki/<slug>.md (outcome, grade B)`.
