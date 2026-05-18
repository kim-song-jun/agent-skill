---
name: agent-init
description: Bootstrap a Claude Code agent harness in the current project — CLAUDE.md, .claude/agents/, hooks, plugin wiring, all in one invocation. Use when starting a new project or adopting Claude Code on an existing one without an existing CLAUDE.md. (Renamed from /harness-init in v0.2.0)
---

# /agent-init

Sets up a full per-project agent harness following the three operating principles: brainstorming-first, superpowers for parallel, context-mode for large output.

## Flags

- `--force` — re-run all phases; overwrite existing artefacts.
- `--merge` — preserve existing CLAUDE.md and append a harness section.
- `--dry-run` — print decisions and intended writes; touch nothing.
- `--resume` — skip phases already marked complete in `.claude/.agent-init-state.json`.
- `--size=small|medium|large` — override auto-inferred agent team size.
- `--qa=<persona>[,<persona>]` — override auto-inferred QA personas.
- `--theme=floor` — (DEFAULT) bundle harness-floor configs (.visual-qa.json + .agent-all.json + CLAUDE.md Floor section). Implicit `--visual-qa`.
- `--theme=lite` — minimal scaffold; skip the floor bundle (no .visual-qa.json, no .agent-all.json, no Floor section in CLAUDE.md).
- `--theme=thrift` — (RESERVED, Theme B planned) cost-optimization mode. Currently a no-op stub; design pending. Use `--theme=floor` (default) or `--theme=lite` for now.
- `--visual-qa` — (legacy alias) scaffold only `.visual-qa.json` without the rest of the floor bundle. Most users want the default theme=floor instead.

## Pipeline

The skill runs 5 phases strictly in order. Each phase is described in a separate file; read them on demand with the Read tool.

| Phase | File | Purpose |
|-------|------|---------|
| 0 (preflight) | `phases/1-discover.md` § Preflight | git check, conflict scan, plugin scan |
| 1 | `phases/1-discover.md` | brainstorming + stack detection |
| 2 | `phases/2-claude-md.md` | render & write CLAUDE.md |
| 3 | `phases/3-agents.md` | fan-out render of `.claude/agents/*.md` |
| 4 | `phases/4-hooks.md` | copy hooks, register in `settings.local.json` |
| 5 | `phases/5-wire.md` | surface missing plugins, commit, summarise |

## Rules

1. **You orchestrate; the phase files are the source of truth.** Before each phase, Read its file and follow it literally.
2. **State lives in `.claude/.agent-init-state.json`.** Shape: `{ "phases": [{ "phase": N, "completedAt": "<iso>" }], "discovery": {...}, "plugin_scan": {...}, "commit": "<sha>" }`. After each completed phase, append a `{phase, completedAt}` entry to `phases`. `--resume` resumes after `max(phases[*].phase)`.
3. **Brainstorm before scaffolding.** Phase 1 invokes `superpowers:brainstorming` — do not skip it even if you "know" what the user wants.
4. **Parallel only in Phase 3.** Before fan-out, invoke `superpowers:dispatching-parallel-agents` to set up the dispatch correctly.
5. **context-mode for any inspection.** When reading `installed_plugins.json`, large directories, or `git status`, use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` instead of raw Bash.

## Lib modules

Deterministic mechanics live in `lib/`. Import them when a phase says so:

- `lib/render.mjs` — `render(tpl, ctx)` for `.hbs` templates
- `lib/detect-stack.mjs` — `detectProject(projectDir)` → `{ stack, runtime, services }` (`detectStack(projectDir)` kept as a back-compat wrapper returning the stack string)
- `lib/plugin-scan.mjs` — `scanPlugins({ installedPlugins, enabledPlugins, required })`
- `lib/manifest-merge.mjs` — `mergeSettings(current, additions)`

Each phase file names which helpers it needs and how to call them.

## On error

- Conflict (existing CLAUDE.md without `--merge`/`--force`): abort with a message naming the next user action.
- Missing required plugins (`context-mode`, `superpowers`): do NOT abort; surface install commands in Phase 5 and continue in degraded mode.
- Hook smoke-test failure: print warning, continue.
- Anything else: log and abort cleanly. Never leave a half-written `settings.local.json`.

## When done

Print a one-screen summary: phases completed, files written, plugin install commands the user still needs to run, and one-line next-step suggestion.
