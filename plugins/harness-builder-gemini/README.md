# harness-builder-gemini

Operational builder scaffold for Gemini CLI. The renderer writes the Gemini
root guidance and role skills into the target project, then prints the settings
snippet for manual merge.

Emits:

- `GEMINI.md`
- `.gemini/skills/planner/SKILL.md`
- `.gemini/skills/dev/SKILL.md`
- `.gemini/skills/reviewer/SKILL.md`
- MCP snippet printed to stdout for `~/.gemini/settings.json`

## Install

```bash
./scripts/install-platform.sh --platform=gemini --theme=builder --target=/path/to/project
```

Use the default platform install (`--theme=all`) when you also want floor and
thrift artifacts.

## Usage

Open Gemini CLI in the target repository. Gemini loads `GEMINI.md` plus the
generated `.gemini/skills/` role guidance, so you can ask it to plan, implement,
or review work using the installed personas.

`install-platform.sh` writes project-local files only. Merge the printed
`mcpServers` snippet into `~/.gemini/settings.json` after review.
