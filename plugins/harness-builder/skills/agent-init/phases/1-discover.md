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
4. Read `.claude/.agent-init-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 1`, skip Phase 1 proper.

## Phase 1 proper

0. **Resolve interaction language (v0.5.1+).** Detect the language the brainstorming dialogue should run in:
   ```javascript
   // Priority: --lang flag > $AGENT_INIT_LANG > $LANG/$LC_ALL > 'en'
   function detectLang() {
     if (process.argv.includes("--lang=ko")) return "ko";
     if (process.argv.includes("--lang=en")) return "en";
     if (process.env.AGENT_INIT_LANG === "ko" || process.env.AGENT_INIT_LANG === "en") return process.env.AGENT_INIT_LANG;
     const loc = (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "").toLowerCase();
     if (loc.startsWith("ko")) return "ko";
     return "en";
   }
   const interactionLang = detectLang();
   ```
   When `interactionLang === "ko"`, prepend this directive to the brainstorming dispatch prompt:
   > **Conduct this brainstorming dialogue in Korean (한국어).** All questions to the user, all summaries, and the final design recap should be in Korean. Tokens that are part of machine contracts (file paths, JSON keys, command names, `STATUS:`, `VERIFICATION_AUDIT:`, etc.) MUST stay English regardless.

   When `interactionLang === "en"`, no prefix needed (the default).

   Stash `ctx.interactionLang` for use in later phases — agent templates inherit it via `{{interactionLang}}` so dispatched subagents speak the same language.

1. Invoke `Skill` with `superpowers:brainstorming` and these prompts (with the language directive from step 0 prepended when applicable):
   - Project purpose (1-2 sentences for CLAUDE.md preamble)
   - Size: small / medium / large (override: `--size`)
   - QA personas (override: `--qa`)
   - Deploy targets
   - Special constraints (compliance, performance budgets, etc.)
2. Run `detectProject(cwd)` from `lib/detect-stack.mjs`. It returns `{ stack, runtime, services }`. Stash result.
3. Build the discovery context object:
   ```javascript
   const detected = detectProject(cwd);   // { stack, runtime, services }
   const ctx = {
     purpose: "...",                 // from brainstorming
     size: "medium",                 // from brainstorming or --size
     qa_personas: ["auth"],          // from brainstorming or --qa
     deploy_targets: "vercel",       // from brainstorming
     constraints: "",                // from brainstorming
     ...detected,                    // stack, runtime, services
     services_str: detected.services.join(", "), // pre-joined for template
   };
   ```
4. Update `.claude/.agent-init-state.json` (create with `{ "phases": [] }` if missing). Set top-level `discovery` and `plugin_scan`, then push `{ "phase": 1, "completedAt": "<iso>" }` onto `phases`. Use atomic write: temp file + rename.
5. Do not commit yet. Phase 5 makes a single bootstrap commit.

## Output to user

Print a summary and ask "proceed to Phase 2?" and wait for confirmation unless `--yes` was passed. Output exactly:

- Line 1: `detected stack: <stack>`
- Line 2 (skip entirely if `runtime` is null): `runtime: <runtime>` followed by ` (services: <services joined with comma+space>)` only when `services` is non-empty
- Line 3: `chosen size: <size> / QA: <qa_personas joined with comma+space>`
