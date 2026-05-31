# harness-floor-codex

> **Decision-surfacing enforcement: 🟡 Prompt-level for Codex floor workflows.** Current Codex command hooks do not expose a Task-like subagent dispatch surface for this pipeline. The Codex floor port uses sequential skill dispatch and embeds the decision, verification, and reviewer directives in prompt text.

Operational floor support for Codex CLI. The Codex port uses sequential skill
dispatch for agent-all and visual-qa work; prompt directives carry the
decision-surfacing, verification, and reviewer-audit contracts.

Emits:

- `.visual-qa.json` at project root (capture matrix configuration)
- `.agent-all.json` at project root
- Playwright MCP snippet printed to stdout — merge into `~/.codex/config.toml`

## Install

```
./scripts/install-platform.sh --platform=codex --theme=floor --target=/path/to/project
```

## Usage

Run `agent-all-codex` or `visual-qa-codex` inside Codex CLI. The skills:

1. Load the generated `AGENTS.md` and `.codex/skills/*` role guidance.
2. Dispatch page/task work sequentially through Codex skill prompts.
3. Keep verification evidence in generated reports and state files.
4. Print the Playwright MCP entry for you to merge into Codex config.

## Enforcement

Codex floor enforcement is prompt-level for subagent protocol because current
Codex command hooks cover command events, not Task-style subagent lifecycle
events. Repo-local policy scripts and generated instructions still enforce
pathspec commits, destructive-command caution, and verification-before-completion
discipline where the Codex runtime exposes command hooks.
