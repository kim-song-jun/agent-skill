# harness-floor-cursor

> **Decision-surfacing enforcement: 🟡 Soft.** Cursor does not expose a
> tool-call hook system today. The decision protocol is prompt-only through
> `.cursor/rules/decision-protocol.mdc`, so non-compliant subagents are surfaced
> by the coordinator and reviewers rather than blocked by the harness layer.

Operational floor support for Cursor. This port installs a prompt-template kit:
Cursor's coordinator agent reads the phase files sequentially, then delegates
wave work to background implementer/reviewer/page agents.

Emits:

- `.visual-qa.json` at project root
- `.agent-all.json` at project root
- `.cursor/rules/agent-all.mdc`
- `.cursor/rules/decision-protocol.mdc`
- `.cursor/agents/visual-qa-page.md`
- `.cursor/agents/agent-all-coordinator.md`
- `.cursor/agents/agent-all-implementer.md`
- `.cursor/agents/agent-all-reviewer.md`
- `.cursor/visual-qa/lib/` runtime helpers
- `.cursor/agent-all/lib/` runtime helpers
- Playwright MCP snippet printed to stdout for `.cursor/mcp.json`

## Install

```bash
./scripts/install-platform.sh --platform=cursor --theme=floor --target=/path/to/project
```

The default platform install (`--theme=all`) also installs Cursor builder and
thrift artifacts. Use `--force` when intentionally refreshing existing config
files such as `.visual-qa.json` or `.agent-all.json`.

## Usage

Open Cursor chat in the target repository and invoke the coordinator:

```text
@agent-all-coordinator run /agent-all for "add user signup form"
@agent-all-coordinator run /agent-all using .agent-skill/tasks/12-fix-login.md --loop --max-iter=5
```

For visual checks, ask Cursor to follow `/visual-qa`; the installed
`visual-qa-page` background agent handles page-level capture and analysis.

## Runtime Shape

The Cursor `/agent-all` port runs intent -> plan -> background implementer dispatch ->
review gate -> PR summary. The Cursor `/visual-qa` port runs config -> discover ->
capture -> aggregate -> summary. Cursor handles parallelism by matching
`.cursor/agents/*.md` descriptions and using `is_background: true`; the
installed libs handle config loading, state, report rendering, and result
collection.
