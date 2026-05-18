# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `read_bash("git rev-parse --git-dir")` exit 0.
   If not: abort `Not in a git repo. Run git init first.`
2. Confirm working tree clean: `read_bash("git status --porcelain")` empty.
   If not: abort `Stash or commit local changes first.`
3. Confirm `task` tool is available: call `list_agents()` (returns []). If the
   call errors with `unknown tool`: abort `Copilot CLI must be v0.0.380+ for
   the task tool. Run \`copilot upgrade\`.`
4. Load `.agent-all.json` via `read_file`. If missing: warn + use built-ins
   from `templates/agent-all.config.json.hbs`.
5. Check `store_memory` availability — write a probe key `agent-all/probe`
   then `read_memory` it back. If the round-trip fails: warn `store_memory
   unavailable; using file-only state`.
6. Read `.agent-all-state.json` via `read_file` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
7. Validate positional argument (same as Claude port):
   - Ends with `.md`: must exist as file. Stash `taskPath`.
   - Otherwise: non-empty string. Stash `prompt`.
8. Push `{phase: 0, completedAt: "<iso>"}` to state via `apply_patch`. Create
   `.agent-all-state.json` if missing.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>. store_memory: <available|file-only>.`
