# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `shell_command("git rev-parse --git-dir")`
   exit 0. If not: abort `Not in a git repo. Run git init first.`
2. Confirm working tree clean:
   `shell_command("git status --porcelain")` empty. If not: abort
   `Stash or commit local changes first.`
3. Confirm `.codex/skills/` contains at minimum `planner`, `dev`, `reviewer`
   (each with `SKILL.md`). If not: abort `Run /codex-init first.`
4. **Detect dispatch strategy:**
   - Read `~/.codex/config.toml`. If `[hooks]` contains a matcher for
     `agent` type: set `dispatch = "agent-hook"`.
   - Else: set `dispatch = "sequential"`, print warning
     `agent hook not registered; falling back to sequential. ~3-5x slower.`
   - If `--dispatch=agent-hook|sequential` was passed, override and validate.
5. Load `.agent-all.json` via implicit file read. If missing: warn + use
   built-ins from `templates/agent-all.config.json.hbs`.
6. Read `.agent-all-state.json` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
7. Validate positional argument:
   - Ends with `.md`: must exist. Stash `taskPath`.
   - Otherwise: non-empty string. Stash `prompt`.
8. Push `{phase: 0, completedAt: "<iso>"}` to state via `apply_patch`.

## Output

Print: `Preflight OK. <input mode: prompt|task>. Dispatch: <agent-hook|sequential>.`
