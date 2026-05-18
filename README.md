> 🇰🇷 한국어: [README.ko.md](README.ko.md)

# agent-skill

**Agent-first workflows that run themselves.** One `/agent-init` per project; one `/agent-all "..."` per feature; the agent brainstorms → plans → writes → tests → opens the PR — and keeps iterating until the tests pass — without you babysitting every turn.

Works on Claude Code today, with cross-platform ports for **Cursor, GitHub Copilot CLI, Codex CLI, and Gemini CLI**. 17 plugins, 5 slash commands, one marketplace.

```
/agent-init                            # bootstrap any git repo (Phase A — once per project)
/agent-all "Add Google OAuth" --loop   # brainstorm → plan → code → test → PR (Phase C — per feature)
/visual-qa                             # screenshot every page, LLM design review
/thrift                                # keep long sessions affordable (auto-summarize, audit)
/explore                               # codebase map; /explore where Foo → O(1) lookup
/debug "tests flaky 30% of runs"       # reproduce → bisect → hypothesize → verify
```

**Three things that make it click:**

1. **Project-first scaffolding.** `/agent-init` works on any git repo — Next.js, FastAPI, Rust CLI, monorepo. It detects your stack, picks the right test command, and creates `CLAUDE.md` + agents + hooks + config in one commit. Same command, every project.

2. **Agent-first execution.** `/agent-all "..."` doesn't ask you 20 questions. It runs brainstorming, plan-writing, parallel implementer dispatch, code review, and PR creation as **one pipeline**. You approve the plan before code lands; otherwise it drives itself.

3. **Self-sustaining loops.** `--loop --max-iter=15 --max-cost=$50` keeps iterating until tests pass — or the cap hits. Pair with Claude Code's `/goal` for unattended overnight runs that exit cleanly when the goal condition holds. See [Self-sustaining workflows](#self-sustaining-workflows).

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

## Self-sustaining workflows

The harness is designed to **drive itself to completion**. You don't sit through every turn. Three knobs combine to make this safe:

### The pieces

| Piece | Owned by | What it does |
|---|---|---|
| `--loop` | `/agent-all` | After phase 5 (PR), evaluate `breakCondition`. If it fails, re-enter from phase 1 with the same task. Stops when condition passes for `stableIters` consecutive runs. |
| `--max-iter=N` | `/agent-all` | Hard cap on loop iterations (server-clamped to 50). |
| `--max-cost=USD` | `/agent-all` | Hard cap on accumulated API cost across all iterations. Default $500. |
| `breakCondition` | `.agent-all.json` | Shell command. Exit 0 = "done". Typically your test command: `npm test`, `pytest`, `cargo test`. |
| `/goal "..."` | Claude Code built-in | Session-scoped Stop hook. Keeps the session alive across iterations until the goal condition holds. **The harness doesn't auto-set it — you do, when you want unattended execution.** |
| `/thrift` | This repo | Background cost optimizer — auto-summarizes long sessions, primes cache (opt-in), audits cost at end. Set up once per project. |

### Unattended overnight feature ship

```
/thrift                                                 # set up cost guardrails
/goal "ship the analytics dashboard with all CI green" # session keeps itself alive
/agent-all "Build analytics dashboard (charts, filters, export)" \
  --loop --max-iter=15 --max-cost=80
# walk away — comes back to a PR (or a clear failure report with state preserved)
```

What happens under the hood:
- `/agent-all` runs phase 0–5: brainstorm → plan → implement → review → PR
- After phase 5, `breakCondition` (e.g. `npm test`) runs. If it fails, the loop re-enters phase 1 with the same task and tries a different approach.
- If `--max-iter=15` is hit OR `--max-cost=80` is hit, the loop stops cleanly. State preserved in `.agent-all-state.json` so `--resume` picks up later.
- `/goal` keeps Claude Code from stopping the session between turns. Auto-clears once "all CI green" holds.
- `/thrift`'s hooks fire continuously: PreToolUse coercion of large outputs, PostToolUse token accounting, end-of-session audit.

You wake up to either a merged PR or a precise "stopped at iteration 7 because tests still failing on auth flow" report.

### How this is different from `/goal` and Ralph Loop

