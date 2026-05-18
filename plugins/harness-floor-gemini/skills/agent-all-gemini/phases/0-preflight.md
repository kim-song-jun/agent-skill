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
9. **Resolve loop break-condition (only when `--loop` is set).** See
   `### Break-condition resolution` below.
10. Push `{phase: 0, completedAt: "<iso>"}` to state.

## Output

Print: `Preflight OK. <input mode: prompt|task>. gemini subprocess: healthy.`
Plus, when `--loop` set, `Break-condition: <serialized>.`

## Break-condition resolution

Triggered only when `--loop` is set. Skipped otherwise.

The coordinator uses the vendored `lib/break-resolver.mjs`
(`normalizeBreakCondition`, `PRESET_CATALOGUE`, `isDefaultOrMissing`,
`serializeBreakCondition`).

Decision tree:

1. **CLI override:** if `--break-condition=<json-or-string>` was passed,
   try `JSON.parse` first; fall back to treating it as a plain shell
   string. Normalise and use that. Skip the prompt. Do not persist.

2. **Non-interactive paths** — skip the prompt and reuse
   `config.loop.breakCondition`:
   - `--yes` passed
   - `ask_user` not exposed (e.g., background `gemini chat` subprocess,
     `--output-json` runs, non-TTY)
   - `--reconfigure` is NOT set AND `!isDefaultOrMissing(config.loop.breakCondition)`

3. **Interactive prompt** — use the `ask_user` Gemini primitive:

   a. First call: ask "Loop break-condition?" with the four
      `PRESET_CATALOGUE` choices (test-auto / visual-qa / Custom shell
      command / Composite).
   b. **Custom**: follow-up `ask_user` for the shell one-liner. Validate
      non-empty.
   c. **visual-qa**: follow-up `ask_user` for optional `spec` path;
      empty for default.
   d. **Composite**: repeat the menu (up to 5 times) for each step;
      stop on "Done".
   e. Echo the resolved spec via `serializeBreakCondition(resolved)`.
   f. Save-confirmation: `ask_user` "Save this as the default in
      `.agent-all.json`?". On yes: deep-merge into config and write
      `.agent-all.json` atomically (write to `.tmp`, then
      `run_shell_command` rename). On no: keep in memory only.

4. **Assignment:** `config.loop.breakCondition = resolved` for the rest
   of the run.

### Fallback when stack detection finds no test command

If the user picks "Test command (auto-detected)" but
`detectStackTestCommand()` returns `null`, downgrade to "Custom shell"
with `true` pre-filled (always exits 0) and a warning explaining why —
better to make the user think than silently ship a no-op.
