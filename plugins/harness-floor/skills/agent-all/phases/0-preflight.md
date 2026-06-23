# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `git rev-parse --git-dir` exit 0. If not: abort `Not in a git repo. Run git init first.`

2. Confirm working tree clean: `git status --porcelain` empty. If not: abort `Stash or commit local changes first; agent-all needs a clean tree.`

3. Confirm `.claude/agents/` exists and contains at minimum `planner.md`, `dev.md`, `reviewer.md`. If not: abort `Run /agent-init first to scaffold .claude/agents/.`

3b. Confirm the governance hook is actually **registered**, not just that the roster exists — the pipeline's Pre/PostToolUse gate (scoping-addendum + verification/audit-token enforcement) depends on it. Read `.claude/settings.local.json` and verify both `hooks.PreToolUse` and `hooks.PostToolUse` contain a `"matcher": "Task"` entry whose command references either the operational `agent-policy-hook.mjs` or the standalone `floor-policy-hook.mjs`. If absent — unless `.agent-all.json` `policy` disables all of `decisionSurfacing`, `verification`, and `reviewerAudit` — abort `Governance hook not registered (settings.local.json has no Task-matcher agent/floor policy hook). Run /agent-init (operational profile) or install the floor policy hook before /agent-all.` This turns the gate from assumed-present into verified-present (the prior check only confirmed the roster, not the enforcement hook). **Also verify the hook file itself, not just the registration:** resolve the matched entry's command path and confirm the referenced `.mjs` exists on disk and is executable (`existsSync` + the owner-executable bit). A settings entry whose target script is missing, renamed, or non-executable passes the string check above but the PostToolUse audit-token enforcement then silently fails at runtime — removing the unattended-loop safety net. If the registered hook file is absent or non-executable: abort `Governance hook registered in settings but its script is missing/non-executable at <path>. Re-run /agent-init (operational profile) to restore .claude/hooks/agent-policy-hook.mjs.`

