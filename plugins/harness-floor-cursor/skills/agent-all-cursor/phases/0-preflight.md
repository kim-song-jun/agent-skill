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
7. **Resolve loop break-condition (only when `--loop` is set).** See
   `### Break-condition resolution` below.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>.` plus, when `--loop` set,
`Break-condition: <serialized>.`

## Break-condition resolution

Triggered only when `--loop` is set. Skipped otherwise.

The cursor coordinator uses the vendored `lib/break-resolver.mjs`
(`normalizeBreakCondition`, `PRESET_CATALOGUE`, `isDefaultOrMissing`,
`serializeBreakCondition`).

Decision tree:

1. **`--qa` shortcut (highest priority):** if `--qa` was passed, use
   `QA_SHORTCUT_SPEC` (composite `test-auto → visual-qa comprehensive`).
   Skip the interactive prompt and the CLI-override branch. Do not
   persist. ADDITIONALLY: if `.visual-qa.json` is missing, write
   `QA_AUTOSCAFFOLD_CONFIG` to it atomically before continuing. Echo
   `Break-condition: composite [test-auto → visual-qa comprehensive] (--qa shortcut).`

2. **CLI override:** if `--break-condition=<json-or-string>` was passed,
   try `JSON.parse` first; fall back to treating it as a plain shell
   string. Normalise and use that. Skip the prompt. Do not persist.

3. **Non-interactive paths** — skip the prompt and reuse
   `config.loop.breakCondition`:
   - `--yes` passed
   - Cursor chat is non-interactive (e.g., background invocation)
   - `--reconfigure` is NOT set AND `!isDefaultOrMissing(config.loop.breakCondition)`

4. **Interactive prompt** — the coordinator asks the user inline in the
   Cursor chat. There is no `ask_user` primitive in Cursor; instead emit
   a single chat block listing the four PRESET_CATALOGUE entries
   (test-auto / visual-qa / Custom shell command / Composite) and wait
   for the user's reply.

   a. Map the user's choice to a `PRESET_CATALOGUE` entry by `key`.
   b. **Custom**: follow-up — ask for the shell one-liner. Validate non-empty.
   c. **visual-qa**: follow-up — ask for optional `spec` path; empty for default.
   d. **Composite**: repeat the menu (up to 5 times) for each step; stop on "Done".
   e. Echo the resolved spec via `serializeBreakCondition(resolved)`.
   f. Save-confirmation: ask "Save this as the default in `.agent-all.json`?
      (y/n)". On `y`: deep-merge into config and write `.agent-all.json`
      atomically via `apply_patch` / `write_file`. On `n`: keep in memory only.

5. **Assignment:** `config.loop.breakCondition = resolved` for the rest
   of the run.

### Fallback when stack detection finds no test command

If the user picks "Test command (auto-detected)" but
`detectStackTestCommand()` returns `null`, downgrade to "Custom shell"
with `true` pre-filled (always exits 0) and a warning explaining why —
better to make the user think than silently ship a no-op.

## Shell helpers

The coordinator runs these via `read_bash`. The lib modules are copied into
`<repo>/.cursor/agent-all/lib/` by `harness-floor-cursor/bin/init.mjs`.

```bash
# Step 4 — load + validate `.agent-all.json` (returns built-in DEFAULTS if missing).
node -e 'import("./.cursor/agent-all/lib/config-loader.mjs").then(m => { const r = m.loadConfig(".agent-all.json"); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })'

# Step 5 — read existing state for --resume detection (returns {} if missing).
node .cursor/agent-all/lib/state-rw.mjs read .agent-all-state.json

# Step 7 — normalise / inspect the break-condition spec from config or user reply.
node -e 'import("./.cursor/agent-all/lib/break-resolver.mjs").then(m => { const out = m.normalizeBreakCondition(process.argv[1]); console.log(out ? JSON.stringify(out) : ""); })' '<json-or-shell-string>'
```

## Shell helpers

The coordinator runs these via `read_bash`. The lib modules are copied into
`<repo>/.cursor/agent-all/lib/` by `harness-floor-cursor/bin/init.mjs`.

```bash
# Step 4 — load + validate `.agent-all.json` (returns built-in DEFAULTS if missing).
node -e 'import("./.cursor/agent-all/lib/config-loader.mjs").then(m => { const r = m.loadConfig(".agent-all.json"); console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })'

# Step 5 — read existing state for --resume detection (returns {} if missing).
node .cursor/agent-all/lib/state-rw.mjs read .agent-all-state.json
```
