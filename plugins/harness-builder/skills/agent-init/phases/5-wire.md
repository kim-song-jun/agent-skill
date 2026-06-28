# Phase 5 — Wire

## Steps

1. If `--dry-run` is set, use the in-memory context from prior phases, including Phase 1's stashed `plugin_scan`, and print the complete no-write plan without reading or writing `.claude/.agent-init-state.json`. Then exit before filesystem mutations, global config patches, foundation updates, state updates, or commits. Include:
   - planned root files (`CLAUDE.md`, `AGENTS.md`, `.gitignore`, `.visual-qa.json`, `.agent-all.json` as applicable)
   - local guide files, including every generated folder-level `CLAUDE.md` and `AGENTS.md` as explicit pathspecs in the commit plan
   - agent files
   - hook files
   - settings changes for `.claude/settings.local.json`
   - task ledger files
   - platform wiring for Claude/Codex/Gemini selections
   - missing plugin report from the in-memory `plugin_scan`
   - planned global config patches that require separate approval
   - foundation update plan
   - post-install doctor plan (`node <plugin-root>/bin/doctor.mjs --target=. --platform=claude --profile=<operational|builder|lite>`; source checkouts may use `node /path/to/agent-skill/scripts/doctor.mjs ...`)
   - commit plan with explicit pathspecs

2. Re-read `plugin_scan` from `.agent-init-state.json`.
3. Compose a "missing plugins" report:

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

4. Resolve selected platforms from `--platform=claude,codex,gemini`. In
   interactive use, prompt before wiring platform-specific artifacts through
   the Phase 1 `agent-interaction/v1` contract and append the result to
   `.agent-skill/runs/<run-id>/interactions.jsonl`. In non-interactive use,
   call `resolveNonTtyInteraction()`: default to the recommended Claude-only
   low-risk choice, and block any high-risk platform/global config expansion
   until the user approves it. Global CLI config patching always requires a
   separate explicit approval.

5. Update `.gitignore`. If `.claude/.agent-init-state.json` is not already listed, append it. Idempotent. Also append `.agent-skill/html/` (the `/harness-view` dashboard is a derived view, never a source of record) if not already listed.

6. Make sure `.agent-skill/specs/`, `.agent-skill/plans/`, `.agent-skill/decisions/`, `.agent-skill/tasks/`, `.agent-skill/registry/`, `.agent-skill/handoff/`, `.agent-skill/reports/visual-qa/`, `.agent-skill/reports/debug/`, `.agent-skill/reports/thrift/`, and `.agent-skill/baselines/` exist. `mkdir -p` for each. Add a `.gitkeep` to each.

7. If operational mode is active, write task ledger files:
   - `.agent-skill/tasks/CLAUDE.md`
   - `.agent-skill/tasks/index.md`
   - `.agent-skill/tasks/_template.md`
   - `.agent-skill/tasks/_handoff-template.md`
   - `scripts/agent-task-ledger-check.mjs`

   Lite mode skips task ledger and policy hook generation.

