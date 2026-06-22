> Korean: [USER_MANUAL.ko.md](USER_MANUAL.ko.md)

# agent-skill User Manual

This manual is written for first-time users. For shorter command recipes, see [USAGE.md](USAGE.md). For the full feature and release contract, see [README.md](../README.md).

![Quick start card](assets/user-manual/cards/01-quick-start.png)

## The Core Idea

`agent-skill` installs an agent workflow into a project. The normal path is:

1. Install the Claude Code plugins into your user scope.
2. Restart Claude Code or run `/reload-plugins`.
3. Run `/agent-init` once in each project.
4. Use `/agent-all "the work you want" --loop --qa` for feature work.

The most important distinction is **global plugin install** versus **project init**.

| Step | Scope | When | How to check |
|---|---|---|---|
| Global plugin install | Your Claude Code user scope | Once per machine, then during updates | `claude plugin list` or Claude Code `/plugin list` |
| Project init | The current git repository | Once per project | `CLAUDE.md`, `.agent-all.json`, `.claude/agents/` exist |
| Daily work | The current project | Per feature, bug, or UI change | `/agent-all "..." --loop --qa` |

If the plugins are installed globally but the project is new, you still need `/agent-init`. If the project is already initialized, do not initialize it again just because the plugins were updated.

![Init decision card](assets/user-manual/cards/03-init-decision.png)

## How It Fits Among Other Harnesses

If you are choosing between agent harnesses, start with
[Harness Positioning](HARNESS_POSITIONING.md). In practical terms:

- choose `agent-skill` when you want a reusable project-local scaffold across
  Claude, Codex, Copilot, Cursor, Gemini, and VS Code Copilot
- choose an external runner such as Gajae-Code when that runner's tmux/worktree
  execution model is the center of your workflow
- choose OMO when OpenCode-native orchestration, model routing, Team Mode,
  LSP/AST tooling, and embedded MCPs are the system you want to live in

`agent-skill` is useful as a general harness blueprint because it separates the
public command contract, project scaffold, host adapters, policy layer,
verification layer, state layer, and release layer.

## Can I Use It Right Now?

| Current state | Use `/agent-all` now? | What to do |
|---|---:|---|
| Plugins are installed and the project has `.agent-all.json` | Yes | Restart Claude Code, then use it |
| Plugins are installed, but the project is a new repo | No | Run `/agent-init` once in the project |
| The project has `CLAUDE.md` but no `.agent-all.json` | Usually no | Run `/agent-init --merge` or `/agent-init` |
| The scaffold was partially deleted or interrupted | No | Run `/agent-init --resume`, or `--force` when rebuilding intentionally |
| You want Codex, Cursor, Copilot, or Gemini | Platform-specific | Run `scripts/install-platform.sh --platform=... --target=...` |

## Claude Code Quick Start

Register the marketplace once.

```text
/plugin marketplace add https://github.com/kim-song-jun/agent-skill
```

Install the recommended set from a terminal.

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-all.sh --foundations
```

Restart Claude Code or reload plugins.

```text
/reload-plugins
```

Open your project.

```bash
cd /path/to/my-project
```

Initialize the project once.

```text
/agent-init --lang=auto
```

Then give it work.

```text
/agent-all "Fix the login button so success goes to the dashboard and failures show a useful error message" --loop --qa
```

## Project Install From a Terminal

Claude project:

```bash
git clone https://github.com/kim-song-jun/agent-skill /tmp/agent-skill
bash /tmp/agent-skill/scripts/install-platform.sh \
  --platform=claude \
  --target=/path/to/my-project \
  --lang=auto
```

Codex project:

```bash
bash /tmp/agent-skill/scripts/install-platform.sh \
  --platform=codex \
  --target=/path/to/my-project \
  --lang=auto
