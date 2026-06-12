> 🇰🇷 한국어: [2026-05-17-harness-builder-design.ko.md](2026-05-17-harness-builder-design.ko.md)

# Harness Builder Skill — Design Spec

**Status:** Approved (brainstorming complete, awaiting plan)
**Date:** 2026-05-17
**Author:** kimsongjun
**Theme:** A of 3 (per-project harness builder)

**Note (2026-05-18):** `/harness-init` was renamed to `/agent-init` in harness-builder v0.2.0. References below to the old name reflect the original design and remain accurate for that timeframe. Treat `harness-init` and `agent-init` as the same skill in current code.

---

## 1. Purpose

Provide a single Claude Code skill — `/agent-init` — that, when invoked inside a fresh project, bootstraps a complete agent harness:

- `CLAUDE.md` (project memory, agent index)
- `.claude/agents/*.md` (planner / dev / designer / qa-* / tester / reviewer)
- `.claude/hooks/*.mjs` (context-mode router, session-summary, cache-heal)
- `.claude/settings.local.json` (hook + permission registration)
- `docs/superpowers/{specs,plans}/`, `docs/decisions/`, `docs/tasks/` (work-product folders)

All generated artefacts encode three operating principles in their prompts:

1. Invoke `superpowers:brainstorming` before any deliverable.
2. Invoke `superpowers:dispatching-parallel-agents` (or `subagent-driven-development`) before fanning out 2+ independent subtasks.
3. Prefer `context-mode` (`ctx_batch_execute`) over raw Bash for any command whose output may exceed ~20 lines.

The skill itself follows the same three principles when it runs.

## 2. Non-Goals

- Not a generator for application code, schemas, or business logic — only the *harness around* the work.
- Not a replacement for `claude-md-improver` — does not retro-fit existing CLAUDE.md files (offers `--merge` instead).
- Not a CI/CD installer — produced hooks are local Claude Code hooks, not git pre-commit hooks.
- Does not install or update external plugins itself — surfaces the exact commands and asks the user to run them.

## 3. Inputs / Outputs

**Inputs (implicit):** target project working directory, git state, manifest files (package.json, pyproject.toml, Cargo.toml, go.mod), README first paragraph, existing `enabledPlugins` / `installed_plugins.json`.

**Inputs (explicit flags):**
- `--force` — re-run all phases, overwrite existing harness artefacts.
- `--merge` — preserve an existing `CLAUDE.md` and append a harness section.
- `--dry-run` — print every decision and file path that *would* be written; write nothing.
- `--resume` — skip phases already marked complete in `.claude/.agent-init-state.json`.
- `--size=small|medium|large` — override auto-inferred agent team size.
- `--qa=<persona>[,<persona>]` — override auto-inferred QA persona list.

**Outputs (per project):**

```
my-project/
├── CLAUDE.md
├── .claude/
│   ├── agents/
│   │   ├── planner.md
│   │   ├── dev.md
│   │   ├── reviewer.md
│   │   ├── designer.md            # medium+
│   │   ├── qa-{persona}.md        # medium+
│   │   ├── tester.md              # medium+
│   │   ├── frontend-dev.md        # large
│   │   ├── backend-dev.md         # large
│   │   └── doc-writer.md          # large
│   ├── hooks/
│   │   ├── context-mode-router.mjs
│   │   ├── session-summary.mjs
│   │   └── cache-heal.mjs
│   ├── settings.local.json
│   └── .agent-init-state.json        # .gitignored
└── docs/
    ├── superpowers/specs/
    ├── superpowers/plans/
    ├── decisions/
    └── tasks/
```

## 4. Architecture

### 4.1 Repo Layout

The repo at `/path/to/agent-skill/` is a Claude Code plugin marketplace containing one plugin (`harness-builder`) for now; themes B and C will add sibling plugins later.

