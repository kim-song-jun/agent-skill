> 🇰🇷 한국어: [README.ko.md](README.ko.md)

# agent-skill

Claude Code plugin marketplace for **`/agent-init`** and the cost-unrestricted-by-default agent harness ecosystem.

One command (`/agent-init`) bootstraps a complete agent harness: CLAUDE.md, role-specific subagent files, hooks, plugin wiring, and (by default) the full Floor theme bundle for visual-QA and multi-wave pipeline execution.

## Table of Contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Examples by stack](#examples-by-stack)
- [Command reference](#command-reference)
- [Themes](#themes)
- [Composition patterns](#composition-patterns)
- [Codex / non-Claude-Code platforms](#codex--non-claude-code-platforms)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [FAQ](#faq)
- [Versioning](#versioning)

## Quick start

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
```

Then in any git repo:

```
/agent-init                        # full Floor harness (DEFAULT)
/agent-init --theme=lite           # minimal: CLAUDE.md + agents + hooks only
/agent-init --theme=thrift         # RESERVED: token-cost optimisation (Theme B planned)
/agent-init --size=large --force   # rebuild with 9-agent roster
```

Then run any of:

```
/agent-all "Add user signup form"                  # full pipeline → PR
/agent-all "Fix flaky test" --loop --max-iter=5    # iterate until green
/visual-qa                                          # screenshot matrix + LLM analysis
```

## How it works

### `/agent-init` lifecycle

`/agent-init` executes 7 phases sequentially. Each phase produces artifacts and updates the state file at `.claude/.agent-init-state.json`.

#### Phase 0 — Preflight
- **Check:** git repo exists, plugin versions, Node.js
- **Produce:** initial `.claude/.agent-init-state.json` with `phases: [{phase: 0, ...}]`
- **May exit:** if checks fail (e.g., not a git repo)

#### Phase 1 — Discover (brainstorm)
- **Invokes:** `superpowers:brainstorming` to understand project intent
- **Runs:** `lib/detect-stack.mjs` — scans `package.json`, `pyproject.toml`, `Cargo.toml`, etc.
- **Produce:** discovery context: `{ purpose, stack, size, qa_personas, deploy_targets, constraints }`
- **Update state:** `discovery: {...}`

#### Phase 2 — CLAUDE.md (render)
- **Renders:** `templates/CLAUDE.md.hbs` against discovery context
- **Produce:** project-root `CLAUDE.md` with project purpose, agent roster, operating principles
- **Uses:** `lib/render.mjs` (Handlebars templating)
- **Update state:** `phases: [..., {phase: 2, timestamp, claudes_md: "..."}]`

#### Phase 3 — Agents (parallel fan-out)
- **Invokes:** `superpowers:dispatching-parallel-agents`
- **For each role** (planner, dev, designer, qa-*, tester, reviewer, etc.):
  - Render `templates/agents/{role}.md.hbs`
  - Create `.claude/agents/{role}.md`
  - Each agent receives baked-in operating principles from canonical template
- **Produce:** `.claude/agents/*.md` (6–9 files depending on `--size`)
- **Update state:** `agents: [{role, path, hash}, ...]`

#### Phase 4 — Hooks & Config
- **Copy hooks:** `templates/hooks/*.mjs` → `.claude/hooks/`
  - `cache-heal.mjs` — heal context-mode symlinks on SessionStart
  - `context-mode-router.mjs` — emit routing tips for likely-large Bash output
  - `session-summary.mjs` — append decision log at Stop
- **Smoke test:** each hook runs once (dry-run) to verify syntax
- **Renders:** `settings.local.json.hbs` with discovered values
- **Merges:** new settings into `.claude/settings.local.json` via `lib/manifest-merge.mjs` (no clobber of existing keys)
- **Update state:** `hooks: [{name, path, tested: true}, ...]`

#### Phase 4b/4c — Floor theme (if `--theme=floor`)
- **Render & produce:**
  - `.visual-qa.json` — from harness-floor's visual-qa config template
    - Default baseUrl: `http://localhost:3000` (or detected from `package.json` scripts)
    - Default breakpoints: mobile (375px), tablet (768px), desktop (1200px)
    - Component skeleton: `header`, `primary-cta`, etc.
  - `.agent-all.json` — from harness-floor's agent-all config template
    - Default breakCondition: `npm test` (or `pytest`, `cargo test` depending on stack)
    - Default loops: disabled (pass `--loop` at runtime)
    - Wave size: `medium` by default

#### Phase 5 — Wire & commit
- **Runs:** `lib/plugin-scan.mjs`
  - Identifies missing required plugins
  - Surfaces install commands for user
- **Updates:** `.gitignore` (adds `.agent-init-state.json`, `.visual-qa/` cache)
- **Creates:** single bootstrap commit: `"initial: /agent-init --theme={theme} --size={size}"`
- **Prints:** summary of created files + plugin install hints
- **Final state:** `phases: [..., {phase: 5, commit: "abc123...", installed: [...]}}]`

**Resume on Ctrl-C:** Pass `--resume` to pick up from the last successful phase.

### `/agent-all` lifecycle

`/agent-all` executes 7 phases, with phase 3 as the only parallel fan-out point.

| Phase | Name | Duration | Delegates to | Produces |
|-------|------|----------|--------------|----------|
| 0 | Preflight | <1s | local checks | `.agent-all-state.json` |
| 1 | Intent | 1–2m | `superpowers:brainstorming` (free-form) OR load task file | structured task + acceptance |
| 2 | Plan | 2–5m | `superpowers:writing-plans` | detailed spec w/ acceptance + task list |
| 3 | Dispatch | 5–60m | `lib/wave-builder.mjs` + `superpowers:subagent-driven-development` | PR branch + commits per wave |
| 4 | Gate | 2–10m | wave-level QA review subagents | quality report; retry on failures |
| 5 | PR | <1m | `gh pr create` + template render | PR created in GitHub |
| 6 | Loop eval | <1s | `lib/loop-evaluator.mjs` | breakCondition check; increment iter or exit |

**Wave builder logic:** `lib/wave-builder.mjs` reads the plan's task list and:
1. Groups tasks by file overlap (tasks sharing files → serialize into one wave)
2. Assigns independent tasks to separate waves (can run in parallel)
3. Caps parallel waves at `maxParallel` from `.agent-all.json`

Each wave is a `subagent-driven-development` batch; subagents commit their work to the same branch.

### `/visual-qa` lifecycle

6 phases. Phase 3 fans out per page.

| Phase | Name | Produces |
|-------|------|----------|
| 0 | Preflight | `.visual-qa-state.json` |
| 1 | Config load | baseUrl, pages, breakpoints from `.visual-qa.json` |
| 2 | Health check | verify baseUrl is alive |
| 3 | Capture (per-page fan-out) | screenshots × breakpoints; LLM analysis per page |
| 4 | Diff | pixel-level + visual diff vs prior run |
| 5 | Report | `docs/visual-qa/{slug}/report.md` + summary |

### Hook trigger flow

Three hooks are installed by `/agent-init` and fire from Claude Code itself:

**SessionStart** → `hooks/cache-heal.mjs`
- Self-heal context-mode plugin symlinks (if Claude Code auto-updated them)
- Emit hint about CLAUDE.md if project-level harness exists

**PreToolUse** (matcher: Bash) → `hooks/context-mode-router.mjs`
- Detect if Bash command likely produces large output (e.g., `git log`, test runners)
- Emit routing tip: "Use context-mode tools for analysis instead"

**Stop** → `hooks/session-summary.mjs`
- Append session decision log to a local markdown file
- Useful for tracking decision history across multiple sessions

**Global hook (outside project):** `plugins/harness-builder/hooks/context-mode-cache-heal.mjs`
- Fires on every Claude Code SessionStart (all projects)
- Self-heals context-mode plugin symlinks when Claude Code auto-updates plugins

### Plugin loading

1. `/plugin marketplace add <git-url>` registers marketplace in Claude Code
2. `/plugin install <name>@agent-skill` clones plugin into `~/.claude/plugins/cache/<plugin>@<marketplace>/<version>/`
3. `~/.claude/plugins/installed_plugins.json` tracks `installPath` and version
4. Global cache-heal hook on SessionStart auto-detects and fixes broken symlinks if Claude Code updated the plugin

## Examples by stack

### React + Next.js

**Setup:**
```bash
npx create-next-app@latest my-app --typescript --eslint
cd my-app
git init && git add -A && git commit -m "initial: next.js"
```

**Run `/agent-init`:**
```
/agent-init
```

What happens:
- `detect-stack` finds `typescript` (tsconfig.json + package.json)
- Brainstorming asks: project size → you pick `medium` for a real app
- 6 agents created: planner, dev, designer, qa-general, tester, reviewer
- `.visual-qa.json` seeded with:
  - `baseUrl: http://localhost:3000`
  - Breakpoints: mobile (375), tablet (768), desktop (1200)
  - Components: `header`, `primary-cta` (skeleton)
- `.agent-all.json` breakCondition: `npm test`

**Iterate with `/agent-all`:**
```bash
npm run dev   # in another terminal
```
```
/agent-all "Add Google OAuth login with profile image upload"
```

Result: full PR with auth flow, protected routes, and profile UI.

**Then run visual QA:**
```
/visual-qa --slug="oauth-feature"
```

Output: `docs/visual-qa/oauth-feature/report.md` with screenshots + LLM analysis for all pages × breakpoints.

### Python FastAPI

**Setup:**
```bash
mkdir api && cd api
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
cat > pyproject.toml <<'EOF'
[build-system]
requires = ["setuptools", "wheel"]

[project]
name = "api"
version = "0.1.0"
dependencies = ["fastapi", "uvicorn[standard]"]
EOF
touch requirements.txt main.py
git init && git add -A && git commit -m "initial: fastapi"
```

**Run `/agent-init`:**
```
/agent-init --size=small
```

What happens:
- `detect-stack` finds `python` (pyproject.toml)
- 3 agents: planner, dev, reviewer
- `.agent-all.json` generates with `breakCondition: npm test` — **you must change this to `pytest`**:
  ```json
  {
    "loop": {
      "breakCondition": "pytest",
      "stableIters": 2
    }
  }
  ```

**Iterate with loop:**
```
/agent-all "Add JWT auth middleware with token refresh" --loop --max-iter=5
```

Agent will:
1. Plan auth middleware + tests
2. Dispatch implementation
3. Run `pytest` to verify
4. Retry if tests fail (up to 5 iterations)
5. Create PR when tests pass for 2 consecutive runs

### Rust CLI

**Setup:**
```bash
cargo new mycli && cd mycli
git init && git add -A && git commit -m "initial: rust"
```

**Run `/agent-init` with lite theme (no visual-qa):**
```
/agent-init --theme=lite
```

What happens:
- `detect-stack` finds `rust` (Cargo.toml)
- 3 agents: planner, dev, reviewer
- No `.visual-qa.json` (lite theme)
- `.agent-all.json` generates with `breakCondition: cargo test`

**Iterate:**
```
/agent-all "Add subcommands for git-like workflow" --loop --max-cost=25
```

### Monorepo (npm workspaces)

**Setup:**
```bash
mkdir mono && cd mono && git init

cat > package.json <<'EOF'
{
  "name": "mono",
  "private": true,
  "workspaces": [
    "packages/app",
    "packages/api",
    "packages/shared"
  ]
}
EOF

mkdir -p packages/{app,api,shared}/src
git add -A && git commit -m "initial: workspaces"
```

**Run `/agent-init`:**
```
/agent-init --size=large
```

What happens:
- `detect-stack` finds `javascript` (workspaces in package.json; no single tsconfig)
- 9 agents: planner, frontend-dev, backend-dev, designer, qa-frontend, qa-backend, qa-integration, tester, reviewer
- `.agent-all.json` with `breakCondition: npm test` (runs tests in all workspaces)

**Coordinated feature across monorepo:**
```
/agent-all "Add shared auth package, integrate into app & api" --wave-size=large
```

Agent will:
1. Plan: create shared package, update app, update api, test integrations
2. Dispatch in 2 waves (shared first, then app+api in parallel)
3. Run `npm test` to verify all workspaces
4. Create single PR with all changes

## Command reference

### `/agent-init` (harness-builder plugin)

**Synopsis:**
```
/agent-init [--theme=floor|lite|thrift] [--size=small|medium|large] [--qa=<persona>[,<persona>]] [--merge] [--force] [--dry-run] [--resume]
```

**Flags:**

| Flag | Default | Effect | Example |
|------|---------|--------|---------|
| `--theme` | `floor` | Bundle: floor (cost-unrestricted + visual-qa), lite (basic), thrift (reserved) | `--theme=lite` |
| `--size` | auto (from discovery) | Agent count: small (3), medium (6), large (9) | `--size=large` |
| `--qa` | auto-detect | Override QA personas (comma-separated) | `--qa=api,ui,security` |
| `--merge` | false | Append harness to existing CLAUDE.md instead of abort | `--merge` |
| `--force` | false | Overwrite existing CLAUDE.md + agents | `--force` |
| `--dry-run` | false | Show what would happen; don't write files | `--dry-run` |
| `--resume` | false | Resume from last successful phase (requires `.agent-init-state.json`) | `--resume` |

**Examples:**

1. **Fresh project, full harness:**
   ```
   mkdir my-app && cd my-app && git init && git add -A && git commit -m "init"
   /agent-init
   ```
   Creates: CLAUDE.md, 6 agents, 3 hooks, .visual-qa.json, .agent-all.json

2. **Preserve existing CLAUDE.md, append harness section:**
   ```
   /agent-init --merge
   ```
   Keeps existing CLAUDE.md content; appends "Agent Harness" section

3. **Rebuild with 9 agents (large monorepo):**
   ```
   /agent-init --size=large --force
   ```
   Replaces all agents + CLAUDE.md with large roster

4. **Resume after Ctrl-C during phase 3:**
   ```
   /agent-init --resume
   ```
   Picks up from phase 4 (hooks) instead of restarting from phase 0

### `/agent-all` (harness-floor plugin)

**Synopsis:**
```
/agent-all <prompt-or-path> [--loop] [--max-iter=<N>] [--max-cost=<USD>] [--wave-size=small|medium|large] [--no-pr] [--no-brainstorm] [--resume] [--force] [--yes]
```

**Flags:**

| Flag | Default | Effect | Example |
|------|---------|--------|---------|
| `<prompt-or-path>` | required | Free-form task prompt OR path to `.md` task file | `"Add OAuth"` or `docs/tasks/12.md` |
| `--loop` | false | Enable iterative loops until breakCondition succeeds | `--loop` |
| `--max-iter` | 1 (off) | Stop after N iterations even if tests fail | `--max-iter=10` |
| `--max-cost` | $500 | Hard cost cap (USD) for the entire run | `--max-cost=50` |
| `--wave-size` | from config | Override `maxParallel` waves | `--wave-size=large` |
| `--no-pr` | false | Execute plan but don't create PR (local-only) | `--no-pr` |
| `--no-brainstorm` | false | Skip phase 1 intent-gathering; start from existing task | `--no-brainstorm` |
| `--resume` | false | Resume from last failed phase | `--resume` |
| `--force` | false | Overwrite branch/PR if it exists | `--force` |
| `--yes` | false | Auto-accept all confirmations | `--yes` |

**Examples:**

1. **Free-form prompt → PR in one go:**
   ```
   /agent-all "Build a blog comment system with moderation queue"
   ```
   Phases: brainstorm → plan → dispatch → gate → PR

2. **Load existing task file + iterate until tests pass:**
   ```
   /agent-all docs/tasks/fix-race-condition.md --loop --max-iter=15
   ```
   Skips phase 1 (brainstorm); uses task file for phase 2 planning.
   Retries up to 15 times if `breakCondition` (npm test) fails.

3. **Large feature, cost-capped, 3 waves in parallel:**
   ```
   /agent-all "Migrate PostgreSQL → MongoDB schema, update queries" \
     --wave-size=large \
     --max-cost=100 \
     --loop --max-iter=8
   ```

4. **Execute locally (no PR), for preview before committing:**
   ```
   /agent-all "Add feature flag system" --no-pr
   ```
   Commits to branch but doesn't create PR.

### `/visual-qa` (harness-floor plugin)

**Synopsis:**
```
/visual-qa [--resume] [--force] [--yes] [--budget=<USD>] [--skip-health] [--slug=<custom>]
```

**Flags:**

| Flag | Default | Effect | Example |
|------|---------|--------|---------|
| `--resume` | false | Resume from last failed phase | `--resume` |
| `--force` | false | Overwrite today's run directory | `--force` |
| `--yes` | false | Auto-accept all confirmations | `--yes` |
| `--budget` | $50 | Cost cap (USD) for vision model analysis | `--budget=100` |
| `--skip-health` | false | Skip baseUrl health check | `--skip-health` |
| `--slug` | auto (timestamp) | Custom directory name under `docs/visual-qa/` | `--slug="oauth-launch"` |

**Examples:**

1. **First run (baseline screenshots + analysis):**
   ```
   npm run dev   # ensure server is running on :3000
   ```
   ```
   /visual-qa
   ```
   Output: `docs/visual-qa/2026-05-18-abc1234/report.md` with screenshots + LLM analysis

2. **Cost-capped analysis (fewer pages/breakpoints):**
   ```
   /visual-qa --budget=20
   ```

3. **Force overwrite today's run (re-capture):**
   ```
   /visual-qa --force
   ```

4. **Custom slug for organization:**
   ```
   /visual-qa --slug="launch-checklist"
   ```
   Output: `docs/visual-qa/launch-checklist/report.md`

## Themes (default: `--theme=floor`)

| Theme | What gets bundled | Default? | Use when |
|-------|-------------------|----------|----------|
| `floor` | CLAUDE.md + agents + 3 hooks + `.visual-qa.json` + `.agent-all.json` + Floor section | ✅ DEFAULT | Most projects — cost-unrestricted, ship everything. Full visual-QA + multi-wave loops. |
| `lite` | CLAUDE.md + agents + 3 hooks only | opt-in | Constrained environment / quick prototype. No `.visual-qa.json` or multi-run cost tracking. |
| `thrift` | (RESERVED) Theme B — context-mode aggressive use, prompt cache, summarisation hooks | planned | Cost-sensitive long-running projects. Next release. |

## Composition patterns

### Pattern 1: One-shot feature from prompt to PR

```bash
mkdir feature && cd feature && git init
/agent-init
/agent-all "Build a Markdown-to-PDF converter CLI in Node"
```

Result: single PR with CLI + tests + docs.

### Pattern 2: Iterate until all tests pass (self-healing loop)

```bash
cd existing-repo
/agent-all docs/tasks/12-fix-flaky-test.md --loop --max-iter=15
```

Agent runs tests after each iteration. Stops when all pass for 2 consecutive runs, or max iterations hit.

### Pattern 3: Visual regression gate

```bash
# After merging an /agent-all PR:
/visual-qa
# Check docs/visual-qa/2026-05-18-abc1234/report.md for critical issues
# If found, file a follow-up task:
/agent-all "Fix visual regressions: broken layout on mobile" --no-brainstorm
```

### Pattern 4: Coordinated `/goal` for unattended execution

```bash
/goal "ship the analytics dashboard with all CI passing"
/agent-all "Build analytics dashboard (charts, filters, export)" \
  --loop --max-iter=15 --max-cost=80
```

Claude Code keeps the session alive. Agent iterates until goal is satisfied or cost cap hit.

### Pattern 5: Codex rescue for stuck waves

```bash
/agent-all "Complex refactor task" --wave-size=large
# If wave 3 gets stuck (timeouts), phase 4 gate invokes:
# /codex:rescue to get a second-opinion implementation
```

(Requires `codex@openai-codex` plugin installed alongside `harness-floor`.)

## Codex / non-Claude-Code platforms

The lib modules (`plugins/*/skills/*/lib/*.mjs`) and templates (`*.hbs`, `*.json`) are pure Node.js / pure data — portable. The phase prompts are Claude Code skill conventions and need adaptation for other platforms.

### Pure Codex CLI usage

If you use the `codex@openai-codex` plugin alongside `harness-floor`, the `agent-all` phase 3 dispatch can delegate to Codex via the `codex:rescue` skill when a wave gets stuck — useful as a second-opinion implementer for tough tasks.

For pure Codex CLI usage (without Claude Code):
- Install `agent-skill` lib code: clone repo or vendor the `lib/` files
- Re-implement the skill orchestration as Codex prompts (phase specs are good source material)
- The hook system is Claude Code specific; implement equivalent hooks in Codex if available
- Adapt templates (Handlebars → Codex prompt templates)

### Cursor, Zed, other editors

Templates and lib are reusable; the orchestration layer (skill dispatch, phase runner) is Claude Code specific. You can:
- Export the phase prompts (see `docs/superpowers/*/`) and run them manually
- Adapt `lib/wave-builder.mjs` logic for your build system
- Use rendered templates (CLAUDE.md, agent files) as starting points

## Architecture

```
agent-skill/
├── plugins/
│   ├── harness-builder/
│   │   ├── plugin.json
│   │   ├── skills/
│   │   │   └── agent-init/
│   │   │       ├── skill.md
│   │   │       ├── lib/
│   │   │       │   ├── detect-stack.mjs      # Stack detection (JS, Python, Rust, etc.)
│   │   │       │   ├── render.mjs            # Handlebars template renderer
│   │   │       │   ├── manifest-merge.mjs    # JSON manifest merging (non-destructive)
│   │   │       │   └── plugin-scan.mjs       # Required plugin detection + wiring
│   │   │       └── templates/
│   │   │           ├── CLAUDE.md.hbs         # Master harness template
│   │   │           ├── agents/
│   │   │           │   ├── planner.md.hbs
│   │   │           │   ├── dev.md.hbs
│   │   │           │   ├── designer.md.hbs
│   │   │           │   ├── qa-*.md.hbs       # Dynamic QA personas
│   │   │           │   ├── tester.md.hbs
│   │   │           │   └── reviewer.md.hbs
│   │   │           ├── hooks/
│   │   │           │   ├── cache-heal.mjs
│   │   │           │   ├── context-mode-router.mjs
│   │   │           │   └── session-summary.mjs
│   │   │           └── settings.local.json.hbs
│   │   └── hooks/
│   │       └── context-mode-cache-heal.mjs   # Global hook (runs for all projects)
│   │
│   └── harness-floor/
│       ├── plugin.json
│       └── skills/
│           ├── agent-all/
│           │   ├── skill.md
│           │   ├── lib/
│           │   │   ├── config-loader.mjs     # Load .agent-all.json
│           │   │   ├── wave-builder.mjs      # Task grouping → wave serialization
│           │   │   └── loop-evaluator.mjs    # breakCondition check, loop control
│           │   └── templates/
│           │       ├── pr-body.md.hbs        # PR description template
│           │       └── .agent-all.json.hbs   # Default config
│           │
│           └── visual-qa/
│               ├── skill.md
│               ├── lib/
│               │   ├── config-loader.mjs     # Load .visual-qa.json
│               │   ├── matrix-builder.mjs    # Page × breakpoint matrix
│               │   ├── cost-estimator.mjs    # Vision API cost pre-calc
│               │   └── diff-runs.mjs         # Pixel diff vs prior run
│               └── templates/
│                   ├── report.md.hbs         # Markdown report
│                   └── .visual-qa.json.hbs   # Default config
│
├── tests/
│   ├── agent-all/
│   │   ├── lib/                              # Unit tests for lib modules
│   │   ├── templates/                        # Snapshot tests for rendered output
│   │   └── scenarios/                        # Integration tests (wave dispatch, etc.)
│   └── ...
│
├── docs/
│   └── superpowers/
│       ├── specs/                            # Phase 0–7 technical specs
│       └── plans/                            # Example task-file templates
│
├── CHANGELOG.md
└── README.md (this file)
```

**Three themes; two implemented + one reserved:**
- **A (harness-builder)** — Per-project harness builder via `/agent-init`. Single responsibility: scaffold CLAUDE.md + agents + hooks.
- **B (harness-thrift)** — Token-cost optimisation — **planned**, reserved as `--theme=thrift`. Will integrate context-mode caching, prompt cache, summariser hooks.
- **C (harness-floor)** — Cost-unrestricted patterns: `/visual-qa` + `/agent-all`. Full multi-wave dispatch, visual QA, loop iteration.

**Why separate lib from templates:** Enables portability. Lib modules (wave-builder, loop-evaluator, detect-stack) are pure Node.js with no Claude Code dependency — they can be vendored into other tools (Codex, Cursor, build systems). Templates are Handlebars; can be adapted to any templating engine. Only the skill orchestration (dispatch, phase flow) is Claude Code specific.

## Roadmap

- **Theme B (harness-thrift):** context-mode aggressive integration, prompt cache optimisation, summariser hooks, token budget tracking
- **Pixel-diff visual-qa mode:** side-by-side regression detection without LLM analysis (cost reduction)
- **Telemetry opt-in:** which phases get skipped most, agent utilization rates
- `gh` PR comment integration for visual-qa reports
- Distributed wave dispatch (multi-machine / multi-region)
- Cost tracking dashboard (hourly/daily spend breakdown by harness + phase)

## FAQ

**Q: Will `/agent-init` overwrite my CLAUDE.md?**
A: No. Default is abort if CLAUDE.md exists. Use `--merge` to append a harness section, or `--force` to overwrite.

**Q: Is `/agent-all --loop` safe?**
A: Bounded by `maxIter` (hard cap 50), `maxCostUSD` (default $500), and `breakCondition`. If you set a tight cost cap and a clear test command, it can't run forever.

**Q: What if I don't want the Floor theme?**
A: `/agent-init --theme=lite` skips it. You get just the basic CLAUDE.md + agents + 3 hooks.

**Q: Can I customize the agent roster?**
A: Edit `.claude/agents/*.md` after `/agent-init`. They're plain markdown.

**Q: Does this work with Codex/Cursor/other tools?**
A: Lib code and templates are portable; skill orchestration is Claude Code specific. See "Codex / non-Claude-Code platforms" above.

**Q: Can I change the wave-size for one /agent-all run without editing .agent-all.json?**
A: Yes, pass `--wave-size=large` (or small/medium) — CLI flag overrides config defaults.

**Q: What's the breakCondition for non-Node projects?**
A: Edit `.agent-all.json` after `/agent-init`. Common values: `pytest`, `cargo test`, `go test ./...`, `mix test`, `maven test`.

**Q: Does `/agent-all --loop` regenerate the plan each iteration?**
A: Yes (in v0.2.0). Phase 2 re-runs `superpowers:writing-plans` per iteration. A future `--no-replan` flag will let you freeze the plan.

**Q: Can I see the plan before dispatch starts?**
A: Yes. `/agent-all` pauses after phase 2 (planning) and asks for acceptance before phase 3 (dispatch). You can review the plan, request changes, or abort.

**Q: How much does `/visual-qa` cost?**
A: Depends on page count and breakpoints. Default is ~5 pages × 3 breakpoints = 15 screenshots + LLM analysis (~$0.50–$2.00). Use `--budget=<USD>` to cap or `--skip-health` to speed up preflight.

## Versioning

- `harness-builder`: v0.2.0 (current) — `/harness-init` renamed to `/agent-init`, phase state file introduced
- `harness-floor`: v0.2.0 (current) — `agent-all` skill added alongside `visual-qa`, wave-builder logic, loop-evaluator

See [CHANGELOG.md](CHANGELOG.md) for full history.
