> 🇰🇷 한국어: [README.ko.md](README.ko.md)

# agent-skill

**One marketplace, five slash commands, every AI coding tool.**

Type `/agent-init` once in any git repo. Claude Code (or Cursor, Copilot CLI, Codex CLI, Gemini CLI) gains five new superpowers:

- `/agent-all "Add login form"` — full feature → PR, in one command
- `/visual-qa` — screenshot every page, get an LLM design review
- `/thrift` — keep long sessions affordable (auto-summarize, cache, audit)
- `/explore` — instant codebase map (`where is X?` answered in O(1))
- `/debug "tests are flaky"` — reproduce → bisect → fix workflow

That's it. The rest of this README is reference material — skim the parts you need.

---

## Install in 60 seconds

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
```

Then in your project:

```
cd my-project
/agent-init
```

You're done. Try `/agent-all "small feature"` to see it work.

---

## Keep plugins up to date

```
/plugin update --marketplace agent-skill
```

That single command updates everything from this marketplace. For other CLIs, see [Updating on other tools](#updating-on-other-tools) below.

---

## What each command does

### `/agent-init` — set up the project

Run once per project. Creates `CLAUDE.md`, the agent roster (`.claude/agents/*.md`), 3 hooks, and configs for visual-qa + agent-all.

```
/agent-init                 # default: full Floor harness
/agent-init --theme=lite    # minimal: just CLAUDE.md + agents
/agent-init --size=large    # 9-agent roster for monorepos
/agent-init --merge         # append to existing CLAUDE.md (don't overwrite)
```

### `/agent-all` — ship a feature

Takes a free-form prompt OR an existing task file. Plans → writes code → tests → opens a PR.

```
/agent-all "Add Google OAuth"                        # prompt → PR
/agent-all docs/tasks/12.md                          # use a written task
/agent-all "fix flaky test" --loop --max-iter=5      # keep trying till tests pass
/agent-all "..." --no-pr                             # local-only (no PR)
```

Bounded by `--max-iter` (hard cap 50), `--max-cost` (default $500), and the test command in `.agent-all.json`. It can't run forever.

### `/visual-qa` — design review every page

Captures screenshots at mobile/tablet/desktop, runs LLM analysis per image, writes a Markdown report. Needs Playwright MCP + a dev server.

```
npm run dev                     # in another terminal
/visual-qa                      # captures + analyzes
/visual-qa --slug="launch"      # custom output folder
/visual-qa --budget=20          # cap LLM cost at $20
```

Output lands in `docs/visual-qa/<date-or-slug>/report.md`.

### `/thrift` — keep long sessions cheap

For sessions over an hour. Auto-suggests `ctx_execute` for big tool outputs, summarizes the conversation at thresholds, audits cost at session end.

```
/thrift              # one-time setup
/thrift summarise    # manual summary trigger
/thrift audit        # cost report
```

Edit `.thrift.json` to tune turn/token thresholds. Cache priming is **off by default** — sessions under 15 min don't benefit.

### `/explore` — fast codebase navigation

Builds a structured map of your project (~2 minutes for 100K lines), caches it per git commit, lets you query without re-grepping.

```
/explore                              # build/refresh the map
/explore where AuthService            # cached lookup
/explore deps src/auth/jwt.ts         # imports + reverse-imports
```

### `/debug` — methodical debugging

Step-by-step workflow with persistent state so you don't lose context across long debugging sessions.

```
/debug "auth flow test fails 30% of runs"
/debug --resume                       # pick up where you left off
/debug --bisect <good-sha> <bad-sha>  # git bisect wrapper
```

Parses 10 error formats (Python tracebacks, JS stack traces, pytest/jest/rust/tsc/gcc/ESLint output, etc.) into clickable citations.

---

## Common workflows

**Start a new project, ship a feature:**
```
mkdir my-app && cd my-app && git init && git commit --allow-empty -m "init"
/agent-init
/agent-all "Build a CLI to convert Markdown to PDF"
```

**Onboard to an unfamiliar codebase:**
```
git clone <repo> && cd <repo>
/agent-init --theme=lite
/explore
/explore where MainController
```

**Fix a flaky test:**
```
/debug "tests/integration/checkout.test.ts is flaky"
# Walks you through: reproduce → bisect → hypothesize → verify
```

**Pre-launch checklist:**
```
/agent-all "Polish landing page, add analytics events" --loop
/visual-qa --slug="pre-launch"     # design review
/thrift audit                       # how much did this session cost?
```

**Long debugging marathon (keep cost down):**
```
/thrift                  # set up cost optimization first
/debug "..."             # then debug — thrift's hooks fire automatically
```

---

## Pick a theme

Themes bundle plugins for a specific kind of work:

| Theme | Command | What it gives you |
|---|---|---|
| **Builder** (A) | `/agent-init` | Project scaffolding. Run once. |
| **Floor** (C) | `/agent-all`, `/visual-qa` | Ship features. Cost-unrestricted. |
| **Thrift** (B) | `/thrift` | Cost optimization for long sessions. |
| **Explore** (D) | `/explore` | Codebase mapping & queries. |
| **Debug** (E) | `/debug` | Systematic debugging. |

Themes compose freely. A typical session uses Builder once, then Floor for the actual work, with Thrift quietly running in the background.

---

## Stack examples

### Next.js + TypeScript

```bash
npx create-next-app@latest my-app --typescript
cd my-app && git init && git add -A && git commit -m "init"
```
```
/agent-init                                # detects TS, sets breakCondition: npm test
/agent-all "Add Google OAuth with profile upload"
/visual-qa --slug="oauth"
```

### Python FastAPI

```bash
mkdir api && cd api && touch pyproject.toml main.py
git init && git add -A && git commit -m "init"
```
```
/agent-init --size=small
# Open .agent-all.json, change "breakCondition" to "pytest"
/agent-all "JWT auth middleware" --loop --max-iter=5
```

### Rust CLI (no visual-qa needed)

```bash
cargo new mycli && cd mycli && git init && git add -A && git commit -m "init"
```
```
/agent-init --theme=lite                   # detects Cargo.toml → "cargo test"
/agent-all "Add git-style subcommands" --loop --max-cost=25
```

---

## Use it on other AI tools

Every command above also works on Cursor, GitHub Copilot CLI, Codex CLI, and Gemini CLI — just install the matching `*-<platform>` plugin.

| Tool | Install command |
|---|---|
| **Claude Code** | `/plugin install harness-floor@agent-skill` |
| **Cursor** | `node plugins/harness-floor-cursor/bin/init.mjs /path/to/project` |
| **Copilot CLI** | `gh copilot plugins install harness-floor-copilot` |
| **Codex CLI** | `codex plugins install harness-floor-codex` |
| **Gemini CLI** | `gemini extensions install harness-floor-gemini` |

Same for `harness-builder-*`, `harness-thrift-*` (e.g. `harness-thrift-codex`). 17 plugins total cover Claude Code natively + per-platform ports for the 4 other CLIs.

`/explore` and `/debug` ship for Claude Code only today — per-platform ports are planned.

---

## Updating on other tools

```bash
# Codex CLI
codex plugins update                    # all
codex plugins update harness-floor-codex

# GitHub Copilot CLI
gh copilot plugins update

# Gemini CLI (a.k.a. antigravity)
gemini extensions update

# Cursor — re-run the install script with --force
node plugins/harness-floor-cursor/bin/init.mjs /path/to/project --force
```

Cursor installs are renderer-style: re-running won't double-register hooks (handled by sentinel-based idempotency). For a clean uninstall on Claude Code or any platform, see [Common questions](#common-questions) below.

---

## Common questions

**Will `/agent-init` overwrite my CLAUDE.md?**
No. It aborts if CLAUDE.md exists. Use `--merge` to append, or `--force` to overwrite.

**Is `/agent-all --loop` safe?**
Yes. Hard-bounded by `--max-iter` (cap 50), `--max-cost` (default $500), and a clear test command. Set tight values and it can't run away.

**Does `/thrift` change my context behavior right away?**
Yes. After `/thrift`, hooks fire on every subsequent turn. You'll see PreToolUse suggestions inline. The summariser fires at the configured threshold (`.thrift.json`) and asks you to run `/compact`.

**How do I uninstall just the hooks `/thrift` added?**
```
node plugins/harness-thrift/bin/install.mjs /path/to/project --uninstall
```
This removes only the `thrift-*` hook entries from `.claude/settings.local.json` — your other hooks stay untouched.

**How do I completely remove a plugin?**
```
/plugin uninstall <name>@agent-skill
```
Then optionally clean per-project artifacts (`.thrift.json`, `.visual-qa.json`, etc.) by hand.

**Does this work with my CLI/IDE that isn't listed?**
The libs (`plugins/*/skills/*/lib/*.mjs`) are pure Node — vendor them into your tool. Phase docs in `phases/*.md` are language-agnostic. See the per-platform impl specs under `docs/superpowers/specs/2026-05-18-*-impl-spec.md` for porting patterns.

**Where do bug reports go?**
[GitHub Issues](https://github.com/kim-song-jun/agent-skill/issues). Prefix the title with the plugin name (e.g. `[harness-thrift] cache prime fails on Windows`).

---

## Going deeper

If you want the technical details, design specs, or are porting to a new platform:

- **Architecture & layout** — see [docs/superpowers/specs/](docs/superpowers/specs/) for design docs per plugin.
- **All 17 plugins enumerated** — see [.claude-plugin/marketplace.json](.claude-plugin/marketplace.json).
- **Change history** — see [CHANGELOG.md](CHANGELOG.md). 981+ tests, all green.
- **Per-platform porting** — see specs ending in `-impl-spec.md` or `-decomposition.md` under `docs/superpowers/specs/`.
- **Cross-platform support matrix** — see [docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md](docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md).
- **Hook precedence (if you're mixing plugins that all register hooks)** — see [docs/superpowers/specs/2026-05-18-hook-precedence-integration.md](docs/superpowers/specs/2026-05-18-hook-precedence-integration.md).

Versioning: Claude Code core plugins are at `v0.2.0`, per-platform ports at `v0.1.0`.
