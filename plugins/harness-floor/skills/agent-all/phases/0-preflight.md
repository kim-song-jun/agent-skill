# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `git rev-parse --git-dir` exit 0. If not: abort `Not in a git repo. Run git init first.`

2. Confirm working tree clean: `git status --porcelain` empty. If not: abort `Stash or commit local changes first; agent-all needs a clean tree.`

3. Confirm `.claude/agents/` exists and contains at minimum `planner.md`, `dev.md`, `reviewer.md`. If not: abort `Run /agent-init first to scaffold .claude/agents/.`

4. Load `.agent-all.json`:
   ```javascript
   import { loadConfig } from "./lib/config-loader.mjs";
   const { ok, config, warning, errors } = loadConfig(".agent-all.json");
   if (!ok) { /* print errors as 'field: message', abort */ }
   if (warning) { /* print: ".agent-all.json not found; using built-ins. Run /agent-init --theme=floor to seed." */ }
   ```

5. Read `.agent-all-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.

6. Validate positional argument:
   - If ends with `.md`: must exist as a file. If not: abort `task file not found: <path>`. Stash as `taskPath`.
   - Otherwise: must be non-empty string. Stash as `prompt`. If empty: abort `provide a prompt or task path`.

7. Push `{phase: 0, completedAt: "<iso>"}` to state. Use atomic write (temp + rename). Create `.agent-all-state.json` with `{"phases": []}` if missing.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>.`
