# agent-all-codex — porting notes

## Current Codex Hook Limitation

current Codex hooks support command handlers for events such as
`PreToolUse`, `PostToolUse`, and `SessionStart`. They do not expose the
older agent-dispatch hook surface that early scaffold notes assumed.

For that reason, `agent-all-codex` now treats sequential dispatch as the
only supported path:

- Phase 0 always selects `dispatch = "sequential"`.
- `--dispatch=sequential` is accepted as an explicit no-op override.
- `--dispatch=agent-hook` aborts with an unsupported-current-hooks error.
- The hook snippet template is documentation-only and emits no TOML hook
  registration.

## Phase Contract Preserved

| Aspect | Claude Code (`/agent-all`) | Codex (`/agent-all` port) |
|---|---|---|
| Dispatch | `Task` tool (subagent-driven-development) | sequential `.codex/skills/<role>/SKILL.md` |
| State persistence | `.agent-all-state.json` + `apply_patch` | Same |
| Brainstorm | `superpowers:brainstorming` | `ask_user`-driven structured Q&A |
| Plan writer | `superpowers:writing-plans` | Coordinator drafts inline |
| Cost cap | Token-counted | best-effort estimation from task output |

## Future Work

- Revisit parallel dispatch only if Codex exposes an official command
  surface for spawning and awaiting subagents.
- Keep the sequential path as the stable baseline even if a future
  parallel strategy is added.
