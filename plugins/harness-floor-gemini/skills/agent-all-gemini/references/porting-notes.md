# agent-all-gemini — porting notes

## Why subprocess-based dispatch?

Gemini CLI has no native subagent dispatch primitive. The options
considered:

| Option | Verdict | Reason |
|---|---|---|
| Spawn N parallel `gemini chat` subprocesses | **CHOSEN** | Works today; portable; clean isolation |
| `activate_skill` chained sequentially | Rejected | Loses parallelism |
| Custom MCP server emulating dispatch | Rejected | Heavy implementation; brittle |
| Wait for Gemini to add native subagents | Rejected | Indefinite timeline |

Subprocess approach pros:
- Each subprocess gets its own conversation context (isolation).
- Native parallelism via OS process scheduler.
- Cost-tracking via `--output-json` per subprocess.
- Easy to kill on timeout.

Subprocess approach cons:
- Higher overhead per task (process startup, JIT, etc.) — ~500ms-2s per spawn.
- Output marshaling via tmp files (fragile; cleanup needed).
- No streaming progress back to coordinator until subprocess exits.
- `--output-json` flag is assumed; if not supported by current Gemini
  CLI, requires stdout parsing fallback.

## Effort estimate vs other ports

Spec estimate: **1.5 weeks** (largest of the four).

| Sub-project | Estimate | Why |
|---|---|---|
| Cursor (3 days) | smallest | prompt template; no dispatch API |
| Copilot (1 week) | medium | `task` tool maps cleanly |
| Codex (1 week) | medium | `agent` hook + sequential fallback |
| **Gemini (1.5 weeks)** | **largest** | subprocess machinery built from scratch |

Gemini port's 1.5-week estimate covers:
- 3 days: subprocess dispatch + awaiter implementation (`run_shell_command`,
  tmp file IPC, kill-on-timeout).
- 2 days: cost-tracking via `--output-json` parsing.
- 2 days: subprocess-safe state-file writes (race-free atomic rename).
- 2 days: tests (mock subprocesses, race conditions).
- 1 day: tmp-dir GC hook (between iterations and after final exit).
- 1 day: manual checklist + buffer.

This iteration ships **scaffold-only** — phases, templates, porting notes.
Subprocess machinery implementation deferred.

## Open research questions

1. **`gemini chat --output-json` flag.** Does it exist in the current
   Gemini CLI build? If not, fall back to parsing stdout with a sentinel
   marker (`---JSON-RESULT---\n{...}\n---END---`).

2. **`gemini chat -p '<prompt>' --skill-roster <dir>` syntax.** The phase
   docs assume this flag. May need to be `--skills-dir` or `--rule-dir`
   in current builds.

3. **Per-subprocess cost reporting.** Whether Gemini surfaces token counts
   in `--output-json` payload. Falls back to estimation from transcript
   length × model's published per-token rate.

4. **Concurrent subprocess limits.** Some Gemini API plans rate-limit
   concurrent requests. The `maxSubprocesses` config defaults to 8 as a
   safe ceiling but should be confirmed against the user's plan.

5. **Tmp file IPC race conditions.** If two subprocesses both write to
   `/tmp/agent-all/` concurrently, the coordinator needs to know they
   don't collide. The phase docs use per-wave + per-task subdirectories
   (`/tmp/agent-all/wave-<i>/task-<id>.json`) — that should suffice but
   needs stress-test validation.

## Differences from Claude Code orchestrator

| Aspect | Claude Code (`/agent-all`) | Gemini (`/agent-all` port) |
|---|---|---|
| Dispatch | `Task` tool (subagent-driven-development) | `run_shell_command("gemini chat ... &")` |
| Awaiter | Skill awaits per-task | `wait <pid>` OR polling tmp dir |
| Plan persistence | File via Write tool | File via `write_file` |
| State | `.agent-all-state.json` (atomic) | Same; atomic via `mv` after `write_file` |
| Brainstorm | `superpowers:brainstorming` | `ask_user`-driven Q&A |
| Plan writer | `superpowers:writing-plans` | Coordinator drafts inline |
| Cost cap | Token-counted in Claude infra | Per-subprocess JSON parse (best-effort) |
| Loop continue | In-process re-enter Phase 1 | Same OR spawn self as background subprocess |

## Why is this the heaviest port?

Three reasons:

1. **No native subagent.** Cursor, Copilot, Codex all have *some* form of
   subagent primitive — even Cursor's implicit description-matching counts.
   Gemini has nothing equivalent, so the dispatch + awaiter machinery is
   built from scratch.

2. **IPC complexity.** Subprocess output marshaling via tmp files
   introduces race conditions, cleanup concerns, and partial-failure
   semantics (subprocess crashed mid-write → corrupt JSON) that the other
   ports don't face.

3. **Cost tracking gap.** The other ports can read per-agent cost from
   their respective APIs. Gemini requires either an unconfirmed flag or
   an estimation heuristic.

## Future work

- Subprocess dispatch lib (`bin/spawn-wave.mjs`) once `--output-json` /
  `--skill-roster` flags confirmed.
- Tmp-dir GC hook registered in `~/.gemini/settings.json` (`Stop` hook
  cleans up after pipeline exits).
- Cost-tracking integration once `--output-json` payload schema confirmed.
- Streaming progress: dispatch via FIFOs instead of one-shot tmp files
  so coordinator can report per-task progress mid-wave.
- `--dispatch=mcp-server` alternative strategy if Google ships a
  managed-agents MCP server in the future.
