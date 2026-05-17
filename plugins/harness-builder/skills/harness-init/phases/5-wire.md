# Phase 5 — Wire

## Steps

1. Re-read `plugin_scan` from `.harness-state.json`.
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

3. Update `.gitignore`. If `.claude/.harness-state.json` is not already listed, append it. Idempotent.

4. Make sure `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/decisions/`, `docs/tasks/` exist. `mkdir -p` for each. Add a `.gitkeep` to each.

4b. If `--visual-qa` was passed:
    - Verify `harness-floor` plugin enabled. If not: print install command, continue (degraded — config won't be runnable yet).
    - Render `plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs` with `{baseUrl: "http://localhost:3000", model: "claude-sonnet-4-6"}` (or model from discovery if specified).
    - Write the rendered JSON to `.visual-qa.json` at project root.
    - Append `.visual-qa-state.json` to `.gitignore` (idempotent — same pattern as `.harness-state.json`).

5. Single git commit:
   ```bash
   git add CLAUDE.md .claude/ .gitignore docs/
   git commit -m "chore: bootstrap harness via /harness-init"
   ```

6. Set top-level `commit` to the new SHA and push `{ "phase": 5, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`. Write to disk (this update happens AFTER the commit in step 5, and `.harness-state.json` is `.gitignored` from step 3 so it stays out of git).

## Output to user

Print the success summary:
- Phases completed: 5 / 5
- CLAUDE.md, N agents, 3 hooks installed
- Missing plugins (if any) — with the exact install commands
- Next step suggestion: "Try `/harness-init --dry-run` or invoke planner with `/plan <goal>`."
