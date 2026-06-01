# Phase 1 — Discover

## Preflight (run before Phase 1 proper)

1. Confirm `pwd` is a git repository (`.git/` exists). If not: print `git init` suggestion, abort.
2. Check for existing artefacts. Preserve existing `CLAUDE.md` and `AGENTS.md` via sentinel merge in Phase 2. Abort (unless `--force` or `--merge`) if any of these generated artefacts already exist:
   - `.claude/agents/` non-empty
   - `.claude/hooks/` contains any of `context-mode-router.mjs`, `session-summary.mjs`, `cache-heal.mjs`
3. Read `~/.claude/plugins/installed_plugins.json` and the active `settings.json` `enabledPlugins`. Call:
   ```javascript
   import { scanPlugins } from "./lib/plugin-scan.mjs";
   const scan = scanPlugins({ installedPlugins, enabledPlugins, required: ["context-mode@context-mode", "superpowers@claude-plugins-official"] });
   ```
   Stash `scan` for Phase 5. Do NOT abort on missing plugins.
4. Call `scanFoundationState` using installed plugin IDs from the plugin scan. Stash the result as `degradedFoundations`/`foundation_state` for later phases. Continue when degraded; Phase 5 prints the update plan.
5. Read `.claude/.agent-init-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 1`, skip Phase 1 proper.

## Phase 1 proper

0. **Resolve interaction language (v0.5.1+).** Detect the language the brainstorming dialogue should run in:
   ```javascript
   // Priority: explicit ko/en flag > --lang=auto/env auto fallthrough > $AGENT_INIT_LANG > $LANG/$LC_ALL > 'en'
   function detectLang() {
     if (process.argv.includes("--lang=ko")) return "ko";
     if (process.argv.includes("--lang=en")) return "en";
     const autoLang = process.argv.includes("--lang=auto") || process.env.AGENT_INIT_LANG === "auto";
     if (!autoLang && (process.env.AGENT_INIT_LANG === "ko" || process.env.AGENT_INIT_LANG === "en")) return process.env.AGENT_INIT_LANG;
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

1. **Reject unsupported theme flags.** If `flags.theme` is set and is not
   `"lite"` or `"floor"`, abort before brainstorming with:
   ```text
   Unsupported `--theme=` value "<value>". Default /agent-init is operational/heavy; pass --lite for the lightweight scaffold. Use `/thrift` after `/agent-init` for cost controls.
   ```
2. **Resolve profile.** `lite = flags.lite || flags.theme === "lite"`. Default profile is operational/heavy. If `--theme=lite` was used, print a deprecation note and behave exactly as `--lite`.
3. **Resolve theme.** This decision must be available before Phase 2 renders `CLAUDE.md`:
   - If `lite` is true: `theme = "lite"` and `floorTheme = false`.
   - Else if `--visual-qa` was passed without `--theme=*`: `theme = "legacy-visual-qa"` and `floorTheme = false`.
   - Else if `--theme=floor` was passed OR no theme flag was passed: `theme = "floor"` and `floorTheme = true`.
4. Invoke `Skill` with `superpowers:brainstorming` and these prompts (with the language directive from step 0 prepended when applicable):
   - Project purpose (1-2 sentences for CLAUDE.md preamble)
   - Size: small / medium / large (override: `--size`)
   - QA personas (override: `--qa`)
   - Deploy targets
   - Special constraints (compliance, performance budgets, etc.)
5. Run `detectProject(cwd)` from `lib/detect-stack.mjs`. It returns `{ stack, runtime, services }`. Stash result.
6. Call `detectGuideDirs(projectRoot)` and store the result as `local_guides` in state discovery.
7. Build the discovery context object:
   ```javascript
   const detected = detectProject(cwd);   // { stack, runtime, services }
   const local_guides = lite ? [] : detectGuideDirs(cwd);
   const ctx = {
     purpose: "...",                 // from brainstorming
     size: "medium",                 // from brainstorming or --size
     qa_personas: ["auth"],          // from brainstorming or --qa
     deploy_targets: "vercel",       // from brainstorming
     constraints: "",                // from brainstorming
     liteProfile: lite,
     operationalProfile: !lite,
     theme,
     floorTheme,
     degradedFoundations: foundationState.degraded,
     local_guides,
     ...detected,                    // stack, runtime, services
     services_str: detected.services.join(", "), // pre-joined for template
   };
   ```
8. If `--dry-run` is set, print the discovered decisions and planned state summary without writing:
   - Discovery context that would be stored for later phases.
   - Theme and `floorTheme` decision that Phase 2 and Phase 5 would consume.
   - Plugin scan results that Phase 5 will report.
   - Foundation state and whether `--update-foundations` would have work.
   - Local guide directories that later phases would plan.
   - Continue with the in-memory context without writing `.claude/.agent-init-state.json`.
9. Update `.claude/.agent-init-state.json` (create with `{ "phases": [] }` if missing). Set top-level `discovery`, `plugin_scan`, and `foundation_state`, then push `{ "phase": 1, "completedAt": "<iso>" }` onto `phases`. Use atomic write: temp file + rename.
10. Do not commit yet. Phase 5 makes a single bootstrap commit.

## Output to user

Print a summary and ask "proceed to Phase 2?" and wait for confirmation unless `--yes` was passed. Output exactly:

- Line 1: `detected stack: <stack>`
- Line 2 (skip entirely if `runtime` is null): `runtime: <runtime>` followed by ` (services: <services joined with comma+space>)` only when `services` is non-empty
- Line 3: `chosen size: <size> / QA: <qa_personas joined with comma+space>`
