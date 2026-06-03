# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `git rev-parse --git-dir` exit 0. If not: abort `Not in a git repo. Run git init first.`

2. Confirm working tree clean: `git status --porcelain` empty. If not: abort `Stash or commit local changes first; agent-all needs a clean tree.`

3. Confirm `.claude/agents/` exists and contains at minimum `planner.md`, `dev.md`, `reviewer.md`. If not: abort `Run /agent-init first to scaffold .claude/agents/.`

3b. Confirm the governance hook is actually **registered**, not just that the roster exists — the pipeline's Pre/PostToolUse gate (scoping-addendum + verification/audit-token enforcement) depends on it. Read `.claude/settings.local.json` and verify both `hooks.PreToolUse` and `hooks.PostToolUse` contain a `"matcher": "Task"` entry whose command references `agent-policy-hook.mjs`. If absent — unless `.agent-all.json` `policy` disables all of `decisionSurfacing`, `verification`, and `reviewerAudit` — abort `Governance hook not registered (settings.local.json has no Task-matcher agent-policy-hook). Run /agent-init (operational profile) before /agent-all.` This turns the gate from assumed-present into verified-present (the prior check only confirmed the roster, not the enforcement hook).

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

7. Validate task ledger scaffolding:
   - Require `docs/tasks/index.md` and `docs/tasks/_template.md` to exist before continuing.
   - Exception: if the input is a free-form prompt and this invocation is creating the first task in Phase 1, allow Phase 1 to create the missing ledger scaffold and task doc after confirming `docs/tasks/` can be created.
   - If `--task-id=<N>` is present, validate that `N` is a positive integer and stash it as `requestedId` for Phase 1.

8. **Resolve loop break-condition (if `--loop` is set).** See `### Break-condition resolution` below. Mutates `config.loop.breakCondition` in memory; may rewrite `.agent-all.json` if user opts in.

9. Push `{phase: 0, completedAt: "<iso>"}` to state. Use atomic write (temp + rename). Create `.agent-all-state.json` with `{"phases": [], "decisions": {}}` if missing. The `decisions` map is populated by Phase 3b (decision-surfacing) and keyed by task-id.

## Break-condition resolution

Triggered only when `--loop` is set. Skipped entirely otherwise.

```javascript
import {
  normalizeBreakCondition,
  isDefaultOrMissing,
  serializeBreakCondition,
  PRESET_CATALOGUE,
  QA_SHORTCUT_SPEC,
  QA_AUTOSCAFFOLD_CONFIG,
} from "./lib/break-resolver.mjs";
```

Decision tree:

1. **`--qa` shortcut (highest priority):** if user passed `--qa`, use
   `QA_SHORTCUT_SPEC` (a composite `test-auto → visual-qa comprehensive`
   spec). Skip the interactive prompt and the CLI-override branch. Do not
   persist to `.agent-all.json`. ADDITIONALLY:

   a. **Dev-server reachability check.** Probe the autoscaffold's
      `baseUrl` (default `http://localhost:3000`) before doing anything:
      ```bash
      curl --max-time 3 -s -o /dev/null -w '%{http_code}' http://localhost:3000
      ```
      - 2xx/3xx → continue.
      - Anything else → print a clear warning and ask
        `Dev server at <baseUrl> not responding. Continue anyway? [y/N]`
        (in `--yes` mode, abort with `Dev server at <baseUrl>
        unreachable; --qa requires a running dev server (or override
        baseUrl in .visual-qa.json).`). This catches the most common
        "first try doesn't work" — silently broken loops because
        visual-qa can't reach the server.

   b. **Autoscaffold.** If `.visual-qa.json` is missing in the project
      root, write `QA_AUTOSCAFFOLD_CONFIG` to it atomically.

   c. Echo `Break-condition: composite [test-auto → visual-qa
      comprehensive] (--qa shortcut).`

2. **CLI override:** if user passed `--break-condition=<json-or-string>`,
   parse it (try JSON first, fall back to plain shell string), normalise,
   and use that. Skip the prompt. Do not persist (per-invocation only).

3. **Non-interactive paths** — skip the prompt and use `config.loop.breakCondition` as-is:
   - `--yes` passed
   - stdin is not a TTY (CI environments)
   - `--reconfigure` is NOT set AND `!isDefaultOrMissing(config.loop.breakCondition)`
     (already customised, no need to ask)

4. **Interactive prompt** — when none of the above apply:

   a. Ask: "Loop break-condition?" with the four presets from
      `PRESET_CATALOGUE` (Test command auto-detected / visual-qa skill /
      Custom shell command / Composite).

   b. **Custom**: follow-up prompt for the shell one-liner. Validate
      non-empty.

   c. **visual-qa**: follow-up prompt for optional `spec` path (file
      under `docs/`); leave empty to use the visual-qa skill's own
      defaults.

   d. **Composite**: repeatedly prompt for each step (1-based index) by
      offering the first three preset types only. Stop when the user
      selects "Done" or after a hard cap of 5 steps.

   e. Echo the resolved spec via `serializeBreakCondition(resolved)`.

   f. Save-confirmation prompt: "Save this as the default in
      `.agent-all.json`?" yes/no. On yes: deep-merge into the config
      object and atomically write `.agent-all.json` (temp + rename).
      On no: keep only in memory for this invocation.

5. **Assignment:** set `config.loop.breakCondition = resolved` for the
   rest of the run. State file is not used for the spec itself — Phase 6
   re-reads from `config` each iteration.

### Fallback when stack detection finds no test command

If the user selects "Test command (auto-detected)" but
`detectStackTestCommand()` returns null, downgrade the choice: show the
"Custom shell command" prompt with `true` pre-filled (a no-op that always
exits 0) and a warning explaining what happened. Better to make the user
think than silently ship a no-op.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>.` plus, when `--loop` set,
`Break-condition: <serialized>.`
