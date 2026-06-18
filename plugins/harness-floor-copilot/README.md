# harness-floor-copilot

> **Decision-surfacing enforcement: 🟡 Prompt-level by default.** The floor
> renderer writes `.github/agent-all/decision-protocol.md` and `.agent-all.json`.
> It does not patch `~/.copilot/hooks.json`; use `bin/install-hooks.mjs` only
> after reviewing the host hook surface for your Copilot CLI version.

Operational floor support for GitHub Copilot CLI. Ships Copilot ports of the
canonical `/agent-all` and `/visual-qa` workflows, with project-local config
seeds and a Playwright MCP snippet for manual merge.

Emits:

- `.visual-qa.json` at project root
- `.agent-all.json` at project root
- `.github/agent-all/decision-protocol.md`
- Playwright MCP snippet printed to stdout for `~/.copilot/mcp-config.json`

## Install

```bash
./scripts/install-platform.sh --platform=copilot --theme=floor --target=/path/to/project
```

The default platform install (`--theme=all`) also runs the Copilot builder and
thrift renderers. The floor-only install keeps changes scoped to the workflow
config files above.

## Usage

Open Copilot CLI or Copilot chat in the target repository and ask it to follow
the generated repo instructions for `/agent-all` or `/visual-qa`.

The Copilot `/agent-all` port runs the intent -> plan -> wave dispatch -> gate -> PR
pipeline. The Copilot `/visual-qa` port runs the config -> discover -> capture ->
aggregate -> summary pipeline and uses the Playwright MCP entry from
`~/.copilot/mcp-config.json`.

## Optional Hook Helper

`bin/install-hooks.mjs` can merge `subagentStop` dispatchers into a Copilot
hooks file when you explicitly provide an inbox path:

```bash
node plugins/harness-floor-copilot/bin/install-hooks.mjs \
  --hooks-file ~/.copilot/hooks.json \
  --label agent-all \
  --inbox /abs/path/to/agent-all-inbox.jsonl
```

This helper is not invoked by `install-platform.sh`; the release-safe wrapper
only writes project-local files and prints global config snippets.