These solve **different problems**. Harness isn't "Ralph Loop plus features" — it's an orchestrator that happens to loop.

| Tool | What it solves | What it knows about |
|---|---|---|
| **`/goal`** | "Don't let the session stop until X." | Nothing about your work. Just blocks Claude Code's Stop event. Pure keep-alive. |
| **Ralph Loop** | "Re-run this prompt every N minutes." | Nothing between runs. Stateless re-fire of the same prompt. |
| **`/agent-all --loop`** | "Drive a complete dev workflow (brainstorm → plan → code → review → PR) to a verified end state, within cost bounds." | **Phases, plan, dispatched agents, what was tried, accumulated cost, where it failed.** |

The harness pulls the **good idea** from each — "don't stop until done" from `/goal`, "auto-retry" from Ralph — and adds the structural pieces neither has:

- **Multi-phase workflow** — knows the difference between "still planning" and "tests failing after PR"
- **Stateful retries** — each iteration re-enters phase 1 with the *previous failure visible*, so it tries a different approach (not the same prompt blindly re-fired)
- **Wave-granularity cost cap** — `--max-cost` checked after each wave, not just at end-of-run, so it can bail mid-feature if cost explodes
- **Resume-from-failure** — `.agent-all-state.json` preserves phase progress; `--resume` continues from where the loop crashed
- **Phase-aware break-condition** — `breakCondition` evaluated *after* PR creation (when tests should actually pass), not mid-implementation

`/goal` and Ralph are **complements**, not alternatives:

```
/goal "ship analytics dashboard"           # keep-alive (so /agent-all --loop can run for hours)
/agent-all "..." --loop --max-iter=15      # does the actual work
```

Ralph wrapping a `/agent-all` *one-shot* (no `--loop`) makes sense only for wall-clock periodicity (`/ralph-loop 5m /agent-all "check deploy"`) — not for retry semantics, which the harness already handles natively and better.

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

## How this fits with the rest of the Claude ecosystem

agent-skill is a **higher-layer composition** on top of two foundational Claude Code plugins. You can use it without them, but it works much better with them — and they install in seconds.

```
        ┌──────────────────────────────────────────┐
        │  YOUR PROJECT                            │
        │  /agent-init, /agent-all, /thrift ...    │
        └──────────────────────────────────────────┘
                          ▲
                          │  composes
                          │
        ┌──────────────────────────────────────────┐
        │  agent-skill (this repo)                 │
        │  17 plugins, 5 themes (A/B/C/D/E)        │
        └──────────────────────────────────────────┘
                ▲                          ▲
                │ wraps                    │ uses
                │                          │
   ┌────────────────────────┐  ┌────────────────────────────┐
   │  superpowers           │  │  context-mode              │
   │  Foundational skills:  │  │  Keep raw tool output out  │
   │  brainstorming,        │  │  of the conversation:      │
   │  writing-plans,        │  │  ctx_execute, ctx_search,  │
   │  dispatching-parallel, │  │  ctx_batch_execute,        │
   │  subagent-driven-dev,  │  │  ctx_fetch_and_index, ...  │
   │  systematic-debugging  │  │                            │
   └────────────────────────┘  └────────────────────────────┘
```

### `superpowers` — foundational skills

A library of reusable skill primitives that the harness commands all wrap:

| Skill | What it does | Who uses it |
|---|---|---|
| `superpowers:brainstorming` | Structured Q&A to align on intent before any work | `/agent-init` (Phase 1), `/agent-all` (Phase 1) |
| `superpowers:writing-plans` | Drafts a step-by-step plan from a brief | `/agent-all` (Phase 2) |
| `superpowers:dispatching-parallel-agents` | Pattern for fanning out N independent subagents | `/agent-init` (Phase 3 agents), `/visual-qa` (Phase 3 pages) |
| `superpowers:subagent-driven-development` | Per-task implementer + reviewer cycle | `/agent-all` (Phase 3 wave dispatch) |
| `superpowers:systematic-debugging` | Methodical reproduce → isolate → fix workflow | `/debug` wraps this |
| `superpowers:test-driven-development` | TDD discipline (write test first) | Recommended for `/agent-all` implementer agents |
| `superpowers:verification-before-completion` | "Evidence before assertions" — run the tests before claiming done | Every harness command finishes with this |
| `superpowers:requesting-code-review` | Pattern for scoping + collecting code review | `/agent-all` (Phase 4 gate) |

