# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `bash("git rev-parse --git-dir")` exit 0.
   If not: abort `Not in a git repo. Run git init first.`
2. Confirm working tree clean: `bash("git status --porcelain")` empty.
   If not: abort `Commit or explicitly set aside local changes first.`
3. Confirm Copilot CLI is reachable and has the current command surface:
   run `copilot --version` (or `gh copilot -- --version` when installed via
   GitHub CLI) and verify hooks/task support from the host's available tools.
   If `task` is unavailable, abort with an upgrade/install hint.
4. Load `.agent-all.json` via `view`. If missing: warn + use built-ins
   from `templates/agent-all.config.json.hbs`.
5. Read `.agent-all-state.json` via `view` if present.

   **5b. (resume checkpoint recall — on `--resume` only).** Recall the latest
   checkpoint from disk via the fixed `checkpoint/LATEST` pointer so a fresh
   post-death session needs zero lost coordinates:
   ```javascript
   import { makeFileMirror } from "./lib/memory-bridge.mjs";
   import { recallLatestCheckpoint } from "./lib/memory-agent.mjs";
   if (flags.resume) {
     const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
     const latest = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
     if (latest.found && latest.checkpoint?.inFlight) {
       state.resumeCheckpoint = latest.checkpoint;
       state.iter = latest.checkpoint.iter ?? state.iter;
       state.decisions = { ...(state.decisions ?? {}), ...(latest.checkpoint.decisionsSoFar ?? {}) };
       // Phase 3 re-enters wave=latest.checkpoint.wave at 3a.0 using miniPlans, not a re-parse.
     }
   }
   ```
   (`toolCaller:null` is correct — copilot recall reads Layer-1 file mirror only,
   per memory-bridge canonical. The module call is real pure-JS behavior; the live
   resume on a running Copilot CLI is #27-unverified until the Copilot CLI spike.)

   If `--resume` and `max(state.phases[*].phase) >= 0`, skip rest of Phase 0
   EXCEPT keep `state.resumeCheckpoint` set above; Phase 3 step 4 reads it to
   re-enter the dead wave at 3a.0.
6. Validate positional argument (same as Claude port):
   - Ends with `.md`: must exist as file. Stash `taskPath`.
   - Otherwise: non-empty string. Stash `prompt`.
7. **Resolve loop break-condition (only when `--loop` is set).** See
   `### Break-condition resolution` below.
8. Push `{phase: 0, completedAt: "<iso>"}` to state via `create` / `edit`. Create
   `.agent-all-state.json` if missing.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>. state: file-backed.`
Plus, when `--loop` set, `Break-condition: <serialized>.`

## Break-condition resolution

Triggered only when `--loop` is set. Skipped otherwise.

The coordinator uses the vendored `lib/break-resolver.mjs`
(`normalizeBreakCondition`, `PRESET_CATALOGUE`, `isDefaultOrMissing`,
`serializeBreakCondition`).

Decision tree:

1. **`--qa` shortcut (highest priority):** if `--qa` was passed, use
   `QA_SHORTCUT_SPEC` (composite `test-auto → visual-qa comprehensive`).
   Skip the interactive prompt and the CLI-override branch. Do not
   persist. ADDITIONALLY:

   a. **Dev-server reachability check.** Probe the autoscaffold's
      `baseUrl` (default `http://localhost:3000`) via `bash`:
      `curl --max-time 3 -s -o /dev/null -w '%{http_code}' <baseUrl>`.
      Non-2xx/3xx response → `ask_user` to confirm before continuing
      (in `--yes` mode, abort). Catches silent failures where
      visual-qa can't reach the dev server.

   b. **Autoscaffold.** If `.visual-qa.json` is missing, write
      `QA_AUTOSCAFFOLD_CONFIG` via `create` / `edit` before continuing.

   c. Echo `Break-condition: composite [test-auto → visual-qa
      comprehensive] (--qa shortcut).`

2. **CLI override:** if `--break-condition=<json-or-string>` was passed,
   try `JSON.parse` first; fall back to treating it as a plain shell
   string. Normalise and use that. Skip the prompt. Do not persist.

3. **Non-interactive paths** — skip the prompt and reuse
   `config.loop.breakCondition`:
   - `--yes` passed
   - `ask_user` tool not exposed (background invocations, scripted sessions)
   - `--reconfigure` is NOT set AND `!isDefaultOrMissing(config.loop.breakCondition)`

4. **Interactive prompt** — use the `ask_user` Copilot primitive:

   a. First call: ask "Loop break-condition?" with the five
      `PRESET_CATALOGUE` choices (test-auto / visual-qa / Verification
      adapter / Custom shell command / Composite). Map reply to a
      `PRESET_CATALOGUE` key.
   b. **Custom**: follow-up `ask_user` for the shell one-liner. Validate
      non-empty.
   c. **visual-qa**: follow-up `ask_user` for optional `spec` path;
      empty for default.
   d. **Verification adapter**: ask for an adapter id
      (`cli`, `api-contract`, `notebook-data`, `sql-db`, `batch-job`, or
      `visual-qa`) and optional config JSON. Store it as
      `{type:"verification-adapter", adapter, config}`.
   e. **Composite**: repeat the menu (up to 5 times) for each step;
      stop on "Done".
   f. Echo the resolved spec via `serializeBreakCondition(resolved)`.
   g. Save-confirmation: `ask_user` "Save this as the default in
      `.agent-all.json`?". On yes: deep-merge into config and atomically
      `edit` `.agent-all.json`. On no: keep in memory only.

5. **Assignment:** `config.loop.breakCondition = resolved` for the rest
   of the run.

### Fallback when stack detection finds no test command

If the user picks "Test command (auto-detected)" but
`detectStackTestCommand()` returns `null`, downgrade to "Custom shell"
with `true` pre-filled (always exits 0) and a warning explaining why —
better to make the user think than silently ship a no-op.