```
agent-skill/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── skills/
│   └── harness-init/
│       ├── SKILL.md
│       ├── phases/
│       │   ├── 1-discover.md
│       │   ├── 2-claude-md.md
│       │   ├── 3-agents.md
│       │   ├── 4-hooks.md
│       │   └── 5-wire.md
│       ├── lib/
│       │   ├── render.mjs              # template rendering (pure)
│       │   ├── manifest-merge.mjs      # settings.local.json merge (pure)
│       │   ├── detect-stack.mjs        # manifest-based stack detection (pure)
│       │   └── plugin-scan.mjs         # installed_plugins.json classification (pure)
│       ├── templates/
│       │   ├── CLAUDE.md.hbs
│       │   ├── agents/
│       │   │   ├── planner.md.hbs
│       │   │   ├── dev.md.hbs
│       │   │   ├── designer.md.hbs
│       │   │   ├── qa.md.hbs
│       │   │   ├── tester.md.hbs
│       │   │   ├── reviewer.md.hbs
│       │   │   ├── frontend-dev.md.hbs
│       │   │   ├── backend-dev.md.hbs
│       │   │   └── doc-writer.md.hbs
│       │   ├── hooks/
│       │   │   ├── context-mode-router.mjs
│       │   │   ├── session-summary.mjs
│       │   │   └── cache-heal.mjs
│       │   └── settings.local.json.hbs
│       └── references/
│           └── legacy-notes.md
├── hooks/
│   └── context-mode-cache-heal.mjs   # global hook migrated from ~/.claude/hooks/
├── docs/
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── README.md
└── CHANGELOG.md
```

`SKILL.md` is intentionally thin (≤ 150 lines): names the phases and points to `phases/*.md`. Each phase file is loaded on demand via `Read`, keeping the Skill-tool load cost low. Deterministic mechanics (template rendering, settings merge, stack detection, plugin scan) live as pure JS modules in `skills/agent-init/lib/` so they are unit-testable without spawning Claude Code.

### 4.2 Plugin Manifest

`.claude-plugin/marketplace.json` registers one plugin source so users can do `/plugin marketplace add <git-url>` once.

`.claude-plugin/plugin.json` registers:
- `skills`: `skills/agent-init/`
- `hooks`: `hooks/context-mode-cache-heal.mjs` (global, SessionStart)

### 4.3 Phase Pipeline

`/agent-init` runs phases strictly in order. Each phase records completion to `.claude/.agent-init-state.json` so `--resume` can pick up after an interruption.

| Phase | Name | Purpose | Parallel? |
|-------|------|---------|-----------|
| 0 | Preflight | git check, conflict check, dependency scan | No |
| 1 | Discover | `superpowers:brainstorming` + stack detection | No |
| 2 | CLAUDE.md | Render template, write file | No |
| 3 | Agents | Render all role files | **Yes** — fan-out via `superpowers:dispatching-parallel-agents` |
| 4 | Hooks | Copy hook files, register in `settings.local.json` | No |
| 5 | Wire | Surface missing-plugin install commands, commit | No |

Only Phase 3 fans out, because role-file rendering has no inter-dependencies and is the only phase where parallel work meaningfully reduces wall-clock time.

### 4.4 Dependency Resolution

Phase 0 reads `~/.claude/plugins/installed_plugins.json` and the active `settings.json` `enabledPlugins` block. Plugins are classified into three buckets:

| State | Action |
|-------|--------|
| Enabled | Pass |
| Installed but disabled | Note in Phase 5 output ("run `/plugin enable …`") |
| Missing | Note in Phase 5 output ("run `/plugin marketplace add …` then `/plugin install …`") |

Required plugins (skill aborts only at user request, not automatically):
- `context-mode@context-mode`
- `superpowers@claude-plugins-official`

Optional plugins (mentioned only):
- `frontend-design@claude-plugins-official`
- `codex@openai-codex`
- `claude-md-management@claude-plugins-official`

The skill never executes `/plugin` commands itself. It prints the commands and waits for the user to run them; once they confirm, the skill writes the final commit.

