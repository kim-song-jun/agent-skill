# Phase 2 — Plan

## Inputs (from state)

- `task.path`

## Steps

1. Invoke `Skill` with `superpowers:writing-plans` passing `task.path` as `args`.

2. writing-plans saves its output to `.agent-skill/plans/<date>-<slug>.md` by default; legacy `docs/superpowers/plans/<date>-<slug>.md` plans remain readable during migration. Capture that path. If writing-plans returns without a written file, abort with `writing-plans produced no plan file`.

3. Stash `plan = {path, title}` in state (title from first `#` of the plan file).

4. Push `{phase: 2, completedAt}` to `phases`.

5. **Wiki plan-capture (if `config.wiki.auto`).** Record the plan + key design
   decisions to the project wiki — the *write* half of the auto-loop, first pass.
   This is non-fatal: a wiki failure NEVER fails the run (warn + continue).
   ```javascript
   import { ensureWiki, findOrCreatePage, writePage } from "./lib/wiki-log.mjs";
   if (config.wiki?.auto) {
     const ready = ensureWiki(".wiki");
     if (ready.ok && ready.created) {
       console.log("started a project wiki at .wiki/ — disable with --no-wiki");
     }
     // Topic-merge: accrete into the existing page for this area if one exists.
     const target = findOrCreatePage(".wiki", task.title);
     const res = writePage(".wiki", {
       title: task.title,
       slug: target.slug,
       grade: "C",                    // C: inferred/synthesised — promoted to B in Phase 5 once shipped
       tags: [],                      // optional: derive from the task domain
       bluf: "<one-sentence plan summary>",
       details: "<the plan: approach + the key decisions made in Phase 1/2, with rationale>",
       contradictions: target.existed ? "<note any decision here that reverses a prior one on this page>" : "",
       sources: [`task: ${task.path}`, `plan: ${plan.path}`],
     });
     if (!res.ok) console.warn(`wiki plan-capture skipped: ${res.error}`);
   }
   ```
   Author the BLUF/Details prose yourself from the plan; the helper only writes
   the file + index row. Keep `slug` = `target.slug` so Phase 5 updates the SAME page.

## Output to user

Print: `Plan written: <plan.path>` plus, when `config.wiki.auto`, `Wiki: recorded plan → .wiki/<slug>.md`.
