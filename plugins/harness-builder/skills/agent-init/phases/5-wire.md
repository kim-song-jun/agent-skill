# Phase 5 — Wire

## Steps

1. Re-read `plugin_scan` from `.agent-init-state.json`.
2. Compose a "missing plugins" report:

   For each plugin in `scan.missing`, print:
   ```
   - {plugin}
     /plugin marketplace add <git-url>   # if not already known
     /plugin install {plugin}
   ```

   For each plugin in `scan.disabled`:
   ```
   - {plugin}
     /plugin enable {plugin}
   ```

   If both arrays are empty: print "All required plugins are enabled."

3. Update `.gitignore`. If `.claude/.agent-init-state.json` is not already listed, append it. Idempotent.

4. Make sure `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/decisions/`, `docs/tasks/` exist. `mkdir -p` for each. Add a `.gitkeep` to each.

4a. **Theme resolution.** Determine theme:
    - If `--theme=lite` was passed: theme = `lite`. Skip steps 4b and 4c entirely.
    - Else if `--theme=floor` was passed OR no theme flag was passed: theme = `floor` (default). Continue to 4b and 4c.
    - Backwards compat: if `--visual-qa` was passed without `--theme=*`: render only `.visual-qa.json` (legacy behavior); skip 4c, do not set floorTheme.

4b. If theme is `floor` OR legacy `--visual-qa`: render `.visual-qa.json`.
    - Verify `harness-floor` plugin enabled. If not: print install command, continue (degraded).
    - Render `plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs` with `{baseUrl: "http://localhost:3000", model: "claude-sonnet-4-6"}`. Write to `.visual-qa.json`.
    - Append `.visual-qa-state.json` to `.gitignore` (idempotent).

4c. If theme is `floor` (NOT legacy `--visual-qa` alone): render `.agent-all.json` and enable Floor CLAUDE section.
    - Render `plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs` with `{maxIter: 10, maxCostUSD: 500, waveSize: "large", breakCondition: "npm test"}` and write to `.agent-all.json` at project root.
    - Append `.agent-all-state.json` to `.gitignore` (idempotent — same pattern as `.agent-init-state.json` and `.visual-qa-state.json`).
    - Set Phase 2 context flag `floorTheme: true` (used by `templates/CLAUDE.md.hbs` for the conditional Floor section).

5. Single git commit:
   ```bash
   git add CLAUDE.md .claude/ .gitignore docs/
   git commit -m "chore: bootstrap harness via /harness-init"
   ```

6. Set top-level `commit` to the new SHA and push `{ "phase": 5, "completedAt": "<iso>" }` onto `phases` in `.agent-init-state.json`. Write to disk (this update happens AFTER the commit in step 5, and `.agent-init-state.json` is `.gitignored` from step 3 so it stays out of git).

## Output to user

Print the success summary:
- Phases completed: 5 / 5
- CLAUDE.md, N agents, 3 hooks installed
- Missing plugins (if any) — with the exact install commands
- Next step suggestion: "Try `/harness-init --dry-run` or invoke planner with `/plan <goal>`."
