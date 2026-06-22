# agent-all-cursor — porting notes

## Why a prompt template instead of a programmatic orchestrator?

The Claude Code `/agent-all` skill is a `.mjs` orchestrator that drives
`superpowers:subagent-driven-development` to dispatch fresh `Task` tool
invocations per wave task. That works on Claude Code because:

1. `Task` is a first-class tool with a precise schema (description, prompt,
   subagent_type).
2. Subagents inherit project context but get isolated conversation state.
3. The parent agent can `await` all dispatched tasks before the next wave.

Cursor's subagent dispatch is **implicit and chat-routed**. A parent agent
invokes a child by matching the child's `description` frontmatter — there
is no `dispatch()` API. Cursor's planner does the routing. So the only way
to express "fan out N tasks in parallel" is:

- Define `.cursor/agents/<role>.md` with `is_background: true`.
- Have the parent emit N invocations like `@<role> with body X`.
- Cursor runs them concurrently (the user sees N parallel chats).
- Parent awaits via … nothing automatic. It waits for the user to confirm
  the background agents finished, OR polls subagent transcripts via
  Cursor's file system (each background agent writes its transcript to a
  workspace temp dir).

That's structurally a **prompt template**, not a runner. The user (or the
coordinator agent on their behalf) reads each phase file and acts on it.

## Effort estimate vs Claude Code port

Spec estimate: **3 days**. Claude Code orchestrator estimate: irrelevant
because it predates this port — original `agent-all` is ~2 weeks of work
for the runner + tests + lib modules.

Cursor port is faster because:
- No `.mjs` lib modules to write (`config-loader`, `wave-builder`,
  `loop-evaluator` — all collapse into "the coordinator reads the JSON").
- No `Task` tool schema to match — Cursor routes by description string.
- No state machine for in-process loop re-entry — Cursor can't auto-re-invoke.

Cursor port is slower in one dimension:
- The behavioral contract (state file shape, phase ordering, error codes)
  must be exactly preserved across all four platforms so users get the
  same UX. Documenting that contract in markdown takes longer than
  writing it in `.mjs`.

## Known limitations

1. **No auto-loop continue.** Cursor cannot re-invoke `@agent-all-coordinator`
   from within a finished chat. The coordinator emits "Iter N+1 ready,
   send continue" and waits. Long loops require user babysitting.

2. **Cost tracking is best-effort.** Cursor doesn't surface per-turn cost
   in the chat. The coordinator records only what the user pastes back
   (or scrapes from Cursor's usage panel manually).

3. **Reviewer mode dispatched via prompt body.** Cursor's description-match
   routing is coarse — one `agent-all-reviewer.md` handles both spec and
   quality review, distinguished by `mode=...` in the first line of the
   chat body. Two separate subagent files would compete for description
   matches and confuse the planner.

4. **Lockfile races.** Parallel `is_background` implementers may race on
   `package-lock.json` / `yarn.lock`. The implementer template handles
   this by failing fast with `STATUS: blocked, REASON: lock conflict` —
   coordinator retries sequentially.

5. **Subagent transcript polling.** No standard API in Cursor for the
   parent to await background subagents. The coordinator currently relies
   on the user to confirm each wave settled before proceeding. A future
   `cursor-cli` GA may add a transcript-listener primitive.

## Differences from sibling ports

| Aspect | Cursor | Copilot | Codex | Gemini |
|---|---|---|---|---|
| Parallel primitive | `is_background: true` | `task` tool | `agent` hook | `run_shell_command` subprocess |
| Plan-writer | coordinator drafts inline | `store_memory` | `apply_patch` | `write_file` |
| Loop re-entry | manual chat re-invoke | `task` chain | hook re-fire | subprocess loop |
| State file | Cursor edit surface | `store_memory` JSON | `.agent-all-state.json` | `.agent-all-state.json` |

## Future work

- `bin/init.mjs` (renderer) to install the kit into a target project
  automatically — mirrors `harness-builder-cursor/bin/init.mjs`.
- `cursor-cli` integration for auto-loop continuation when GA.
- Subagent transcript-listener bridge for non-interactive Phase 3/4
  fan-out completion.
- Spec-reviewer vs quality-reviewer split if Cursor adds finer-grained
  subagent routing.

**agent-all↔wiki auto-loop (v0.7.4) — NOT on this port.** The auto-loop (agent-all
auto-reading `.wiki/` at Phase 1 and auto-writing it at Phase 2/5 via `wiki-log.mjs`)
runs only on Claude Code + Codex. Cursor ships no `wiki-log.mjs` and its agent-all
phase docs carry no wiki step — honest prose-only.
