# Phase 2 — CLAUDE.md

## Inputs

- `discovery` from Phase 1 (`purpose`, `stack`, `deploy_targets`, `constraints`)
- `size`, `qa_personas` (drives the `agents` array passed to the template)

## Steps

1. Compute the agents array based on `size` and `qa_personas`:
   - `small`: `[planner, dev, reviewer]`
   - `medium`: + `designer, qa-{persona}…, tester`
   - `large`: + `frontend-dev, backend-dev, doc-writer`

   Build entries: `{ name, when }`. Use these `when` strings:
   | name | when |
   |------|------|
   | planner | "decompose a request into a plan" |
   | dev | "implement a feature/bugfix via TDD" |
   | designer | "produce UI mockups or component designs" |
   | qa-{persona} | "validate the {persona} flow end-to-end" |
   | tester | "run automated suites and report failures" |
   | reviewer | "review against the spec before merging" |
   | frontend-dev | "implement frontend code" |
   | backend-dev | "implement backend code or migrations" |
   | doc-writer | "produce user-facing or API documentation" |

2. Read `templates/CLAUDE.md.hbs`.
3. Render with `render(tpl, { ...discovery, agents })`.
4. Write `CLAUDE.md` at project root.
   - If `--merge` and the file exists: append `\n\n---\n\n## Harness\n\n<rendered content>` instead of overwriting.
5. Push `{ "phase": 2, "completedAt": "<iso>" }` onto `phases` in `.agent-init-state.json`.

## Output to user

Print: `CLAUDE.md written (N lines)`.