8. **Theme wiring.** Use Phase 1's already-resolved `theme` and `floorTheme` from discovery:
   - If `theme === "lite"`: skip steps 8a and 8b entirely.
   - Else if `theme === "builder"`: keep the heavy builder scaffold already rendered, but skip steps 8a and 8b entirely.
   - Else if `theme === "floor"` and `floorTheme === true`: continue to 8a and 8b.
   - Backwards compat: if `theme === "legacy-visual-qa"`: render only `.visual-qa.json` (legacy behavior); skip 8b.

   **Resolve the harness-floor template root before 8a/8b.** Steps 8a/8b render
   templates that ship inside the *harness-floor* plugin (a different plugin
   from this one), so they must be located at harness-floor's install path —
   NOT a source-checkout sibling `plugins/harness-floor/`, which does not exist
   after a real plugin install. Use the `installPaths` captured by Phase 1's
   `plugin_scan` (`scanPlugins` records every installed plugin's `installPath`):
   ```javascript
   import { resolvePluginRoot } from "./lib/plugin-scan.mjs";
   // installed layout → ~/.claude/plugins/cache/agent-skill/harness-floor/<ver>/
   let floorRoot = resolvePluginRoot(plugin_scan.installPaths, "harness-floor");
   // source-checkout fallback (running agent-init from this repo, not an install)
   if (!floorRoot) floorRoot = "plugins/harness-floor";
   ```
   When you go to render a template below, **verify the resolved file exists on
   disk first**. If it does not (harness-floor not installed and not a source
   checkout), **abort steps 8a/8b loudly** — print
   `cannot locate harness-floor templates at <floorRoot> — install/enable harness-floor, then re-run`
   and do NOT write an empty or built-in-only `.visual-qa.json` / `.agent-all.json`
   (a silent empty config is the failure mode this guards against).

8a. If theme is `floor` OR legacy `--visual-qa`: render `.visual-qa.json`.
    - Verify `harness-floor` plugin enabled. If not: print install command, continue (degraded).
    - Render `<floorRoot>/skills/visual-qa/templates/visual-qa.config.json.hbs` with `{baseUrl: "http://localhost:3000", model: "claude-sonnet-4-6"}`. Write to `.visual-qa.json`. (Abort loudly per the resolution note if the template is not found.)
    - Append `.visual-qa-state.json` to `.gitignore` (idempotent).

8b. If theme is `floor` (NOT legacy `--visual-qa` alone): render `.agent-all.json` and enable Floor CLAUDE section.
    - Render `<floorRoot>/skills/agent-all/templates/agent-all.config.json.hbs` with `{maxIter: 10, maxCostUSD: 500, waveSize: "large", breakCondition: "npm test", language: ctx.interactionLang}` and write to `.agent-all.json` at project root. (Abort loudly per the resolution note if the template is not found.)
    - Append `.agent-all-state.json` to `.gitignore` (idempotent — same pattern as `.agent-init-state.json` and `.visual-qa-state.json`).
    - Do not mutate Phase 2 render context here; `floorTheme` was resolved in Phase 1 before `CLAUDE.md` rendered.

9. If `--update-foundations` is set, print the foundation update plan before
   running `scripts/update.sh` and capture the approval as
   `agent-interaction/v1` with `nonTtyPolicy: "pause"`. Non-TTY foundation
   updates and global CLI config patches are high-risk: log a blocked
   interaction and stop instead of auto-selecting approval. Global CLI config
   patching still requires a separate explicit approval.

10. **Post-install doctor.** Run the project-local scaffold check before committing:
   ```bash
   node <plugin-root>/bin/doctor.mjs --target=. --platform=claude --profile=<operational|builder|lite>
   ```
   When running from a source checkout instead of an installed plugin bundle, the compatibility wrapper `node /path/to/agent-skill/scripts/doctor.mjs ...` is equivalent. Use `operational` for the default floor-enabled profile, `builder` for builder-only operational scaffolds, and `lite` for `--lite`. A non-zero exit means the scaffold is incomplete; abort before committing and report the missing artifact(s). Foundation warnings do not abort unless the user explicitly requested strict foundation enforcement.

11. Single git commit with explicit pathspecs:
   ```bash
   git add -- CLAUDE.md AGENTS.md .claude/ .gitignore .agent-skill/ scripts/ .visual-qa.json .agent-all.json <generated-local-guide-paths>
   git commit -m "chore: bootstrap harness via /agent-init" -- CLAUDE.md AGENTS.md .claude/ .gitignore .agent-skill/ scripts/ .visual-qa.json .agent-all.json <generated-local-guide-paths>
   ```
   Omit any path that was skipped by lite mode, legacy mode, or platform selection. Replace `<generated-local-guide-paths>` with the exact folder-level guidance files rendered in Phase 2; do not substitute broad top-level directory pathspecs.

12. Set top-level `commit` to the new SHA and push `{ "phase": 5, "completedAt": "<iso>" }` onto `phases` in `.agent-init-state.json`. Write to disk (this update happens AFTER the commit in step 11, and `.agent-init-state.json` is `.gitignored` from step 5 so it stays out of git).

## Output to user

Print the success summary:
- Phases completed: 5 / 5
- CLAUDE.md, AGENTS.md, N local guides, N agents, hooks installed, task ledger status
- Doctor status and any foundation warnings
- Missing plugins (if any) — with the exact install commands
- Next step suggestion: "Try `/agent-init --dry-run` or invoke planner with `/plan <goal>`."
