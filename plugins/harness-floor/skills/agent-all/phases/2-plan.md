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
   Non-fatal: a wiki failure NEVER fails the run (warn + continue). **Token-aware:
   the prose AUTHORING is delegated to a cheap model so it never costs main-thread
   tokens (the lib mechanics are free code).**
   a. **Mechanical prep (orchestrator, ~0 model tokens):**
   ```javascript
   import { ensureWiki, findOrCreatePage } from "./lib/wiki-log.mjs";
   if (config.wiki?.auto) {
     const ready = ensureWiki(".wiki");
     if (ready.ok && ready.created) console.log("started a project wiki at .wiki/ — disable with --no-wiki");
     const target = findOrCreatePage(".wiki", task.title);   // topic-merge slug
   ```
   b. **Delegate authoring to a wiki-scribe subagent (Task, `model: config.wiki.model`, default `haiku`).**
   The scribe reads the plan and returns ONLY the page prose `{ bluf, details, contradictions }`
   — its reasoning stays in its own context, off the expensive main thread. Dispatch:
   > `description`: `Write wiki page: <task.title>`
   > `model`: `config.wiki.model` (default `haiku`)
   > `prompt`: "You are a concise wiki scribe. Read the plan at `<plan.path>`. Return JSON
   > `{ bluf: <≤1 sentence>, details: <approach + key decisions, with rationale>, contradictions: <if this reverses a prior decision on the page, both sides; else ''> }`. No prose outside the JSON."
   c. **Persist (orchestrator, in skill context — keeps the lib call install-safe):**
   ```javascript
     const authored = /* the scribe's returned { bluf, details, contradictions } */;
     const res = writePage(".wiki", {
       title: task.title, slug: target.slug, grade: "C", tags: [],
       bluf: authored.bluf, details: authored.details, contradictions: target.existed ? authored.contradictions : "",
       sources: [`task: ${task.path}`, `plan: ${plan.path}`],
     });
     if (!res.ok) console.warn(`wiki plan-capture skipped: ${res.error}`);
   }
   ```
   (`writePage` runs HERE, in the skill's own context, so its `./lib` import stays
   install-anchored — the scribe never touches the lib path.)
   The scribe (not the main thread) authors the prose; `writePage` only writes the
   file + index row. Keep `slug` = `target.slug` so Phase 5 updates the SAME page.

## Output to user

Print: `Plan written: <plan.path>` plus, when `config.wiki.auto`, `Wiki: recorded plan → .wiki/<slug>.md`.
