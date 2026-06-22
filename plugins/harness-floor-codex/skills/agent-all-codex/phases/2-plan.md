# Phase 2 — Plan

## Steps

1. The coordinator drafts a plan from `task.path` into
   `.agent-skill/plans/<YYYY-MM-DD>-<slug>.md` via `apply_patch`.
   Plan format same as Claude port:
   - `# <Plan title>` heading.
   - `## Context`, `## Goals`, `## Non-goals`.
   - `## Task list` with `### Task N: <title>` headings.
   - Each task lists `Files to create/modify`, `role:`, `Verification steps`.
   - Select `role:` from the installed Codex skills. Prefer
     `frontend-dev` for UI/client work, `backend-dev` for API/server/data
     work, `integration-dev` for cross-stack contract work, and `dev` only
     for generic or ambiguous implementation.

2. Stash `plan = {path, title}` in state. If no plan file produced: abort
   with `plan drafting failed`.

3. Push `{phase: 2, completedAt}` to `phases`.

4. **Wiki plan-capture (if `config.wiki.auto`).** Record the plan + decisions
   (the *write* half of the auto-loop, first pass). Non-fatal: warn + continue.
   ```javascript
   import { ensureWiki, findOrCreatePage, writePage } from "./.codex/skills/agent-all/lib/wiki-log.mjs";
   if (config.wiki?.auto) {
     const ready = ensureWiki(".wiki");
     if (ready.ok && ready.created) console.log("started a project wiki at .wiki/ — disable with --no-wiki");
     const target = findOrCreatePage(".wiki", task.title);
     const res = writePage(".wiki", {
       title: task.title, slug: target.slug, grade: "C", tags: [],
       bluf: "<one-sentence plan summary>",
       details: "<the plan: approach + key decisions, with rationale>",
       contradictions: target.existed ? "<note any decision that reverses a prior one>" : "",
       sources: [`task: ${task.path}`, `plan: ${plan.path}`],
     });
     if (!res.ok) console.warn(`wiki plan-capture skipped: ${res.error}`);
   }
   ```
   Keep `slug` = `target.slug` so Phase 5 updates the SAME page.

## Output

Print: `Plan written: <plan.path>` plus, when `config.wiki.auto`, `Wiki: recorded plan → .wiki/<slug>.md`.