4. Load `.agent-all.json`:
   ```javascript
   import { loadConfig } from "./lib/config-loader.mjs";
   const { ok, config, warning, errors } = loadConfig(".agent-all.json");
   if (!ok) { /* print errors as 'field: message', abort */ }
   if (warning) { /* print: ".agent-all.json not found; using built-ins. Run /agent-init --theme=floor to seed." */ }
   ```

   **4b. (auto-wiki toggle + deterministic creation).** The agent-all↔wiki
   auto-loop is **default-on** (`config.wiki.auto`, default `true`): Phase 1 reads
   relevant wiki pages into planning, Phase 2 records the plan, Phase 5 records the
   outcome. The `--no-wiki` flag opts out — normalize it once here so every
   downstream phase only checks `config.wiki.auto`. **Then create `.wiki/` right
   here**, so the directory exists on EVERY run instead of hanging off the optional
   Phase 2 sub-step (an LLM can skip that step — the historical "`.wiki` never shows
   up" cause). `ensureWiki` is idempotent + non-fatal: it never fails the run, and
   Phase 2's later `ensureWiki` becomes a no-op (`created:false` → no duplicate notice).
   ```javascript
   import { ensureWiki } from "./lib/wiki-log.mjs";
   if (flags["no-wiki"]) config.wiki = { ...config.wiki, auto: false };
   if (config.wiki?.auto) {
     const ready = ensureWiki(".wiki");                       // deterministic: created on every run
     if (ready.ok && ready.created) console.log("started a project wiki at .wiki/ — disable with --no-wiki");
   }
   ```

5. Read `.agent-all-state.json` if present. If `--resume` and a task path is
   known, discover `/agent-handoff` artifacts before skipping:
   `.agent-skill/handoff/<display-id>-<slug>.handoff.md` and
   `.agent-skill/handoff/<display-id>-<slug>.session.md`, falling back to legacy
   `docs/tasks/<NN>-<slug>.handoff.md` and `.session.md`.
   ```javascript
   import { discoverResumeArtifacts } from "./lib/resume-artifacts.mjs";
   const resumeArtifacts = discoverResumeArtifacts({ taskPath });
   if (resumeArtifacts.found) {
     state.resumeArtifacts = resumeArtifacts.artifacts;
     state.resumeMetadata = resumeArtifacts.metadata;
   }
   ```
   - If interactive and metadata includes `nextActions`, show the choices and
     ask which action to take through `agent-interaction/v1`, defaulting to the
     recommended action.
   - If non-TTY or `--yes`, auto-select the recommended action and append an
     audit entry to `.agent-skill/runs/handoff-audit.jsonl` with the task path,
     selected action id, and reason. Also append the shared interaction audit
     to `.agent-skill/runs/handoff/interactions.jsonl`.
   - If no sibling files exist, continue normal `.agent-all-state.json` resume.

   **5b. (resume checkpoint recall — on `--resume` only).**
   The handoff md is a complementary signal but is NOT the checkpoint and never
   carried in-flight scoping state. On `--resume`, also recall the latest
   checkpoint from disk (the Layer-1 file mirror) via the fixed `checkpoint/LATEST`
   pointer. A fresh post-death session needs zero lost coordinates:
   ```javascript
   import { join } from "node:path";
   import { makeFileMirror } from "./lib/memory-bridge.mjs";
   import { recallLatestCheckpoint } from "./lib/memory-agent.mjs";
   if (flags.resume) {
     const fileMirror = makeFileMirror({ rootDir: join(cwd, ".agent-skill/memory") });
     const latest = await recallLatestCheckpoint({ fileMirror, toolCaller: null });
     if (latest.found && latest.checkpoint?.inFlight) {
       // A death occurred mid-3a: reconstruct in-flight scoping state FROM DISK.
       state.resumeCheckpoint = latest.checkpoint;  // {phase,wave,iter,miniPlans,taskIds,requiredAgents,decisionsSoFar,...}
       state.iter = latest.checkpoint.iter ?? state.iter;
       state.decisions = { ...(state.decisions ?? {}), ...(latest.checkpoint.decisionsSoFar ?? {}) };
       // Phase 3 MUST re-enter at wave=latest.checkpoint.wave, sub-phase 3a, using miniPlans
       // instead of re-parsing — the scoping subagents that died are re-dispatched from this.
     }
   }
   ```

   If `--resume` and `max(state.phases[*].phase) >= 0`, skip rest of Phase 0
   **EXCEPT** keep `state.resumeCheckpoint` set above; Phase 3 step 3 reads it
   to re-enter the dead wave at 3a.

6. Validate positional argument:
   - If ends with `.md`: must exist as a file. If not: abort `task file not found: <path>`. Stash as `taskPath`.
   - Otherwise: must be non-empty string. Stash as `prompt`. If empty: abort `provide a prompt or task path`.

7. Validate task ledger scaffolding:
   - Require `.agent-skill/tasks/index.md` and `.agent-skill/tasks/_template.md` to exist before continuing. During migration, legacy `docs/tasks/index.md` and `docs/tasks/_template.md` satisfy this gate when the active task path is under `docs/tasks/`.
   - Exception: if the input is a free-form prompt and this invocation is creating the first task in Phase 1, allow Phase 1 to create the missing ledger scaffold and task doc after confirming `.agent-skill/tasks/` can be created.
   - If `--task-id=<N>` is present, validate that `N` is a positive integer and stash it as `requestedId` for Phase 1. This is a legacy display-sequence hint only; it must never become the canonical task id.
   - If `--display-id=T-YYYYMMDD-NNN` is present, validate the display id shape and stash it as `requestedDisplayId`. If the requested display id already exists, Phase 1 must suffix it instead of failing or reusing it.
   - Ensure `.agent-skill/registry/` can be created. Phase 1 owns writing `.agent-skill/registry/tasks.json` when it creates a new task.

8. **Resolve loop break-condition (if `--loop` is set).** See `### Break-condition resolution` below. Mutates `config.loop.breakCondition` in memory; may rewrite `.agent-all.json` if user opts in.

9. Push `{phase: 0, completedAt: "<iso>"}` to state. Use atomic write (temp + rename). Create `.agent-all-state.json` with `{"phases": [], "decisions": {}, "interactions": {}}` if missing. The `decisions` and `interactions` maps are populated by Phase 3b (decision-surfacing) and keyed by canonical task id (`AS-TASK-*`) when available.

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
import { VERIFICATION_ADAPTER_IDS } from "./lib/verification-adapters/schema.mjs";
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

   a. Ask: "Loop break-condition?" with the presets from
      `PRESET_CATALOGUE` (Test command auto-detected / visual-qa skill /
      Verification adapter / Custom shell command / Composite).

   b. **Custom**: follow-up prompt for the shell one-liner. Validate
      non-empty.

   c. **visual-qa**: follow-up prompt for optional `spec` path (file
      under `docs/`); leave empty to use the visual-qa skill's own
      defaults.

   d. **Verification adapter**: follow-up prompt for the adapter id
      (`verify:web-ui`, `verify:cli`, `verify:api-contract`,
      `verify:notebook-data`, `verify:sql-db`, or `verify:batch-job`).
      Accept the short aliases (`cli`, `api-contract`, `notebook-data`,
      `sql-db`, `batch-job`, `visual-qa`) and normalise through
      `VERIFICATION_ADAPTER_IDS`. Then prompt for optional config JSON.
      Store the result as:
      ```json
      {
        "type": "verification-adapter",
        "adapter": "verify:cli",
        "config": { "command": "my-tool --check" }
      }
      ```

   e. **Composite**: repeatedly prompt for each step (1-based index) by
      offering the first four preset types only. Stop when the user
      selects "Done" or after a hard cap of 5 steps.

   f. Echo the resolved spec via `serializeBreakCondition(resolved)`.

   g. Save-confirmation prompt: "Save this as the default in
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
