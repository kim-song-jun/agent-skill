# Phase 2 — CLAUDE.md

## Inputs

- `discovery` from Phase 1 (`purpose`, `stack`, `deploy_targets`, `constraints`)
- `size`, `qa_personas` (drives the `agents` array passed to the template)
- `operationalProfile`, `liteProfile`, `theme`, `floorTheme`, `degradedFoundations`, and `local_guides` from Phase 1

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

2. If `operationalProfile` is true, add the operational roles required for task-ledger work and review gates (`orchestrator`, `integration-dev`, `verification-reviewer`, `qa-reviewer`, `design-reviewer`, `security-reviewer`, `data-reviewer`) unless already present. Lite mode keeps only the size/persona roster above.
3. Read `templates/CLAUDE.md.hbs`.
4. Render root `CLAUDE.md` with `render(tpl, { ...discovery, agents, operationalProfile: !liteProfile, liteProfile, theme, floorTheme, degradedFoundations })`.
5. If `--dry-run` is set, print the planned root files and local guide files for this phase without writing:
   - Root files: `CLAUDE.md`.
   - Local guide files: every operational `local_guides[]` target that would receive `CLAUDE.md`.
   - Note whether each target would be created, sentinel-merged, or force-refreshed.
   - Record the phase plan for the Phase 5 summary, then continue without writing files or updating `.claude/.agent-init-state.json`.
6. Write `CLAUDE.md` at project root.
   - If the file exists, use `mergeSentinelSection` for existing `CLAUDE.md`; never overwrite user-owned content outside sentinel markers.
   - If the file does not exist, write the rendered content.
   - `--force` may replace generated files, but still preserve user-owned content outside sentinel markers when sentinel markers are present.
7. When operational, render `templates/local-guides/CLAUDE.md.hbs` for every `local_guides[]` entry. Use `mergeSentinelSection` when a local guide already exists.
8. Push `{ "phase": 2, "completedAt": "<iso>" }` onto `phases` in `.agent-init-state.json`.

## Output to user

Print: `CLAUDE.md written (N lines)`.