```

Other platforms:

```bash
bash /tmp/agent-skill/scripts/install-platform.sh --platform=cursor --target=/path/to/my-project
bash /tmp/agent-skill/scripts/install-platform.sh --platform=copilot --target=/path/to/my-project
bash /tmp/agent-skill/scripts/install-platform.sh --platform=gemini --target=/path/to/my-project
```

VS Code Copilot is instructions-only:

```bash
bash /tmp/agent-skill/scripts/install-platform.sh --platform=vscode-copilot --target=/path/to/my-project
```

## Main Commands

![Command map card](assets/user-manual/cards/02-command-map.png)

| Command | What it does | Common example |
|---|---|---|
| `/agent-init` | Installs project-local rules and agent definitions | `/agent-init --lang=auto` |
| `/agent-all` | Runs feature work, bug fixes, tests, review, and PR flow | `/agent-all "fix search filter reset" --loop --qa` |
| `/visual-qa` | Checks screenshots, responsive states, clickable elements, and UI regressions | `/visual-qa` |
| `/thrift` | Summarizes long sessions and large output to reduce context and cost | `/thrift`, `/thrift audit` |
| `/explore` | Maps the codebase and finds symbols quickly | `/explore where UserRepository` |
| `/debug` | Reproduces failures and narrows root cause | `/debug "npm test fails on login"` |
| `/data-runner` | Guides SQL, notebook, and batch artifact verification | `/data-runner sql .agent-skill/tasks/T-YYYYMMDD-001-report.md` |
| `/agent-handoff` | Writes a handoff and resume prompt for a later session | `/agent-handoff .agent-skill/tasks/T-YYYYMMDD-001-login.md` |
| `/wiki` | Self-auditing project knowledge base in `.wiki/` (Karpathy LLM-Wiki pattern) | `/wiki <query>`, `/wiki compile` |

## Writing Good Requests

Give `/agent-all` the goal, success criteria, and the screen or command that should prove success.

Good:

```text
/agent-all "When the product search text is cleared, reset pagination to page 1. Keep existing sorting, add tests, and check the list/filter UI at 390px mobile and 1440px desktop" --loop --qa
```

Good:

```text
/agent-all "Add a hide inactive users toggle to the admin users page. The API field is isActive. Keep pagination behavior unchanged and add tests" --loop --qa
```

Too vague:

```text
/agent-all "fix the dashboard"
```

The vague request can still run, but the agent is more likely to ask questions or guess wrong.

## UI Work

For UI work, prefer `--qa`.

```text
/agent-all "Improve the payment failure modal copy and button layout" --loop --qa
```

Run `/visual-qa` when you only want to inspect the UI again.

```text
/visual-qa
```

In Claude Code, visual QA can be used as a strong gate. Codex, Cursor, Copilot, and Gemini ports use the host surface they have available, which means prompt-level or helper-based behavior in some cases.

## Long Sessions And `/thrift`

Use `/thrift` when logs, test output, or old conversation context start making the session expensive or slow.

```text
/thrift
/thrift audit
```

Since v0.6.1, if a project has no `.thrift.json` and repeated large outputs appear, the context-mode router recommends `/thrift`. If thrift scaffold is already installed, threshold-based `/thrift summarise` and `/compact` guidance can appear.

This is the automatic `/thrift` recommendations path: it tells you when thrift would help, then waits for you to run the command.

The recommendation is advisory. It does not make risky changes automatically. When you run `/thrift`, it writes summaries and audit evidence so the next step keeps the important context without carrying the full raw output.

Cost-saving habits:

- Point to log files or failing commands instead of pasting large logs into chat.
- Include success criteria in the request.
- Name the screens that need UI validation.
- Use `/debug` first when the same failure repeats.

## `/wiki` — Project Knowledge Base

`/wiki` maintains a self-auditing knowledge base in `.wiki/`, implementing the Karpathy LLM-Wiki pattern (MIT). It stores project knowledge as provenance-graded pages (A primary / B secondary / C inferred) with an `INDEX.md` that acts as a router. Contradictions are preserved explicitly rather than silently resolved. A SessionStart digest prints wiki status at each session open.

Core commands:

| Command | What it does |
|---|---|
| `/wiki <query>` | Look up a query in the index, then read or write the page |
| `/wiki write <title>` | Write a new wiki page |
| `/wiki update <slug>` | Update an existing page |
| `/wiki compile` | Self-audit gate: every index entry must have a page and vice-versa (diff=0) |
| `/wiki status` | Index summary — entry count, drift, top grades |
| `/wiki list` | List all indexed pages |

Availability: runnable skill in Claude Code (harness-floor) and Codex (harness-floor-codex, near-native). Copilot, Gemini, and Cursor have prose-only ports in their host-context templates with no runnable `/wiki` command. The `WIKI_DIR` env var redirects the CLI to a non-default wiki root.

## Agent Definitions And Workflow

`/agent-init` creates project-local files like these:

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project rules for the agent |
| `AGENTS.md` | Shared agent guidance for other CLIs |
| `.claude/agents/*.md` | Implementer, reviewer, QA, security, and data role definitions |
| `.claude/hooks/*.mjs` | Policy checks, context handling, and session summary hooks |
| `.agent-all.json` | `/agent-all` loop, budget, and success criteria |
| `.visual-qa.json` | UI verification targets and modes |
| `.thrift.json` | Session summary and cost-control settings |

`/agent-all` chooses roles from the request and the changed files. Frontend work can add frontend, design, and QA review. Auth or permission work can add security review. SQL, notebook, and batch artifact work can add data review and verification adapters.

Completion is evidence-based: tests, verification adapters, visual QA verdicts, reviewer results, and policy hooks decide whether the loop continues or stops.

## Platform Support

The project renderer writes files in the format each host can actually read.

| Platform | Install | Invocation | Current strength |
|---|---|---|---|
| Claude Code | `install-all.sh` or `/plugin install` | `/agent-init`, `/agent-all`, `/visual-qa`, `/thrift` slash commands | Hard |
| Codex CLI | `install-platform.sh --platform=codex` | `AGENTS.md` and `.codex/skills/`, then `run /agent-all for ...` | Mixed. Shell policy can be hook-gated; floor workflow is sequential prompt-level |
| Cursor | `install-platform.sh --platform=cursor` | Cursor chat references installed agents and rules | Soft |
| GitHub Copilot CLI | `install-platform.sh --platform=copilot` | Copilot instructions and optional hook helper | Prompt-level, hook helper after manual review |
| VS Code Copilot | `install-platform.sh --platform=vscode-copilot` | Copilot Chat reads `.github/copilot-instructions.md` | Instructions-only |
| Gemini CLI | `install-platform.sh --platform=gemini` | `GEMINI.md` and `.gemini/skills/` | Soft |

Claude Code and Codex have the strongest local release gate coverage. Cursor, Copilot, Gemini, and VS Code Copilot have automated renderer and fixture checks, while live host UX still includes prompt-level or manual verification surfaces.

## Safety Rules

- Existing `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md` files are not blindly overwritten. Generated sentinel sections are added or replaced.
- `install-platform.sh` does not patch global CLI config files. Codex and Gemini global snippets are printed to stdout for manual merge.
- Destructive SQL or data work is blocked unless explicitly approved.
- Loops can stop on cost, runtime, iteration count, policy hook failure, interruption, or repeated failure signatures.
- The workflow should not claim done when tests or visual QA are failing.

## Troubleshooting

Check installed plugins:

```bash
claude plugin list
```

Refresh the marketplace:

```text
/plugin marketplace update agent-skill
```

Update installed plugins:

```text
/plugin update --marketplace agent-skill
/reload-plugins
```

Run the project doctor:

```bash
node /tmp/agent-skill/scripts/doctor.mjs --target=/path/to/my-project --platform=claude
```

For Codex:

```bash
node /tmp/agent-skill/scripts/doctor.mjs --target=/path/to/my-project --platform=codex
```

Resume an interrupted init:

```text
/agent-init --resume
```

Rebuild intentionally:

```text
/agent-init --force
```

## Image Manual

These seven images are the visual manual pages used in the v0.6.1 release PDF. They are tracked in `docs/assets/user-manual/pages/` so repository readers can view them directly.

![Start page](assets/user-manual/pages/01-start.png)

![Quick start page](assets/user-manual/pages/02-quick.png)

![Init decision page](assets/user-manual/pages/03-init.png)

![Commands page](assets/user-manual/pages/04-commands.png)

![Recipes page](assets/user-manual/pages/05-recipes.png)

![Cost page](assets/user-manual/pages/06-cost.png)

![Help page](assets/user-manual/pages/07-help.png)

## Where To Look

| Need | Document |
|---|---|
| First-time full guide | This document |
| Short command recipes | [USAGE.md](USAGE.md) |
| Full feature and release gate | [README.md](../README.md) |
| Korean manual | [USER_MANUAL.ko.md](USER_MANUAL.ko.md) |
| v0.6.1 release PDF | <https://github.com/kim-song-jun/agent-skill/releases/tag/v0.6.1> |
