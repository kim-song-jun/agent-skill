# harness-floor-gemini

> **Decision-surfacing enforcement: 🟡 Soft.** Gemini CLI does not expose a
> tool-call hook system today. The decision protocol is prompt-only through
> `.gemini/agent-all-decision-protocol.md`; non-compliant subprocess results are
> surfaced by the coordinator and reviewers rather than blocked by the harness
> layer.

Operational floor support for Gemini CLI. Ships Gemini ports of the canonical
`/agent-all` and `/visual-qa` workflows, with project-local config seeds and a
Playwright MCP snippet for manual merge into Gemini settings.

Emits:

- `.visual-qa.json` at project root
- `.agent-all.json` at project root
- `.gemini/agent-all-decision-protocol.md`
- Playwright MCP snippet printed to stdout for `~/.gemini/settings.json`

## Install

```bash
./scripts/install-platform.sh --platform=gemini --theme=floor --target=/path/to/project
```

The default platform install (`--theme=all`) also runs the Gemini builder and
thrift renderers. The floor-only install writes the workflow configs above and
prints the settings snippet instead of patching global config.

## Usage

Open Gemini CLI in the target repository and ask it to follow the generated
workflow guidance for `/agent-all` or `/visual-qa`.

The Gemini `/agent-all` port runs intent -> plan -> subprocess wave dispatch -> gate ->
PR. The Gemini `/visual-qa` port runs config -> discover -> capture -> aggregate ->
summary. Both ports use `run_shell_command` helpers and output files to manage
parallel subprocess work.

## Settings

Merge the printed `mcpServers` entry into `~/.gemini/settings.json` before
running visual checks. The installer does not write or modify global Gemini
settings files.
