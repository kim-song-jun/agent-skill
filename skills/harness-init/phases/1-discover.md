# Phase 1 — Discover

## Preflight (run before Phase 1 proper)

1. Confirm `pwd` is a git repository (`.git/` exists). If not: print `git init` suggestion, abort.
2. Check for existing artefacts. Abort (unless `--force` or `--merge`) if any of these exist:
   - `CLAUDE.md` (unless `--merge` set)
   - `.claude/agents/` non-empty
   - `.claude/hooks/` contains any of `context-mode-router.mjs`, `session-summary.mjs`, `cache-heal.mjs`
3. Read `~/.claude/plugins/installed_plugins.json` and the active `settings.json` `enabledPlugins`. Call:
   ```javascript
   import { scanPlugins } from "./lib/plugin-scan.mjs";
   const scan = scanPlugins({ installedPlugins, enabledPlugins, required: ["context-mode@context-mode", "superpowers@claude-plugins-official"] });
   ```
   Stash `scan` for Phase 5. Do NOT abort on missing plugins.
4. Read `.claude/.harness-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 1`, skip Phase 1 proper.

## Phase 1 proper

1. Invoke `Skill` with `superpowers:brainstorming` and these prompts:
   - Project purpose (1-2 sentences for CLAUDE.md preamble)
   - Size: small / medium / large (override: `--size`)
   - QA personas (override: `--qa`)
   - Deploy targets
   - Special constraints (compliance, performance budgets, etc.)
2. Run `detectStack(cwd)` from `lib/detect-stack.mjs`. Stash result.
3. Build the discovery context object:
   ```javascript
   const ctx = {
     purpose: "...",                  // from brainstorming
     size: "medium",                  // from brainstorming or --size
     qa_personas: ["auth"],           // from brainstorming or --qa
     deploy_targets: "vercel",        // from brainstorming
     constraints: "",                 // from brainstorming
     stack: detectStack(cwd),         // from helper
   };
   ```
4. Update `.claude/.harness-state.json` (create with `{ "phases": [] }` if missing). Set top-level `discovery` and `plugin_scan`, then push `{ "phase": 1, "completedAt": "<iso>" }` onto `phases`. Use atomic write: temp file + rename.
5. Do not commit yet. Phase 5 makes a single bootstrap commit.

## Output to user

Print a 3-line summary: detected stack, chosen size, QA personas. Ask "proceed to Phase 2?" and wait for confirmation unless `--yes` was passed.