## 5. Component Detail

### 5.1 Phase 1 — Discover

Calls `Skill` tool with `superpowers:brainstorming` to align with the user on:

- Project purpose (1-2 sentences for CLAUDE.md preamble)
- Size (small / medium / large) — default inferred from LoC + manifest count, override via `--size`
- QA personas — inferred from README terms, presence of auth/payment/admin routes, ORM schema; override via `--qa`
- Deploy targets (vercel / cloudflare / docker / none)
- Special constraints (compliance, performance budgets, …)

During the brainstorming dialogue, the skill synchronously reads manifest files to detect stack:

| Manifest | Stack |
|----------|-------|
| `package.json` + `tsconfig.json` | typescript |
| `package.json` only | javascript |
| `pyproject.toml` / `requirements.txt` | python |
| `Cargo.toml` | rust |
| `go.mod` | go |

Stack drives template selection and the `dev.md` agent's tool list.

Phase output (memory only, not yet written to disk): `{stack, size, qa_personas, deploy_targets, constraints, purpose}`.

### 5.2 Phase 2 — CLAUDE.md

Renders `templates/CLAUDE.md.hbs` with the Phase 1 dictionary. Template sections:

1. Project purpose (from Discover)
2. Stack summary
3. Agent index (names + roles + when to invoke)
4. Operating principles (the three rules)
5. Hook summary (what each hook does, where to find it)
6. Pointer to `docs/superpowers/specs/` and `docs/superpowers/plans/`

If `CLAUDE.md` already exists and `--merge` is set: append "## Harness" section at the end. If `--merge` is not set and the file exists: Phase 0 already aborted.

Writes file but does not commit (Phase 5 handles the commit).

### 5.3 Phase 3 — Agents

The only parallel phase. The skill invokes `Skill` with `superpowers:dispatching-parallel-agents` before fanning out, then dispatches one subagent per role with the role's template and the Phase 1 context.

Each role file is generated from its template with the three operating principles baked into the front-matter and the `## Rules` section.

Role inclusion by size:
- `small`: planner, dev, reviewer
- `medium`: + designer, qa-{persona}…, tester
- `large`: + frontend-dev, backend-dev, doc-writer

If `qa_personas` is empty for `medium`, default to a single `qa-general.md`.

### 5.4 Phase 4 — Hooks

Copies three hook files from `templates/hooks/` to the project's `.claude/hooks/`:

| File | Event | Behaviour |
|------|-------|-----------|
| `context-mode-router.mjs` | `PreToolUse` (matcher: `Bash`) | Emits a `<context_guidance>` tip when the command is likely to produce >20 lines |
| `session-summary.mjs` | `Stop` | Writes a Markdown decision-log entry to `docs/decisions/YYYY-MM-DD-<slug>.md` |
| `cache-heal.mjs` | `SessionStart` | Self-heal plugin cache symlinks (project-scoped port of the global hook) |

Then writes/merges `.claude/settings.local.json` to register all three hooks. Existing entries are preserved.

### 5.5 Phase 5 — Wire

1. Surfaces the dependency-resolution output from Phase 0 (missing/disabled plugins + commands).
2. Updates `.gitignore` to add `.claude/.agent-init-state.json`.
3. `git add` everything written across phases.
4. Creates commit: `chore: bootstrap harness via /agent-init`.
5. Prints success summary with next steps ("try `/plan some-task`", "review `.claude/agents/planner.md`").

If the user has not yet installed the required plugins, the commit still happens — the harness works without them, just with reduced features.

## 6. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Not a git repo | Print `git init` suggestion; do not run it. Abort. |
| `CLAUDE.md` exists, no `--merge` / `--force` | Abort with message recommending `claude-md-improver` or `--merge`. |
| `.claude/agents/<role>.md` exists | Abort unless `--force`. Suggest `--force` if intentional. |
| `.agent-init-state.json` says Phase N complete, but a phase-N artefact is missing | Treat as corrupted; require `--force` to re-run. |
| Hook execution fails at runtime (e.g. cache-heal) | Hook itself silently swallows errors (try/catch). User's workflow is never blocked. |
| External plugin install fails | Skill does not abort. Prints "install manually, then `/agent-init --resume`". |
| User declines plugin install at Phase 5 | Skill completes with a warning; harness still functions in degraded mode. |

