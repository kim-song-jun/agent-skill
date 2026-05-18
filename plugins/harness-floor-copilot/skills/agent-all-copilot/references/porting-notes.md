# agent-all-copilot — porting notes

## Why Copilot's `task` tool fits better than Cursor's description routing

Copilot CLI v0.0.380+ ships a purpose-built `task` tool with:
- Explicit `task({prompt, context})` invocation API.
- Returned `agentId` for tracking.
- `read_agent(agentId)` for status/output retrieval.
- `list_agents()` for fleet view.
- Optional `subagentStop` hook for push notifications.

That maps cleanly onto the Claude Code orchestrator's per-task `Task` tool
dispatch. The Copilot port is mostly a primitive-substitution exercise
rather than a structural redesign.

## Effort estimate vs other ports

Spec estimate: **1 week** (same as Codex; less than Gemini's 1.5w).

| Sub-project | Estimate | Why |
|---|---|---|
| Cursor (3 days) | smallest | prompt template; no dispatch API to implement |
| Copilot (1 week) | medium | `task` tool maps cleanly; `store_memory` for state |
| Codex (1 week) | medium | `agent` hook requires research spike but well-documented |
| Gemini (1.5 weeks) | largest | no native dispatch primitive; subprocess workaround |

Copilot port's 1-week estimate covers:
- 2 days: research `task`/`read_agent`/`list_agents` schema and write
  Copilot-flavored phase docs.
- 2 days: implement the awaiter (hook vs polling fallback).
- 1 day: cost-tracking integration via `read_agent`'s output.
- 1 day: tests + manual checklist.
- 1 day: buffer.

This iteration ships the **scaffold-only** port — phases, templates, and
porting notes. Implementation of the awaiter and cost-tracking is the
follow-up after a research spike against a live Copilot CLI.

## Known unknowns

1. **`subagentStop` hook payload shape.** Per the v0.0.380 changelog, the
   hook fires on subagent completion. Need to read the exact payload
   schema (agentId, status, output? cost?) via Copilot's `tools.list` RPC
   (added v1.0.31). The phase docs assume `{agentId, status, output, costUSD}`.

2. **`task` tool maxConcurrency.** Unclear whether Copilot caps concurrent
   `task` invocations server-side. If so, the `wave.maxParallel` config
   should clamp to that cap. Research spike needed.

3. **`store_memory` scope behavior.** Spec says `scope=repository` persists
   per-repo but doesn't specify TTL or GC policy. The phases assume
   memory is durable for the duration of a single agent-all run; cross-run
   resume falls back to `.agent-all-state.json`.

4. **Cost-tracking field.** `read_agent` may or may not return a `costUSD`
   field. If not, the coordinator best-effort estimates by counting tokens
   in the agent's transcript and multiplying by the model's published rate.

## Differences from Claude Code orchestrator

| Aspect | Claude Code (`/agent-all`) | Copilot (`agent-all-copilot`) |
|---|---|---|
| Dispatch | `Task` tool (subagent-driven-development skill) | `task` tool directly |
| Awaiter | Skill awaits per-task | `subagentStop` hook OR `list_agents` polling |
| Plan persistence | File only | File + `store_memory` for fast subagent reads |
| Brainstorm | `superpowers:brainstorming` skill | Chat-driven structured Q&A |
| Plan writer | `superpowers:writing-plans` skill | Coordinator drafts inline |
| Cost cap | Token-counted in Claude infra | `read_agent` if exposed; else best-effort |

## Future work

- Awaiter implementation (`.mjs` lib) once `subagentStop` payload is confirmed.
- `task` tool concurrency probe in Phase 0 preflight.
- `store_memory` GC handler — if a key disappears mid-run, fall back to file.
- Per-platform agent file emission (Copilot doesn't use `.copilot/agents/`
  but does honor `.github/copilot-instructions.md` — consider seeding a
  pipeline-aware instructions section there).
