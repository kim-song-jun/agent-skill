# agent-all porting — decomposition spec

**Date:** 2026-05-18
**Status:** Decomposition only — no implementation in this iteration
**Purpose:** Document why agent-all cannot ride the same scaffolding shortcut visual-qa took, and break the work into per-platform sub-projects with clear scope per platform.

## Why agent-all is harder than visual-qa to port

`agent-all` is fundamentally a meta-skill: it orchestrates *other* skills via subagent dispatch, wave-by-wave, with a break-condition loop. Its Claude Code implementation rides on:

1. **`superpowers:writing-plans`** — synthesizes per-wave plans on the fly.
2. **`superpowers:subagent-driven-development`** — dispatches one fresh implementer subagent per task, with two-stage review.
3. **`Task` / `Skill` tools** — Claude Code's native primitives for spawning subagents that share project context but isolate conversation state.
4. **Break-condition shell loops** — re-evaluates a user-supplied shell command after each wave to decide whether to continue.

visual-qa, by contrast, is a single linear 6-phase pipeline with one parallel fan-out step (Phase 3). Its scaffolding port worked because the *config* (`.visual-qa.json`) is platform-agnostic and the *runner* can be stubbed with a "not yet implemented" Phase 3.

agent-all has no equivalent config artifact to scaffold. Its only deliverable IS the orchestrator. There's nothing to scaffold without writing the orchestrator itself.

## Per-platform implementation requirements

### Codex CLI

**Subagent dispatch primitive**: Codex's hook handler types include `agent` (per [`codex-rs/config/src/hook_config.rs`](https://github.com/openai/codex/blob/main/codex-rs/config/src/hook_config.rs)). Unconfirmed whether `agent` is a *configurable invoke* (i.e., user code can call `agent` programmatically with a sub-prompt) or strictly a hook-event-side handler. **Research spike needed**: read the Codex source for `HookHandler::Agent` and confirm the contract.

**If agent-handler is invokable from user code**: each wave's tasks can be dispatched as `agent` calls in parallel, with the wave coordinator waiting for completion (Codex's exec/PTY model supports this via `exec_command` returning session IDs).

**If not invokable**: fall back to `shell_command` + recursive Codex invocations (`codex run --prompt …`), which is uglier and loses context-isolation guarantees.

**Plan-writing primitive**: Codex has the `/plan` slash-command (TUI-only) and a notion of plan artifacts. Need to verify whether `/plan` writes to a known location that user code can read.

**Estimated work**: ~1 week per platform after research spike completes. Comparable to building agent-all from scratch.

### GitHub Copilot CLI

**Subagent dispatch primitive**: Copilot has `task`, `read_agent`, `list_agents` tools (per [v0.0.380+ changelog](https://github.com/github/copilot-cli/blob/main/changelog.md)). The `task` tool likely fits — research spike to read its parameter schema via `tools.list` RPC (added v1.0.31).

**Plan-writing primitive**: Copilot has `store_memory` for durable scratch. Plans can be written as memory entries scoped to `repository`.

**Wave dispatch contract**: each wave's tasks become parallel `task` invocations; coordinator awaits via `subagentStop` hook or polls memory.

**Estimated work**: ~1 week. Possibly less than Codex because the `task` tool is purpose-built.

### Gemini CLI

**Subagent dispatch primitive**: Gemini's official subagent story is less clear. `activate_skill` loads a skill into the current context, not into a child agent. The newer `gemini-cli` documentation references "background agents" but the implementation maturity (as of 2026-05) is unclear.

**Workaround**: spawn `gemini` subprocesses via `run_shell_command`, passing each wave's task as `--prompt`. Loses context-sharing optimizations but works. Each subprocess is a full Gemini instance.

**Plan-writing primitive**: write to project-local `.gemini/plans/` (per `gemini-extension.json`'s `plan.directory` field).

**Estimated work**: ~1.5 weeks because the subagent story is the murkiest.

### Cursor

**Subagent dispatch primitive**: native (`.cursor/agents/<role>.md` with `is_background: true` for parallel). Cursor delegates automatically based on the parent agent's description matching against `description` frontmatter in each subagent file. No manual `dispatch()` call.

**Plan-writing primitive**: write `.cursor/rules/agent-all-plan.mdc` or use `.cursor/agents/<plan>.md` as a transient plan file.

**Wave dispatch contract**: parent agent invokes multiple subagents implicitly via Cursor's chat mechanism. The wave coordinator becomes a *prompt* that says "for each task, hand off to <subagent-name>" — Cursor's planner does the routing.

**Estimated work**: ~3 days because Cursor does the heavy lifting. But the result is a *prompt template*, not a programmatic orchestrator — different shape from the other three.

## Common shared prerequisites

Before porting agent-all to any platform, these need to land:

1. **Per-platform brainstorm integration** — agent-all's first phase reuses `superpowers:brainstorming` to elicit the task. Each platform needs an equivalent brainstorm primitive or a fallback prompt. Tracked separately.
2. **Per-platform plan writer** — agent-all generates a per-wave mini-plan. The plan format is markdown with checkboxes — portable in principle but the writer must be platform-aware to use the right edit tool.
3. **Break-condition shell evaluation** — runs `bash -c <user_cmd>` after each wave. Each platform exposes shell differently (`shell_command` vs `read_bash` vs `run_shell_command`).

## Decomposition into per-platform sub-projects

| Sub-project | Scope | Prereqs | Est. effort |
|---|---|---|---|
| `agent-all-codex` | Research spike on `agent` hook → spec → plan → orchestrator port. New plugin `harness-floor-codex/skills/agent-all-codex` | brainstorm primitive; plan writer | 1 week |
| `agent-all-copilot` | Research `task` tool schema → spec → plan → port using `task` for parallel dispatch | brainstorm primitive; plan writer | 1 week |
| `agent-all-gemini` | Subprocess-based dispatch design → spec → plan → port using `run_shell_command` | brainstorm primitive; plan writer; investigation of native subagents | 1.5 weeks |
| `agent-all-cursor` | Prompt-template approach using native subagent delegation → spec → docs (no orchestrator code) | brainstorm primitive | 3 days |

Each sub-project gets its own brainstorm → spec → plan → implementation cycle. **Do not attempt all four in one session.**

## What this iteration does NOT deliver

- No `agent-all-<platform>` plugins.
- No working orchestrator on any platform other than Claude Code.
- No research spikes against actual Codex/Copilot/Gemini CLI behavior — those happen in their own sub-project sessions.

## Recommended next session(s)

Order of attack (highest value first):

1. **Cursor** — least effort, biggest visible win (Cursor users get agent-all docs immediately).
2. **Copilot** — `task` tool is purpose-built; should be cleanest of the programmatic three.
3. **Codex** — needs research spike but has clean primitive if `agent` hook is invokable.
4. **Gemini** — postpone until Gemini's subagent story matures or accept subprocess-based MVP.
