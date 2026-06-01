---
name: agent-init
description: Bootstrap a Claude Code agent harness in the current project — CLAUDE.md, AGENTS.md, .claude/agents/, hooks, plugin wiring, all in one invocation. Use when starting a new project or adopting Claude Code on an existing one without an existing CLAUDE.md. (Renamed from /harness-init in v0.2.0)
---

# /agent-init

Sets up a full per-project agent harness following the three operating principles: brainstorming-first, superpowers for parallel, context-mode for large output.

## Default profile

Default (no theme flag) is operational/heavy. It renders the task ledger,
local folder guides, reviewer personas, policy hooks, foundation checks, and
the floor bundle (`.visual-qa.json` + `.agent-all.json`). Use `--lite` only
when a project needs a minimal root memory and minimal role roster.

## Flags

- `--force` — re-run all phases; overwrite existing artefacts.
- `--merge` — preserve existing CLAUDE.md and append a harness section.
- `--dry-run` — print decisions and intended writes; touch nothing.
- `--lite` — canonical lightweight mode; skips task ledger, local folder guides, policy hooks, reviewer personas, and global config patch prompts.
- `--update-foundations` — after printing the foundation plan, run the approved update path. Does not patch global CLI config.
- `--platform=claude,codex,gemini` — select platform artifacts to wire. Defaults to prompting in interactive use and Claude-only in non-interactive use.
- `--resume` — skip phases already marked complete in `.claude/.agent-init-state.json`.
- `--size=small|medium|large` — override auto-inferred agent team size.
- `--qa=<persona>[,<persona>]` — override auto-inferred QA personas.
- `--lang=ko|en|auto` — (v0.5.1+) force the brainstorming dialogue language, or use `--lang=auto` to resolve from `$AGENT_INIT_LANG`, `$LANG`, `$LC_ALL`, `$LC_MESSAGES` / locale before downstream commands inherit it. The scaffolded `CLAUDE.md` and `.agent-all.json` record the resolved `ko`/`en` choice.

## Compatibility flags

- `--theme=floor` — legacy alias for the default operational/heavy profile.
- `--theme=lite` — legacy alias for `--lite`. Print a deprecation note and behave exactly like `--lite`.
- `--visual-qa` — legacy alias that scaffolds only `.visual-qa.json` without the rest of the floor bundle. Most users want the default operational/heavy profile instead.

## Pipeline

The skill runs 5 phases strictly in order. Each phase is described in a separate file; read them on demand with the Read tool.

| Phase | File | Purpose |
|-------|------|---------|
| 0 (preflight) | `phases/1-discover.md` § Preflight | git check, conflict scan, plugin scan |
| 1 | `phases/1-discover.md` | brainstorming + stack detection |
| 2 | `phases/2-claude-md.md` | render & write CLAUDE.md and AGENTS.md |
| 3 | `phases/3-agents.md` | fan-out render of `.claude/agents/*.md` |
| 4 | `phases/4-hooks.md` | copy hooks, register in `settings.local.json` |
| 5 | `phases/5-wire.md` | surface missing plugins, commit, summarise |

## Rules

1. **You orchestrate; the phase files are the source of truth.** Before each phase, Read its file and follow it literally.
2. **State lives in `.claude/.agent-init-state.json`.** Shape: `{ "phases": [{ "phase": N, "completedAt": "<iso>" }], "discovery": {...}, "plugin_scan": {...}, "commit": "<sha>" }`. After each completed phase, append a `{phase, completedAt}` entry to `phases`. `--resume` resumes after `max(phases[*].phase)`.
3. **Brainstorm before scaffolding.** Phase 1 invokes `superpowers:brainstorming` — do not skip it even if you "know" what the user wants.
4. **Parallel only in Phase 3.** Before fan-out, invoke `superpowers:dispatching-parallel-agents` to set up the dispatch correctly.
5. **context-mode for any inspection.** When reading `installed_plugins.json`, large directories, or `git status`, use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` instead of raw Bash.
6. **Operational profile is default.** Unless `--lite` or `--theme=lite` is passed, render task ledger, local guides, policy hooks, and foundation checks.
7. **Dry-run is a no-mutation planning mode.** When `--dry-run` is set, phases must only compute and print planned writes. Do not write root files, local guides, agents, hooks, settings, state files, task ledger files, platform artifacts, foundation updates, global config patches, or commits. Phase 5 prints the complete plan and exits.

## Lib modules

Deterministic mechanics live in `lib/`. Import them when a phase says so:

- `lib/render.mjs` — `render(tpl, ctx)` for `.hbs` templates
- `lib/detect-stack.mjs` — `detectProject(projectDir)` → `{ stack, runtime, services }` (`detectStack(projectDir)` kept as a back-compat wrapper returning the stack string)
- `lib/plugin-scan.mjs` — `scanPlugins({ installedPlugins, enabledPlugins, required })`
- `lib/manifest-merge.mjs` — `mergeSettings(current, additions)`
- `lib/sentinel-merge.mjs` — `mergeSentinelSection(existing, generated)` for root and folder guidance files
- `lib/folder-guides.mjs` — `detectGuideDirs(projectDir)` for local guide discovery
- `lib/foundation-check.mjs` — `scanFoundationState({ installedPluginIds })` for degraded foundation reporting

Each phase file names which helpers it needs and how to call them.

## On error

- Conflict (incomplete sentinel markers, or existing generated agents/hooks without `--merge`/`--force`): abort with a message naming the next user action.
- Missing required plugins (`context-mode`, `superpowers`): do NOT abort; surface install commands in Phase 5 and continue in degraded mode.
- Hook smoke-test failure: print warning, continue.
- Anything else: log and abort cleanly. Never leave a half-written `settings.local.json`.

## When done

Print a one-screen summary: phases completed, files written, plugin install commands the user still needs to run, and one-line next-step suggestion.
