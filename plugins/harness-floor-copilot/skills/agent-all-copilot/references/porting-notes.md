# agent-all-copilot — porting notes

## Why Copilot's `task` tool fits better than Cursor's description routing

Copilot CLI v0.0.380+ ships a purpose-built `task` tool with:
- Explicit `task({prompt, context})` invocation API.
- Optional lifecycle hooks such as `subagentStop`, whose current payload
  includes `agentName`, `sessionId`, `transcriptPath`, and `stopReason`.

That maps cleanly onto the Claude Code orchestrator's per-task `Task` tool
dispatch for prompt-level fan-out. Unlike the earlier scaffold, this port
does not assume public `read_agent`, `list_agents`, or `store_memory` tools.
Durable state is file-backed.

## Effort estimate vs other ports

Spec estimate: **1 week** (same as Codex; less than Gemini's 1.5w).

| Sub-project | Estimate | Why |
|---|---|---|
| Cursor (3 days) | smallest | prompt template; no dispatch API to implement |
| Copilot (1 week) | medium | `task` tool maps cleanly; file state plus optional hooks |
| Codex (1 week) | medium | `agent` hook requires research spike but well-documented |
| Gemini (1.5 weeks) | largest | no native dispatch primitive; subprocess workaround |

Copilot port's 1-week estimate covers:
- 2 days: research `task` and hook schemas and write Copilot-flavored phase docs.
- 2 days: implement the awaiter (hook vs polling fallback).
- 1 day: cost-tracking integration via task output or estimates.
- 1 day: tests + manual checklist.
- 1 day: buffer.

This iteration ships the file-backed Copilot port contract with optional
hook lifecycle evidence. The hook dispatcher accepts both camelCase and
VS Code compatible `SubagentStop` payloads.

## Known unknowns

1. **Task result shape.** The hook gives lifecycle metadata, not the
   subagent's final answer. The coordinator must parse the `task` result or
   transcript evidence supplied by the host.

2. **`task` tool maxConcurrency.** Unclear whether Copilot caps concurrent
   `task` invocations server-side. If so, the `wave.maxParallel` config
   should clamp to that cap. Research spike needed.

3. **Transcript parsing.** `transcriptPath` is recorded for audit evidence,
   but output extraction must tolerate host-version differences.

4. **Cost-tracking field.** If the task result does not report usage, the
   coordinator best-effort estimates from transcript length.

## Differences from Claude Code orchestrator

| Aspect | Claude Code (`/agent-all`) | Copilot (`/agent-all` port) |
|---|---|---|
| Dispatch | `Task` tool (subagent-driven-development skill) | `task` tool directly |
| Awaiter | Skill awaits per-task | `task` result plus optional `subagentStop` lifecycle log |
| Plan persistence | File only | File only |
| Brainstorm | `superpowers:brainstorming` skill | Chat-driven structured Q&A |
| Plan writer | `superpowers:writing-plans` skill | Coordinator drafts inline |
| Cost cap | Token-counted in Claude infra | Reported usage if exposed; else best-effort |

## Future work

- Task-result parser hardening against new Copilot CLI response shapes.
- `task` tool concurrency probe in Phase 0 preflight.
- Per-platform agent file emission (Copilot doesn't use `.copilot/agents/`
  but does honor `.github/copilot-instructions.md` — consider seeding a
  pipeline-aware instructions section there).
