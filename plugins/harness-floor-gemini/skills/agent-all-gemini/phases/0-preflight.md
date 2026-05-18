# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `run_shell_command("git rev-parse --git-dir")`
   exit 0. If not: abort `Not in a git repo. Run git init first.`
2. Confirm working tree clean: `run_shell_command("git status --porcelain")`
   empty. If not: abort `Stash or commit local changes first.`
3. Confirm `gemini` binary in PATH:
   `run_shell_command("command -v gemini")` exit 0. If not: abort
   `gemini binary required for subprocess dispatch`.
4. Confirm `.gemini/settings.json` exists. If not: abort `Run /gemini-init first.`
5. Probe subprocess sanity: spawn a tiny test invocation:
   ```
   run_shell_command("gemini chat -p 'reply with exactly: OK' --output-json --timeout 30")
   ```
   Parse stdout JSON, verify `response == "OK"`. If fail: abort
   `gemini subprocess sanity check failed`.
6. Load `.agent-all.json` via `read_file`. If missing: warn + use built-ins
   from `templates/agent-all.config.json.hbs`.
7. Read `.agent-all-state.json` if present. If `--resume` and
   `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.
8. Validate positional argument:
   - Ends with `.md`: must exist. Stash `taskPath`.
   - Otherwise: non-empty string. Stash `prompt`.
9. Push `{phase: 0, completedAt: "<iso>"}` to state.

## Output

Print: `Preflight OK. <input mode: prompt|task>. gemini subprocess: healthy.`