All error messages name the next user action explicitly. No silent failures.

## 7. Testing Strategy

### 7.1 Lib Tests (`tests/lib/`)

The `skills/agent-init/lib/` modules are pure JS and directly testable. Runner: Node.js native test runner (`node --test`). Zero dependencies.

| Module | Test |
|--------|------|
| `detect-stack.mjs` | Seed tmpdirs with the 5 stack fixtures (Node TS, Python, Rust, Go, monorepo); assert correct stack id returned. |
| `plugin-scan.mjs` | Feed synthetic `installed_plugins.json` + `enabledPlugins` blobs; assert correct classification (enabled / disabled / missing). |
| `manifest-merge.mjs` | Given an existing `settings.local.json` with hooks already registered, assert that merging new hook entries preserves the old ones without duplicates. |
| `render.mjs` | Render every template against 5 fixture inputs (one per supported stack × size combo) and snapshot the output. Catches unintended template drift. |

The phase prompts (`phases/*.md`) themselves are not unit-tested; the manual checklist (§7.2) covers their end-to-end behaviour.

### 7.2 Manual End-to-End Checklist (`tests/manual-checklist.md`)

Run `/agent-init` in real Claude Code against a fresh fixture project and tick:

- [ ] Phase 1 actually triggers `superpowers:brainstorming`
- [ ] Re-running with no flags is a no-op (idempotency)
- [ ] `--force` rebuilds from scratch
- [ ] `--dry-run` writes nothing
- [ ] `--merge` preserves an existing CLAUDE.md
- [ ] Missing-plugin output lists the exact commands
- [ ] Phase 3 actually dispatches in parallel (visible in agent log)
- [ ] Generated `planner.md` references brainstorming
- [ ] `.agent-init-state.json` is in `.gitignore`
- [ ] Final commit message matches `chore: bootstrap harness via /agent-init`

The manual checklist runs before each release; it is not part of CI.

### 7.3 Out of Scope

- Mocking Claude Code's hook runtime to test hook behaviour end-to-end (covered by manual checklist).
- Testing the `/plugin install` external flow (user-driven).

## 8. Examples

### Default bootstrap on a fresh Node project

```
mkdir hello && cd hello && git init && npm init -y
/agent-init
```

Result:
- `CLAUDE.md` (52 lines) with javascript stack inferred from package.json
- `.claude/agents/{planner,dev,reviewer}.md` (small size auto-inferred)
- `.claude/hooks/{context-mode-router,session-summary,cache-heal}.mjs`
- `.claude/settings.local.json`
- `.visual-qa.json` (Floor theme default)
- `.agent-all.json` (Floor theme default)
- 1 commit: `chore: bootstrap harness via /agent-init`

### Re-running on an existing project

```
cd existing-project   # already has CLAUDE.md
/agent-init --merge
```

Appends `## Harness` section to existing CLAUDE.md.

### Sizing override

```
/agent-init --size=large --qa=auth,payment
```

Produces 9-role roster + 2 QA persona files.

## 9. Future Work (out of scope for this spec)

- **Theme B (Token cost optimization)**: a sibling plugin that adds aggressive context-mode patterns, prompt-cache-friendly templates, summarisation hooks.
- **Theme C (Cost-unrestricted parallel mode)**: a sibling plugin that wraps `agent-all` + `ralph-loop` + `codex:rescue` for high-throughput iterations.
- **`/harness-upgrade`**: re-pull templates and patch existing harnesses in-place.
- **Telemetry opt-in**: aggregate which phases users `--skip` to inform future defaults.
