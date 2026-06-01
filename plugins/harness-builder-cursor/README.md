# harness-builder-cursor

Operational builder scaffold for Cursor. The renderer writes an always-loaded
Cursor rule plus planner, developer, and reviewer agents into the target
project.

Emits:

- `.cursor/rules/agent-init.mdc`
- `.cursor/agents/planner.md`
- `.cursor/agents/dev.md`
- `.cursor/agents/reviewer.md`

## Install

```bash
./scripts/install-platform.sh --platform=cursor --theme=builder --target=/path/to/project
```

Use the default platform install (`--theme=all`) when you also want floor and
thrift artifacts.

## Usage

Open Cursor chat in the target repository. The `agent-init` rule is always
applied in that workspace, and the generated `.cursor/agents/*.md` files give
Cursor the planner, developer, and reviewer personas.

Re-run with `--force` when you intentionally want to refresh generated Cursor
rules or agents.