**Why this layering?** The harness commands are **thin coordinators** — they orchestrate WHICH skill to invoke and WHEN, but the actual prompt engineering for "how do I brainstorm well" lives in `superpowers`. When superpowers improves a skill, every harness command benefits automatically.

**Install:** `/plugin install superpowers@claude-plugins-official` (Claude Code's official marketplace).

### `context-mode` — keep raw output out of context

A plugin that intercepts large tool outputs (long `git log`, file dumps, MCP responses) and stores them in a local SQLite-backed sandbox. Only a printed *summary* enters your conversation context — the raw content stays queryable via search.

| Tool | When to use it |
|---|---|
| `ctx_execute(language, code)` | Run shell/Python/JS; only printed result enters context |
| `ctx_execute_file(path)` | Analyze a file without loading its full contents |
| `ctx_batch_execute(commands, queries)` | Run many commands at once; auto-indexed for later search |
| `ctx_search(queries)` | FTS5 query against the indexed sandbox |
| `ctx_fetch_and_index(url)` | Fetch + index web content without dumping it into context |
| `ctx_stats` | See how much context this plugin has saved you |

**Why it matters for the harness:** Long `/agent-all --loop` runs or `/debug` sessions accumulate tool output fast. Without `context-mode`, raw `git log` / `npm test` output bloats every subsequent turn. With it, that output goes to the sandbox and only the summary stays. **`/thrift` integrates directly:** its PreToolUse hook detects large-output commands (`find`, `git log`, etc.) and suggests routing through `ctx_execute` automatically.

**Install:** `/plugin install context-mode@context-mode` (separate marketplace).

### How the harness uses both

When you run `/agent-all "Add OAuth"`:

1. **Phase 1 (Intent)** → invokes `superpowers:brainstorming` to clarify what "OAuth" means for your project
2. **Phase 2 (Plan)** → invokes `superpowers:writing-plans` to draft a step-by-step implementation plan
3. **Phase 3 (Dispatch)** → invokes `superpowers:subagent-driven-development` to fan out one implementer per task. The implementer is encouraged to use `superpowers:test-driven-development`. If a task runs `git log` or similar large commands, the PreToolUse hook (installed by `/thrift` if active) routes them through `context-mode`'s `ctx_execute` to keep context clean.
4. **Phase 4 (Gate)** → invokes `superpowers:requesting-code-review` for spec + quality review
5. **Phase 5 (PR)** → uses `gh pr create` directly (no superpowers wrapper)
6. **Throughout** → `superpowers:verification-before-completion` runs `npm test` (or your stack's test command) before any phase claims success

The harness ties them together with state files (`.agent-all-state.json`), resume-from-failure, cost caps, and the cross-platform porting layer. Each layer does one thing well.

### Working without these dependencies

If you don't have `superpowers` or `context-mode` installed, the harness commands **degrade gracefully**:

- Missing `superpowers` → harness phases that would invoke a superpowers skill instead emit a "skill not available; please install superpowers@claude-plugins-official to enable this phase" message and continue or skip.
- Missing `context-mode` → `/thrift`'s coercion hooks and the `mcp__plugin_context-mode_*` tools are unavailable; everything else works. The PreToolUse hook becomes a no-op.

Both are installable in seconds and dramatically improve the experience — strongly recommended.

### Adjacent tools — Ralph Loop and `/goal`

Neither is **auto-invoked** by the harness, but both compose with it directly. See [Self-sustaining workflows](#self-sustaining-workflows) above for the recipe.

- **`/goal` (Claude Code built-in)** — Session-scoped Stop hook. You set a goal; session stays alive across iterations until the condition holds. Pairs naturally with `/agent-all --loop` for unattended overnight runs.
- **`ralph-loop` (separate plugin)** — General-purpose interval scheduler. `/agent-all --loop` is a stateful reimplementation of Ralph's pattern with phase state + cost caps + break-condition, so you rarely need both. Use `ralph-loop` when you need wall-clock periodicity (e.g. "re-check deploy every 5 min") or to chain non-loop-aware commands.

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
