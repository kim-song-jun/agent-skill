> 🇰🇷 한국어: [README.ko.md](README.ko.md)

# agent-skill

A 17-plugin Claude Code marketplace covering 5 themes: **builder** (`/agent-init` scaffolding), **floor** (cost-unrestricted `/visual-qa` + `/agent-all`), **thrift** (`/thrift` long-session cost optimization), **explore** (`/explore` codebase mapping), and **debug** (`/debug` systematic debugging). Each runtime theme ships with per-platform ports (Cursor, GitHub Copilot CLI, Codex CLI, Gemini CLI) for cross-tool portability.

## Table of contents

- [Quick start](#quick-start)
- [Updating plugins](#updating-plugins)
- [The 5 themes](#the-5-themes)
- [All 17 plugins](#all-17-plugins)
- [Command reference](#command-reference)
- [Examples by stack](#examples-by-stack)
- [Architecture](#architecture)
- [Cross-platform support](#cross-platform-support)
- [Versioning](#versioning)
- [FAQ](#faq)

## Quick start

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill       # NEW — long-session cost optimization
/plugin install harness-explore@agent-skill      # NEW — codebase mapping
/plugin install harness-debug@agent-skill        # NEW — systematic debugging
```

Then in any git repo:

```
/agent-init                        # full Floor harness (DEFAULT)
/agent-init --theme=lite           # minimal: CLAUDE.md + agents + hooks only
/agent-init --theme=floor          # explicit Floor (default)
/agent-init --theme=thrift         # NOW SHIPPING — Theme B cost-conscious
/agent-init --size=large --force   # rebuild with 9-agent roster
```

Then run any of:

```
/agent-all "Add user signup form"               # full pipeline → PR (Theme C)
/agent-all "Fix flaky test" --loop --max-iter=5 # iterate until green
/visual-qa                                      # screenshot matrix + LLM analysis
/thrift                                         # NEW — set up cost-optimization hooks
/explore                                        # NEW — build codebase map
/explore where Foo                              # query the cached map
/debug "npm test failing on auth flow"          # NEW — systematic debugging
```

## Updating plugins

Plugins ship updates regularly. Three update paths exist depending on your host:

### Claude Code (primary host)

```
# Update a single plugin to the marketplace's latest version
/plugin update harness-floor@agent-skill

# Update ALL plugins from this marketplace at once
/plugin update --marketplace agent-skill

# Update every installed plugin (across all marketplaces)
/plugin update --all

# Refresh the marketplace listing first (if you suspect new plugins exist)
/plugin marketplace update agent-skill
/plugin install harness-explore@agent-skill   # install a newly listed plugin
```

After updating, the global `SessionStart` hook (`context-mode-cache-heal.mjs`) auto-heals stale plugin symlinks on the next Claude Code session start. If a plugin's behavior seems frozen at the old version, restart Claude Code or run `/plugin reload`.

### Per-platform CLI hosts (Codex / Copilot / Gemini / Cursor)

Each platform has its own update mechanism. These plugins live under `harness-floor-<platform>`, `harness-thrift-<platform>`, `harness-builder-<platform>`:

```bash
# Codex CLI
codex plugins update                       # all
codex plugins update harness-floor-codex   # one

# GitHub Copilot CLI
gh copilot plugins update                  # all
gh copilot plugins update harness-floor-copilot

# Gemini CLI (a.k.a. antigravity)
gemini extensions update                   # all
gemini extensions update harness-floor-gemini

# Cursor — no plugin loader; re-run the bundled install renderer
node plugins/harness-builder-cursor/bin/init.mjs /path/to/project --force
node plugins/harness-floor-cursor/bin/init.mjs /path/to/project --force
node plugins/harness-thrift-cursor/bin/install.mjs /path/to/project --force
```

For the renderer-style plugins (`harness-explore`, `harness-debug`, and the per-platform `bin/install.mjs` scripts), updating means re-running the install command with `--force` after pulling the latest plugin code. The renderer is idempotent: re-running won't double-register hooks (it detects existing entries via the `thrift-` / `floor-` command-path sentinel — see `docs/superpowers/specs/2026-05-18-hook-precedence-integration.md`).

### When you need to clean install

If a plugin update fails or you want a clean slate:

```
/plugin uninstall harness-floor@agent-skill
/plugin marketplace remove agent-skill
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-floor@agent-skill
```

For per-project artifacts the plugins wrote (config files, hook scripts), you can also revert them surgically:

```bash
# Remove thrift's instrument layer without touching other plugins' hooks
node plugins/harness-thrift/bin/install.mjs /path/to/project --uninstall
# Equivalent for each thrift port — runs the lib/settings-patcher unpatch with the thrift- sentinel
```

## The 5 themes

| Theme | Plugin family | Posture | Best for |
|---|---|---|---|
| **A** | `harness-builder` (+ 4 platform siblings) | Install scaffolding (one-shot, low cost) | Starting a new project; adopting Claude Code on an existing one |
| **C** | `harness-floor` (+ 4 platform siblings) | Cost-unrestricted multi-agent pipelines | Big features, visual QA, parallel wave execution |
| **B** | `harness-thrift` (+ 4 platform siblings) | Cost-conscious long-session runtime | Sessions ≥1 hour where context accumulation drives cost |
| **D** | `harness-explore` | Codebase mapping (read-only) | Onboarding to a new codebase; "where is X" queries |
| **E** | `harness-debug` | Systematic debugging workflow | Multi-hour debugging marathons; bisecting elusive bugs |

Themes compose. A typical "ship a feature" session uses A (one-time `/agent-init`), then C (`/agent-all "..."`), with B running invisibly in the background to keep cost down, and E + D available on-demand for bug hunting and orientation.

## All 17 plugins

```
harness-builder                ← A core (Claude Code)
harness-builder-cursor         ← A port for Cursor
harness-builder-copilot        ← A port for Copilot CLI
harness-builder-codex          ← A port for Codex CLI
harness-builder-gemini         ← A port for Gemini CLI

harness-floor                  ← C core: /visual-qa + /agent-all
harness-floor-cursor           ← C port for Cursor
harness-floor-copilot          ← C port for Copilot CLI
harness-floor-codex            ← C port for Codex CLI
harness-floor-gemini           ← C port for Gemini CLI

harness-thrift                 ← B core: /thrift
harness-thrift-cursor          ← B port for Cursor (advisory-only)
harness-thrift-copilot         ← B port for Copilot CLI (store_memory bridge)
harness-thrift-codex           ← B port for Codex CLI (TOML config patcher)
harness-thrift-gemini          ← B port for Gemini CLI (Vertex AI rates)

harness-explore                ← D (single platform — Claude Code; ports deferred)
harness-debug                  ← E (single platform — Claude Code; ports deferred)
```

## Command reference

### `/agent-init` — Theme A

Bootstraps `CLAUDE.md`, `.claude/agents/`, hooks, plugin wiring, and (by default) the full Floor theme bundle.

```
/agent-init [--theme=floor|lite|thrift] [--size=small|medium|large] [--qa=<persona>[,<persona>]]
            [--merge] [--force] [--dry-run] [--resume]
```

Flag summary: `--theme` chooses bundle (floor default), `--size` controls agent count (3/6/9), `--qa` overrides QA personas, `--merge` appends rather than aborts on existing CLAUDE.md, `--force` overwrites, `--dry-run` previews, `--resume` picks up from last completed phase.

### `/agent-all` — Theme C

Runs intent → plan → wave-dispatch → gate → PR over the `.claude/agents/` roster. Optional `--loop` until a break-condition succeeds.

```
/agent-all <prompt-or-path> [--loop] [--max-iter=<N>] [--max-cost=<USD>]
           [--wave-size=small|medium|large] [--no-pr] [--no-brainstorm]
           [--resume] [--force] [--yes]
```

### `/visual-qa` — Theme C

Captures a configured matrix of screenshots (pages × components × states × breakpoints + flows), runs LLM analysis per image, diffs vs prior run, writes a markdown+JSON report. Requires `.visual-qa.json` config and Playwright MCP.

```
/visual-qa [--resume] [--force] [--yes] [--budget=<USD>] [--skip-health] [--slug=<custom>]
```

### `/thrift` — Theme B (NEW)

Sets up cost-conscious long-session optimization: context-mode integration, prompt cache priming (opt-in), summariser hooks at threshold, end-of-session audit.

```
/thrift                          # one-time setup; idempotent
/thrift summarise                # manual summariser trigger
/thrift audit                    # ad-hoc audit report
/thrift --force                  # re-seed .thrift.json
```

Config at `.thrift.json` controls turn/token thresholds, summariser model, cache priming strategy, and audit output path.

### `/explore` — Theme D (NEW)

Builds a structured codebase map (~<2 min for 100K LOC) via parallel-dispatch reader subagents, caches it keyed by `git rev-parse HEAD`, and exposes fast query commands against the cache.

```
/explore                         # build/refresh map; writes docs/explore/<sha>-map.md
/explore where <symbol>          # locate symbol; first checks cached map (O(1) lookup)
/explore deps <file>             # show imports + reverse-imports for a file
```

### `/debug` — Theme E (NEW)

Disciplined debugging workflow: reproduce → isolate → hypothesize → verify. State persists in `.debug-state.json` (failure desc, hypotheses tried, checkpoints, current candidate). Parses 10 common error formats into structured citations. Wraps `superpowers:systematic-debugging` skill.

```
/debug "<failure description>"   # full workflow from scratch
/debug --resume                  # pick up from last checkpoint
/debug --bisect <good> <bad>     # git bisect wrapper
```

## Examples by stack

### React + Next.js (full Floor + Thrift)

```bash
npx create-next-app@latest my-app --typescript --eslint
cd my-app && git init && git add -A && git commit -m "initial: next.js"
```

```
/agent-init                                    # Floor scaffold
/thrift                                        # set up cost optimization
/agent-all "Add Google OAuth with profile upload"
/visual-qa --slug="oauth-feature"
```

### Python FastAPI (lite + manual breakCondition)

```bash
mkdir api && cd api && git init && touch pyproject.toml main.py
git add -A && git commit -m "initial: fastapi"
```

```
/agent-init --size=small
# Edit .agent-all.json: change "breakCondition": "npm test" → "pytest"
/agent-all "Add JWT auth middleware" --loop --max-iter=5
```

### Rust CLI (lite)

```bash
cargo new mycli && cd mycli && git init && git add -A && git commit -m "initial: rust"
```

```
/agent-init --theme=lite
# .agent-all.json auto-detects "breakCondition": "cargo test"
/agent-all "Add subcommands for git-like workflow" --loop --max-cost=25
```

### Onboarding to an unfamiliar codebase

```bash
git clone https://github.com/some/large-repo
cd large-repo
```

```
/agent-init --theme=lite       # minimal scaffold
/explore                       # build the codebase map (cached)
/explore where AuthService     # O(1) lookup against cache
/explore deps src/auth/jwt.ts  # forward + reverse imports
```

### Debugging a flaky test

```
/debug "tests/integration/checkout.test.ts is flaky — fails ~30% of runs"
# Phase 1: reproduce → captures failing run
# Phase 2: isolate → minimizes test input via ddmin
# Phase 3: hypothesize → 3 candidate causes
# Phase 4: verify → tests each hypothesis
# Phase 5: summarise → .debug/debug-log-<date>.md
```

## Architecture

```
agent-skill/
├── .claude-plugin/
│   └── marketplace.json                      # registers all 17 plugins
├── plugins/                                  # the plugins themselves
│   ├── harness-builder/                      # Theme A core + 4 platform siblings
│   ├── harness-floor/                        # Theme C core + 4 platform siblings
│   ├── harness-thrift/                       # Theme B core + 4 platform siblings
│   ├── harness-explore/                      # Theme D
│   └── harness-debug/                        # Theme E
├── scripts/
│   └── sync-lib.mjs                          # syncs vendored render.mjs across plugins
├── tests/                                    # 981+ tests (node --test)
├── docs/superpowers/
│   ├── specs/                                # design docs per plugin/feature
│   ├── plans/                                # implementation plans
│   └── research-notes/                       # sandbox-bound spike findings
├── CHANGELOG.md / CHANGELOG.ko.md
└── README.md / README.ko.md
```

**Per-plugin layout** (standard for all 17):

```
plugins/<name>/
├── .claude-plugin/plugin.json
├── README.md
├── skills/<skill>/
│   ├── SKILL.md
│   ├── phases/                               # phase docs (orchestrator reads in order)
│   ├── lib/                                  # pure-Node helpers (testable in isolation)
│   ├── templates/                            # *.hbs Handlebars templates
│   └── references/                           # design notes, porting notes
└── bin/                                      # install/runtime helpers
    ├── install.mjs                           # automated install renderer
    └── lib/render.mjs                        # vendored Handlebars-lite renderer
```

**Why duplicate `render.mjs` per plugin:** The `cross-platform-isolation.test.mjs` test forbids cross-plugin imports — each plugin must be self-contained. `scripts/sync-lib.mjs --check` enforces that all vendored copies stay byte-identical to the canonical source at `plugins/harness-builder/skills/agent-init/lib/render.mjs`.

## Cross-platform support

| Capability | Claude Code | Cursor | Copilot CLI | Codex CLI | Gemini CLI |
|---|---|---|---|---|---|
| Theme A (`/agent-init`) | ✅ | ✅ (`bin/init.mjs`) | ✅ | ✅ | ✅ |
| Theme C `/visual-qa` | ✅ | ✅ (scaffold) | ✅ (scaffold) | ✅ (scaffold) | ✅ (scaffold + subprocess dispatch) |
| Theme C `/agent-all` | ✅ | ✅ (prompt template) | ✅ (`task` tool) | ✅ (`agent` hook OR sequential) | ✅ (subprocess fan-out) |
| Theme B `/thrift` | ✅ | ✅ (advisory-only, no hooks) | ✅ | ✅ (TOML config patcher) | ✅ (Vertex rate table) |
| Theme D `/explore` | ✅ | — (port deferred) | — | — | — |
| Theme E `/debug` | ✅ | — (port deferred) | — | — | — |

Each "scaffold" entry means the config + hook templates ship today and the orchestrator runtime is documented in spec form (`docs/superpowers/specs/2026-05-18-*-impl-spec.md`); production lib modules ship for Claude Code and incrementally for each platform per the impl specs.

Live CLI runtime verification is tracked in `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`.

## Versioning

All plugins ship at **v0.1.0** (cross-platform ports) or **v0.2.0** (Claude Code originals). See [CHANGELOG.md](CHANGELOG.md) for full release history.

Major iterations in 2026-05-18:
- 41 commits — initial Themes A + C + cross-platform scaffolds
- 7 commits — visual-qa 6-phase + agent-all 4 sub-projects + design specs
- 5 commits — install renderers + spawn dispatchers + ask-user adapters + thrift design
- 4 commits — harness-thrift v0.1
- 1 commit (`11d8b10`) — 12 specs + 6 host invoker / install / SDK implementations from 7 parallel agents
- 2 commits (`0aa3cea` + `5d6fbe5`) — 6 new plugins (4 thrift ports + explore + debug) + per-platform agent-all/visual-qa implementations from 10 parallel agents (554 new tests; 981/981 pass)

## FAQ

**Q: Will `/agent-init` overwrite my CLAUDE.md?**
No. Default aborts if CLAUDE.md exists. Use `--merge` to append a harness section, or `--force` to overwrite.

**Q: Is `/agent-all --loop` safe?**
Bounded by `--max-iter` (hard cap 50), `--max-cost` (default $500), and `breakCondition`. If you set a tight cost cap and a clear test command, it can't run forever.

**Q: Does `/thrift` change my context behavior immediately?**
Yes. After `/thrift`, the installed hooks fire on every subsequent Claude Code turn in this project. PreToolUse coercion suggestions appear inline; PostToolUse counts tokens; the summariser fires at threshold (advisory v1 — writes a summary file and asks you to run `/compact`). Phase 5 audit fires on session end.

**Q: Is the prompt cache priming worth it?**
Often no for short sessions. `cache.enabled = false` by default. Enable only if your session lasts ≥15 min AND you pause >5 min between turns (the ROI gate at `evaluateCachePrimeROI` will warn you otherwise).

**Q: Can `/explore` see private files?**
Honors `.gitignore` by default. Add `node_modules`, build dirs, etc. to ignore globs in `.explore.json` if needed.

**Q: Does `/debug` actually run my code?**
Only via the `repro` command you supply in Phase 1 (and only if you confirm). The reproducer is invoked through `shell_command` with your project's existing test runner; no other code execution happens.

**Q: How do I update the plugins?**
See [Updating plugins](#updating-plugins) above. TL;DR: `/plugin update --marketplace agent-skill` from Claude Code.

**Q: What if my CLI host isn't listed?**
The lib modules (`plugins/*/skills/*/lib/*.mjs`) are pure Node.js with no host dependencies — vendor them into your tool. The phase docs in `phases/*.md` are language-agnostic. The skill-orchestration layer is what differs per host; see the `docs/superpowers/specs/2026-05-18-*-impl-spec.md` files for porting templates.

**Q: Where do bugs go?**
File issues at https://github.com/kim-song-jun/agent-skill/issues. Per-plugin bugs: prefix the title with the plugin name (`[harness-thrift] …`).
