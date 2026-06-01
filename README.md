> 🇰🇷 한국어: [README.ko.md](README.ko.md)

# agent-skill

![status](https://img.shields.io/badge/status-stable--cli--verification--pending-blue) ![tests](https://img.shields.io/badge/tests-1602%20passing-brightgreen) ![plugins](https://img.shields.io/badge/plugins-17-blue) ![themes](https://img.shields.io/badge/themes-5%20(A%20B%20C%20D%20E)-blueviolet) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

**Agent-first workflows that run themselves.** One `/agent-init` per project; one `/agent-all "..." --loop --qa` per feature; the agent brainstorms → plans → writes → tests → **visually QAs every page** → opens the PR — and keeps iterating until tests AND the UI both pass — without you babysitting every turn.

Works on Claude Code today, with cross-platform ports for **Cursor, GitHub Copilot CLI, VS Code Copilot, Codex CLI, and Gemini CLI**. 17 plugins, 5 slash commands, one marketplace.

```
/agent-init                                  # bootstrap any git repo (Phase A — once per project)
/agent-all "Add Google OAuth" --loop --qa    # tests + visual-qa until both pass, opens PR (Phase C)
/visual-qa                                   # screenshot every page, LLM design review (declared or comprehensive)
/thrift                                      # keep long sessions affordable (auto-summarize, audit)
/explore                                     # codebase map; /explore where Foo → O(1) lookup
/debug "tests flaky 30% of runs"             # reproduce → bisect → hypothesize → verify
```

**Three things that make it click:**

1. **Project-first scaffolding.** `/agent-init` works on any git repo — Next.js, FastAPI, Rust CLI, monorepo. It detects your stack, picks the right test command, and creates `CLAUDE.md` + `AGENTS.md` + agents + hooks + config in one commit. Same command, every project.

2. **Agent-first execution that preserves your main thread.** `/agent-all "..."` isn't a chat. It runs brainstorm → plan → implement → review → PR as **one pipeline**, and the implementation/review heavy lifting happens in **isolated subagents** — their turn-by-turn output never enters your main conversation. A built-in two-layer safety net mandates `superpowers:verification-before-completion` per implementer + cross-checks at Phase 4 review, so broken code can't sneak into a PR. Your main session stays small (planning + judgment) so the same Claude Code session can keep going for hours without context bloat.

3. **One-flag end-to-end verification.** `--qa` wires the loop's "done" check to **tests + visual UI check**: visual-qa crawls every page, DOM-walks every interactive element, shallow-clicks each button, screenshots every state, diffs vs baseline — and only breaks the loop when both tests and the UI verdict pass. Compose with `/thrift` + `/goal` for unattended overnight runs. See [Self-sustaining workflows](#self-sustaining-workflows).

That's it. The rest of this README is reference material — skim the parts you need.

---

## Prerequisites

- **Node.js ≥ 20** — required for all install renderers (`bin/init.mjs`, `bin/install.mjs`, `scripts/install-all.sh`, `scripts/install-platform.sh`)
- **git** — required by `/agent-init`, `/agent-all`, and `/explore` (HEAD-keyed cache)
- **gh CLI** (optional) — for `/agent-all` Phase 5 PR creation; without it, `/agent-all` falls back to `--no-pr` mode
- **For Claude Code**: marketplace plugin support (any recent build)
- **For per-platform project renderers**: writable target project directory. Target CLIs are only needed when you run the generated workflows; `install-platform.sh` does not patch global CLI config files.

Strongly recommended (the harness composes on top of these — degrades gracefully if missing):

- `superpowers@claude-plugins-official` — foundational skills (brainstorming, writing-plans, subagent-driven-development, verification-before-completion, etc.)
- `context-mode@context-mode` — keeps raw tool output out of main conversation

See [How this fits with the rest of the Claude ecosystem](#how-this-fits-with-the-rest-of-the-claude-ecosystem) for details on how they integrate.

---

## Install in 60 seconds

First, register the marketplace (once per machine):

```
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

### Option A: one-liner (recommended)

```bash
# Outside Claude Code, in a terminal:
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh
```

Installs all 5 Claude Code essentials at once via the `claude` CLI. Run `--all` for all 17 plugins (CLI-platform siblings too), or `--cli=codex|copilot|gemini|cursor` for a single platform set.

### Option B: paste into Claude Code

```
/plugin install harness-builder@agent-skill
/plugin install harness-floor@agent-skill
/plugin install harness-thrift@agent-skill
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/reload-plugins
```

(Claude Code's `/plugin install` accepts only one plugin at a time, so the script in Option A is faster.)

### Then in your project

```
cd my-project
/agent-init
```

You're done. Try `/agent-all "small feature"` to see it work.

---

## Keep plugins up to date

**In Claude Code:**
```
/plugin update --marketplace agent-skill
```

That single command updates everything **already installed** from this marketplace.

**From your terminal (any platform, one-liner):**
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kim-song-jun/agent-skill/main/scripts/update.sh)
```

`scripts/update.sh` self-locates the repo (or clones into a temp dir), pulls latest, verifies vendored libs (`sync-lib.mjs --check`), force-updates already-installed selected plugins by uninstalling/reinstalling them, then re-runs `install-all.sh` for anything missing. Pass `--all` for all 17 plugins or `--cli=cursor|copilot|codex|gemini` for one platform set. It does not patch global CLI config files.

For other CLIs without a marketplace, see [Updating on other tools](#updating-on-other-tools).

### Install newly added plugins

Important: `/plugin update` only updates plugins you've already installed. The marketplace can grow over time (we added 6 new plugins on 2026-05-18 alone — `harness-thrift`, `harness-explore`, `harness-debug`, plus 3 thrift CLI ports). To pick those up:

```
/plugin marketplace update agent-skill        # refresh the listing
/plugin install harness-thrift@agent-skill    # install each new plugin you want
/plugin install harness-explore@agent-skill
/plugin install harness-debug@agent-skill
/reload-plugins                               # apply
```

**Quick check** — see what you currently have installed from this marketplace:

```bash
cat ~/.claude/plugins/installed_plugins.json | python3 -m json.tool | grep -B1 agent-skill
```

If the count is below 5 (the recommended Claude Code set: builder + floor + thrift + explore + debug) you're missing the recent additions.

---

## What each command does

### `/agent-init` — set up the project

Run once per project. Operational mode creates task ledger files, local folder guides, Claude/Codex policy hooks, and reviewer personas. Existing `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` are updated by an `agent-skill:operational` sentinel section instead of overwritten.

```
/agent-init                       # default: operational/heavy scaffold
/agent-init --lite                # minimal root memory + minimal roles
/agent-init --dry-run             # print planned files and config patches
/agent-init --update-foundations  # update approved foundation plugins only
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

Captures screenshots at mobile/tablet/desktop, runs LLM analysis per image, writes a Markdown report AND a self-contained `report.html` lightbox viewer (v0.4+). Needs Playwright MCP + a dev server.

**v0.4 additions:**
- **Before/after pairs** per tracked element + baseline diff alongside.
- **`comprehensive.targets`** — element-scope `includeSelectors` / `excludeSelectors` / `actionsPerElement` to constrain or augment auto-discovery.
- **Multi-tier element identity** (`data-vqa-id` → semantic fingerprint → DOM path) so baseline matching survives wrapper / reorder refactors.

See `docs/superpowers/specs/2026-05-22-visual-qa-pairs-and-element-scope-design.md`.

Two modes (set via `.visual-qa.json` `mode` field):

- **`declared`** (default, back-compat): you list pages + selectors + states yourself.
- **`comprehensive`**: auto-discover everything. Crawls from `baseUrl`, walks each page's DOM for every interactive element (button, link, input, `[data-testid]`, `[role=*]`), shallow-clicks each non-input to capture the 1-step result state. Verdict is computed vs the prior accepted run; cost stays bounded by git-diff scoping + a DOM-hash cache. This is what `/agent-all --loop --qa` invokes per iter.

```
npm run dev                     # in another terminal
/visual-qa                      # captures + analyzes
/visual-qa --slug="launch"      # custom output folder
/visual-qa --budget=20          # cap LLM cost at $20
```

Output lands in `docs/visual-qa/<date-or-slug>/report.md` (+ `verdict.json` in comprehensive mode).

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

**Ship a UI feature end-to-end (the killer flow):**
```
npm run dev            # in another terminal — dev server at http://localhost:3000
/agent-all "Build user dashboard with charts + filters" --loop --qa --max-iter=10
# walk away — loop only breaks when tests AND visual-qa both pass
```

**Start a new project, ship a feature:**
```
mkdir my-app && cd my-app && git init && git commit --allow-empty -m "init"
/agent-init
/agent-all "Build a CLI to convert Markdown to PDF"
```

**Onboard to an unfamiliar codebase:**
```
git clone <repo> && cd <repo>
/agent-init --lite
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

### Why this works — main-thread isolation

`/agent-all`'s real trick isn't the loop. It's **where the work happens.**

| Phase | Where it runs | What enters main context |
|---|---|---|
| 0 Preflight | main | git checks (~tiny) |
| 1 Intent (brainstorm) | main | Q&A with you (moderate accumulation) |
| 2 Plan | main | the plan file (moderate) |
| **3 Dispatch (3a/3b/3c)** | **fresh subagents (3a/3c parallel) + main (3b sequential ask)** | scoping payloads (~few-hundred tokens per task) + user-selected answers — implementer's code-writing stays isolated |
| **4 Gate** | **fresh subagents** | only spec/quality verdicts + reviewer-audit token — reviewer's reading stays isolated |
| 5 PR | main | `gh pr create` output (small) |
| 6 Loop | main | breakCondition exit code (one number) |

Heavy lifting (reading code, writing patches, running tests, fixing failures) happens **inside subagents** dispatched via `superpowers:subagent-driven-development`. Each subagent is a fresh conversation; their turn-by-turn output never enters your main session. Main sees only the verdict — so a loop iteration adds maybe 2–5K tokens, not 50K.

### Decision-surfacing — when subagents pause for input

Phase 3 now runs as **3a (scoping) → 3b (ask) → 3c (implement)**. Each implementer subagent first does a read-only scoping pass and returns architectural / spec-ambiguity decisions as a structured JSON payload. Main thread shows them as a 1/2/3 panel with the subagent's recommendation flagged (via `AskUserQuestion`). The subagent is then re-dispatched with the answers baked in.

In **non-TTY mode** (overnight loops, `--yes`, iteration ≥ 2), recommended options are auto-picked and logged to `.agent-all-state.json` + `docs/agent-all/iter-<N>/decisions.md`. Overnight workflow preserved.

Enforced via a single pair of `floor-policy` hooks (PreToolUse + PostToolUse on `Task`) that also opportunistically validates `verification_passed` and `VERIFICATION_AUDIT:` tokens. Opt out per project in `.agent-all.json`:

```json
{ "policy": { "decisionSurfacing": false, "verification": true, "reviewerAudit": true } }
```

See `docs/superpowers/specs/2026-05-21-decision-surfacing-and-policy-hooks-design.md`.

### The composable trio

For overnight runs you want three things working together:

| Piece | Solves | Knows about |
|---|---|---|
| **`/agent-all --loop`** | Drive the workflow to verified completion within cost bounds | Phases, plan, dispatched agents, what was tried, accumulated cost, where it failed |
| **`/thrift`** | Compress what *does* accumulate in main before it bloats the session | Token-count thresholds, cache priming, end-of-session audit |
| **`/goal`** | Keep Claude Code from ending the session between iterations | Nothing about your work — pure Stop-event blocker |

```
/thrift                                                 # cost guardrails (once per project)
/goal "ship the analytics dashboard with all CI green"  # session keeps itself alive
/agent-all "Build analytics dashboard" --loop --qa \
  --max-iter=15 --max-cost=80
# walk away — wake up to a merged PR or a precise "stopped at iter 7 because <reason>"
```

### Loop completion — what counts as "done"

The loop re-enters Phase 1 after each PR until a **break-condition** passes. Pick one of:

| You want | What to do | What runs each iter |
|---|---|---|
| Just tests | `--loop` (then pick "Test command" on first prompt) | `npm test` / `pytest` / `cargo test` — stack-detected |
| Full E2E (tests + visual UI check) | `--loop --qa` ← **the shortcut** | tests → visual-qa comprehensive |
| Custom command | `--break-condition='make ci'` | your one-liner |
| Anything explicit | `--break-condition='{"type":"composite","steps":[...]}'` | JSON spec |

On the **first** `/agent-all --loop` in a project, Phase 0 prompts interactively (test / visual-qa / custom / composite) and offers to save the choice to `.agent-all.json`. Subsequent runs reuse the saved value. `--reconfigure` forces a re-prompt; `--yes` / non-TTY skip it.

### `--qa` end-to-end: prerequisites and step-by-step

`/agent-all "build user dashboard" --loop --qa --max-iter=10`

**Prerequisites** (the most common cause of "it didn't work"):

- A **dev server** running at `http://localhost:3000` (or whatever you put in `.visual-qa.json`'s `baseUrl`). Phase 0 probes it with `curl --max-time 3`; if unreachable, you get a clear prompt before anything else runs.
- **Playwright MCP** installed (the `mcp__plugin_playwright_playwright__*` tools must be available). `/visual-qa --skip-health` for a sanity check.

**What `--qa` actually does**:

1. **Phase 0**: probes `baseUrl`. If missing, asks before continuing. If `.visual-qa.json` doesn't exist, scaffolds it with sane defaults (mode=comprehensive, scope `/`, maxPages 50, depth 3, click 1-level, vs-baseline verdict, **firstRun=report** so iter 1 surfaces issues instead of silently locking them in as baseline).
2. **Phase 1-5**: agent-all's normal pipeline — brainstorm → plan → wave-dispatched implement → wave-reviewed → PR.
3. **Phase 6 (loop)**: runs `test-auto` (stack-detected test command) first. If tests fail → next iter. If tests pass → dispatches a fresh Task-tool subagent to invoke the `visual-qa` skill with `--slug=loop-iter-<N> --force --yes` (per-iter slug keeps iters from clobbering each other; Phase 2 of visual-qa still finds the previous iter as baseline).
4. visual-qa runs its own 6-phase pipeline: crawl from `baseUrl`, DOM-walk each page for interactive elements, shallow-click each button/link, screenshot every state, LLM-analyse each shot, compute verdict vs baseline. Exit 0 if no new critical/major regressions; exit 1 otherwise.
5. Phase 6 sees the verdict. Pass → loop breaks (you're done). Fail → next iter starts with the previous failure visible in the plan.

**Cost controls** (so loop iterations don't drown you):

- **git-diff scope**: only pages whose source code changed since the last iter get re-crawled (framework auto-detect for Next.js / Remix; conservative "rebuild everything" fallback)
- **DOM-hash cache**: components whose DOM hasn't changed reuse the prior LLM verdict instead of re-analysing
- **`--max-iter`** + **`--max-cost=USD`** hard caps as always

### `/agent-all --loop` flag reference

| Flag | Default | Effect |
|---|---|---|
| `--loop` | off | Enable Phase 6 re-entry. First use prompts for break-condition. |
| `--max-iter=N` | 1 | Hard cap on iterations (server-clamped to 50) |
| `--max-cost=USD` | 500 | Cap on accumulated API cost; checked after each wave |
| `--qa` | — | Shortcut: composite `test-auto → visual-qa(comprehensive)` + autoscaffold. See above. |
| `--break-condition=<spec>` | — | Non-interactive override. JSON object or shell string. |
| `--reconfigure` | — | Force re-prompt even when `.agent-all.json` has a non-default value. |
| `.agent-all.json: breakCondition` | `npm test` (auto-detected) | Persisted spec. String = shell; object = `shell` / `test-auto` / `visual-qa` / `composite`. |
| `.agent-all.json: stableIters` | 1 | Consecutive passes required before loop breaks clean. |

### Troubleshooting — common loop / `--qa` failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Loop exits immediately with `exit=1` from visual-qa | dev server not running on `baseUrl` | `npm run dev` (or equivalent) in another terminal, then re-run with `--resume` |
| visual-qa aborts with "playwright MCP not available" | Playwright MCP not installed | `claude mcp add plugin-playwright` (or your platform's equivalent) |
| Loop runs but **never** breaks | `stableIters > 1` and one of N consecutive runs is failing intermittently | check `.agent-all-state.json` `consecutivePass`; lower `stableIters` to 1 if your test suite is flaky |
| visual-qa hits `--max-cost` on iter 2 | DOM-hash cache cold + git-diff scoper had nothing to filter on | iter 2+ are usually cheaper; if not, set `comprehensive.cache.gitDiffScope: true` (default) and confirm autoscaffold framework detection |
| iter 1 "passes" but UI is clearly broken | first-run policy is `report` (default) — loop passes but issues are reported. Read `docs/visual-qa/loop-iter-1/report.md` | Fix the issues, then iter 2 will hold the bar against the iter-1 baseline |
| `--qa` writes a config but I want different settings | `--qa` autoscaffold runs only when `.visual-qa.json` is missing | Edit `.visual-qa.json` (change scope, breakpoints, baseUrl, etc.) — subsequent runs use the file as-is |

### How this is different from `/goal` and Ralph Loop

`/agent-all --loop` is **not** "Ralph Loop plus features" — it's an orchestrator that happens to loop. The differences matter:

| Tool | What it solves | What it knows about |
|---|---|---|
| **`/goal`** | "Don't let the session stop until X." | Nothing about your work. Pure Stop-event blocker. |
| **Ralph Loop** | "Re-run this prompt every N minutes." | Nothing between runs. Stateless re-fire. |
| **`/agent-all --loop`** | "Drive a complete workflow (brainstorm → plan → code → review → PR) to verified completion within cost bounds." | Phases, plan, dispatched agents, what was tried, cost, where it failed. |

What the harness adds that neither has: multi-phase workflow awareness, **stateful retries** (each iter sees the previous failure), **wave-granularity cost caps** (`--max-cost` checked after each wave so it can bail mid-feature), **resume-from-failure** via `.agent-all-state.json`, and **phase-aware break-conditions** (evaluated after PR creation, not mid-implementation).

`/goal` and Ralph are **complements**, not alternatives. `/goal` + `/agent-all --loop` is the unattended-overnight pattern shown above. Ralph wrapping a non-`--loop` `/agent-all` makes sense only for wall-clock periodicity (e.g. `/ralph-loop 5m /agent-all "check deploy"`).

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
/agent-init --lite                         # detects Cargo.toml → "cargo test"
/agent-all "Add git-style subcommands" --loop --max-cost=25
```

---

## Use it on other AI tools

Claude Code has a native marketplace (`/plugin install`). The other AI tools — Cursor, GitHub Copilot, Codex CLI, Gemini CLI, VS Code — **don't have a comparable plugin marketplace for AI workflows**, so we ship renderer scripts that write the right files into your project. Each per-platform plugin emits the config + hook + skill files in that tool's expected layout.

### One-command install per platform

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
cd /tmp/agent-skill

# Cursor
./scripts/install-platform.sh --platform=cursor --target=/path/to/my-project

# GitHub Copilot CLI
./scripts/install-platform.sh --platform=copilot --target=/path/to/my-project

# VS Code with Copilot extension (same emitter as Copilot CLI)
./scripts/install-platform.sh --platform=vscode-copilot --target=/path/to/my-project

# OpenAI Codex CLI
./scripts/install-platform.sh --platform=codex --target=/path/to/my-project

# Google Gemini CLI / antigravity
./scripts/install-platform.sh --platform=gemini --target=/path/to/my-project
```

Default installs all three themes (builder + floor + thrift). Use `--theme=floor` or `--theme=thrift` to install just one. `install-platform.sh` writes project-local files and prints any global config snippets to stdout; it does not patch global CLI config files.

### What each platform receives

| Platform | Files written | Notes |
|---|---|---|
| **Cursor** | `.cursor/rules/*.mdc`, `.cursor/agents/*.md`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | All native. `is_background: true` on parallel subagents. |
| **Copilot CLI** | `.github/copilot-instructions.md`, `.github/hooks/*.json`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | Hooks integrate with `gh copilot`. |
| **VS Code Copilot** | `.github/copilot-instructions.md`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | VS Code Copilot extension reads `.github/copilot-instructions.md` automatically. Hooks dir written but unused by the editor. |
| **Codex CLI** | `AGENTS.md`, `.codex/skills/<role>/SKILL.md`, `.codex/hooks/agent-policy-hook.mjs`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | A `[mcp_servers.playwright]` snippet and current command-hook snippets such as `[[hooks.PreToolUse]]` are printed to stdout. Floor workflows use prompt-level/sequential dispatch because Codex command hooks do not expose Claude Code's Task-style subagent surface. |
| **Gemini CLI** | `GEMINI.md`, `.gemini/skills/<role>/SKILL.md`, `.visual-qa.json`, `.agent-all.json`, `.thrift.json` | A `mcpServers` snippet is printed to stdout — **merge manually** into `~/.gemini/settings.json`. |

### Once installed, how do you actually use it?

Each tool invokes skills its own way. The harness is the same; the entry point differs:

| Tool | Invoke `/agent-all` equivalent |
|---|---|
| **Claude Code** | `/agent-all "..."` slash command directly |
| **Cursor** | Open Cursor chat → "@agent-all-coordinator run /agent-all for ..." (uses `.cursor/agents/agent-all-coordinator.md` you just installed) |
| **Copilot CLI** | `gh copilot suggest -t "follow .github/copilot-instructions.md to run agent-all for ..."` OR open Copilot chat in the repo and reference the workflow |
| **VS Code Copilot** | Open Copilot Chat in the project, the extension auto-loads `.github/copilot-instructions.md` |
| **Codex CLI** | `codex` → it loads `AGENTS.md` and `.codex/skills/`; type `run /agent-all for ...` |
| **Gemini CLI** | `gemini` → loads `GEMINI.md` and `.gemini/skills/`; type the workflow request |

`/explore` and `/debug` ship for Claude Code only today — per-platform ports are deferred (specs at `docs/superpowers/specs/2026-05-18-harness-thrift-per-platform-decomposition.md` describe the work).

---

## Updating on other tools

Updates work the same as install — **re-run the script** with `--force`. The renderers are idempotent (won't double-register hooks; uses `thrift-` / `floor-` command-path sentinel) but `--force` is needed to overwrite existing config files like `.visual-qa.json`:

```bash
cd /tmp/agent-skill
git pull                                                          # get latest version
./scripts/install-platform.sh --platform=cursor --target=/path/to/my-project --force
```

### What's NOT real (don't run these)

The following commands look natural but **don't exist** in those CLIs' plugin systems today:

```
❌ gh copilot plugins install harness-floor-copilot
❌ codex plugins install harness-floor-codex
❌ gemini extensions install harness-floor-gemini
```

These platforms don't have plugin marketplaces for AI workflows yet. Use `./scripts/install-platform.sh` instead.

### Uninstall per platform

```bash
# Per-plugin clean removal — only removes that plugin's artifacts
node plugins/harness-thrift-cursor/bin/install.mjs /path/to/project --uninstall

# Manually for the rest — delete:
# - .cursor/ (Cursor)
# - .github/copilot-instructions.md + .github/hooks/ (Copilot)
# - AGENTS.md + .codex/ (Codex)
# - GEMINI.md + .gemini/ (Gemini)
# - .visual-qa.json + .agent-all.json + .thrift.json (all platforms)
```

A future `install-platform.sh --uninstall` flag is planned; for now uninstall is per-plugin via each plugin's bin script.

---

## Common questions

**Will `/agent-init` overwrite my CLAUDE.md?**
No. It preserves existing content and adds or replaces only the `agent-skill:operational` sentinel section. Use `--lite` for the minimal scaffold; use `--force` only when you intentionally want to rebuild generated harness artifacts.

**Is `/agent-all --loop` safe to leave unattended?**
Yes — four layers of safety make it boring to walk away from:
1. **Hard caps**: `--max-iter` (clamped at 50), `--max-cost` (default $500), evaluated after each wave.
2. **`breakCondition`**: shell command (your test suite) must exit 0; otherwise loop re-enters Phase 1.
3. **Implementer verification (mandatory)**: every dispatched implementer subagent MUST invoke `superpowers:verification-before-completion` before claiming done; failure → `STATUS: blocked` (not silently merged).
4. **Reviewer audit at Phase 4**: every reviewer subagent MUST confirm the implementer actually verified; skipped/failed verification → escalated as `critical`, blocks PR.
Combined: broken code can't sneak through, costs can't explode, and the session can't run forever.

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
- **Change history** — see [CHANGELOG.md](CHANGELOG.md). 1602 tests, all green.
- **Per-platform porting** — see specs ending in `-impl-spec.md` or `-decomposition.md` under `docs/superpowers/specs/`.
- **Cross-platform support matrix** — see [docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md](docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md).
- **Hook precedence (if you're mixing plugins that all register hooks)** — see [docs/superpowers/specs/2026-05-18-hook-precedence-integration.md](docs/superpowers/specs/2026-05-18-hook-precedence-integration.md).

---

## Status

| Layer | Status | Note |
|---|---|---|
| Unit/integration tests | ✅ **1602/1602 passing** | Mock toolCallers + isolated lib tests; release-doc, policy, Codex hook-schema, task-ledger, and visual-qa regressions |
| Install renderers (5 platforms) | ✅ end-to-end verified | `install-all.sh` + `install-platform.sh` |
| Marketplace registration | ✅ 17 plugins listed | sync between local + origin |
| Claude Code skills | ✅ ship today | core `harness-builder` / `harness-floor` / `harness-thrift` / `harness-explore` / `harness-debug` |
| Cross-platform CLI runtime | ⚠️ **CLI verification pending** | Sandbox lacks Codex/Copilot/Gemini binaries; checklist in `docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md` |
| `/thrift` v2 programmatic compact | ⏳ deferred | Waits on Claude Code's programmatic compact API |
| Anthropic/OpenAI/Vertex SDK hookup | ⏳ deferred | Currently mock toolCallers; production hookup needs peer deps |

Versioning: `harness-floor` at `v0.5.1` (visual-qa runtime wiring + agent-init i18n patch), other Claude Code core plugins at `v0.2.0`, per-platform ports at `v0.1.0`.

### Language

Decision-surfacing prompts and panels are localized. Set `.agent-all.json` `language` to `"auto"` (default — reads `$LANG`), `"en"`, or `"ko"`. Machine-parsed tokens (`STATUS: DONE`, `verification_passed`, `VERIFICATION_AUDIT:` etc.) stay English by design. Add more languages by adding entries to `lib/decisions/renderer.mjs` `LABELS` + a sibling `addendum.<lang>.md`.

---

## Known limitations

- **Cursor / Gemini / VS Code Copilot decision-surfacing enforcement is soft.** Those platforms don't expose tool-call hooks, so the protocol is prompt-injected via rules / `GEMINI.md` / `copilot-instructions.md`. A non-compliant subagent cannot be blocked at the harness layer. Claude Code and Copilot CLI get Task-level hard enforcement; Codex CLI uses current command hooks for shell/policy events, while floor subagent workflows remain prompt-level/sequential.

- **Non-TTY auto-pick can be wrong.** Overnight runs auto-resolve every decision to the subagent's `recommended_index`. Mistakes only surface the next morning. Every auto-pick is logged with reasoning to `docs/agent-all/iter-<N>/decisions.md` so the next iteration's plan can flag past picks for re-review.

- **`description`-based dispatch routing for policy hook.** The `floor-policy` hook identifies implementer/reviewer subagents by `Task` tool `description` (`"Implement Task ..."` / `"Review Task ..."`). User-dispatched subagents that happen to use those words also trigger the protocol. Per-project opt-out via `.agent-all.json` `policy: { decisionSurfacing: false }`.

- **`/explore` rarely fires the protocol.** It's read-only and seldom faces architectural decisions. Hook is installed for consistency; in practice a no-op for explore.

- **Per-task scoping pass adds ~15-20% subagent cost.** Each implementer is dispatched twice (scoping + impl). `--max-cost` still governs.

## Roadmap

- Live CC + per-platform CLI runtime verification (follow the runtime checklist)
- `/thrift` v2 summariser using Claude Code's programmatic compact API
- Real Anthropic/OpenAI/Vertex SDK hookups (replace mock toolCallers)
- `/explore` and `/debug` per-platform ports (Cursor/Copilot/Codex/Gemini)
- Subagent transcript-listener bridge for Cursor's `is_background: true` awaiter
- Telemetry opt-in for thrift audit (which coercions actually fired, real-world cost savings)

## License & Contributing

MIT License. PRs welcome — open an issue first for design discussion on anything beyond a one-file fix.

Before submitting:
```bash
./scripts/release-smoke.sh --fast        # Claude/Codex release smoke gate
node --test                              # 1602/1602 must pass
node scripts/sync-lib.mjs --check        # vendored shared libs in sync
```

Repository conventions:
- All plugin libs (`plugins/*/skills/*/lib/*.mjs`) are pure Node — no host dependencies; cross-plugin imports forbidden (enforced by `tests/lib/cross-platform-isolation.test.mjs`)
- Vendored `render.mjs` copies stay byte-identical to `plugins/harness-builder/skills/agent-init/lib/render.mjs` (canonical source); sync via `node scripts/sync-lib.mjs`
- New plugins must register in `.claude-plugin/marketplace.json` AND update `tests/lib/cross-platform-{manifest,isolation}.test.mjs`
- New hook registrations must follow the sentinel-based protocol in `docs/superpowers/specs/2026-05-18-hook-precedence-integration.md`
