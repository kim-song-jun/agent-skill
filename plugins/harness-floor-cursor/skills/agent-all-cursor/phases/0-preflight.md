# Phase 0 — Preflight

The coordinator (`agent-all-coordinator`) runs these checks before any pipeline work.

## Steps

1. Confirm `pwd` is a git repo. If `git rev-parse --git-dir` fails: abort with
   `Not in a git repo. Run git init first.`
2. Confirm working tree clean: `git status --porcelain` empty. If not: abort with
   `Stash or commit local changes first; agent-all needs a clean tree.`
3. Confirm `.cursor/agents/` contains the agent-all kit:
   - `agent-all-coordinator.md`
   - `agent-all-implementer.md` (with `is_background: true`)
   - `agent-all-reviewer.md` (with `is_background: true`)
   If missing: abort with `Install harness-floor-cursor agent-all kit first.`
4. Load `.agent-all.json`. If missing: warn and use built-ins from
   `templates/agent-all.config.json.hbs`.
5. If `.agent-all-state.json` exists and `--resume` was passed, skip to the
   highest completed phase.
6. Validate positional argument:
   - Ends with `.md` → must exist as a file. Stash `taskPath`.
   - Otherwise → must be non-empty string. Stash `prompt`.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>.`

## Shell helpers

The coordinator runs these via `read_bash`. The lib modules are copied into
`<repo>/.cursor/agent-all/lib/` by `harness-floor-cursor/bin/init.mjs`.

```bash
# Step 4 — load + validate `.agent-all.json` (returns built-in DEFAULTS if missing).
node -e 'import("./.cursor/agent-all/lib/config-loader.mjs").then(m => { const r = m.loadConfig(".agent-all.json"); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })'

# Step 5 — read existing state for --resume detection (returns {} if missing).
node .cursor/agent-all/lib/state-rw.mjs read .agent-all-state.json
```
