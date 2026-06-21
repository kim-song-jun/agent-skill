# agent-all-gemini — porting notes

## Why subprocess-based dispatch?

Gemini CLI has no native subagent dispatch primitive. The options
considered:

| Option | Verdict | Reason |
|---|---|---|
| Spawn N parallel headless `gemini -p` subprocesses | **CHOSEN** | Works today; portable; clean isolation |
| `activate_skill` chained sequentially | Rejected | Loses parallelism |
| Custom MCP server emulating dispatch | Rejected | Heavy implementation; brittle |
| Wait for Gemini to add native subagents | Rejected | Indefinite timeline |

Subprocess approach pros:
- Each subprocess gets its own conversation context (isolation).
- Native parallelism via OS process scheduler.
- JSON capture via `--output-format json` per subprocess.
- Easy to kill on timeout.

Subprocess approach cons:
- Higher overhead per task (process startup, JIT, etc.) — ~500ms-2s per spawn.
- Output marshaling via tmp files (fragile; cleanup needed).
- No streaming progress back to coordinator until subprocess exits.
- Gemini CLI does not write result files itself; the wrapper captures stdout
  and writes the per-task JSON file.

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
- 2 days: JSON stdout capture and cost extraction when usage is present.
- 2 days: subprocess-safe state-file writes (race-free atomic rename).
- 2 days: tests (mock subprocesses, race conditions).
- 1 day: tmp-dir GC hook (between iterations and after final exit).
- 1 day: manual checklist + buffer.

This iteration uses Gemini CLI 0.47's live command surface:
`gemini -p "<prompt>" --output-format json --skip-trust`. The older
chat-subcommand, JSON-output, output-file, timeout, and skill-roster flags are
not used.

## Open research questions

1. **Headless output contract.** `--output-format json` returns a JSON
   envelope on stdout. The wrapper writes stdout to the task output file and
   normalizes Gemini CLI error envelopes as failed results.

2. **Persona selection.** Gemini CLI 0.47 exposes `skills` and `extensions`,
   but not a per-process `--skill-roster` flag. Persona selection must be in
   the prompt or extension configuration.

3. **Per-subprocess cost reporting.** Whether Gemini surfaces token counts
   in the JSON payload. Falls back to estimation from transcript
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
| Dispatch | `Task` tool (subagent-driven-development) | `run_shell_command("gemini -p ... --output-format json &")` |
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

## Wiki prose-only port (G11)

The G11 slice ports the `/wiki` knowledge-base surface to Gemini as a **prose-only** embed in the builder-owned host context file (`plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs`), which renders to `GEMINI.md` in the project root.

**What this IS:**
- A `## Project Wiki (prose-only port)` section inlined into the Gemini host context file, placed after `## Operational Soft Rules` (the existing soft-enforcement framing) and before `## Roles`.
- Prose specs for the five command verbs (`write`, `update`, `compile`, `status`, `list`) + bare-query Phase A router, mapped onto the Gemini primitives `replace`/`write_file`/`run_shell_command` already named in Operating Principles.
- The page schema (frontmatter: `title`/`slug`/`grade`/`tags`/`updated`; fixed sections: BLUF, Details, Provenance, Contradictions, Related) inlined verbatim.
- A `### First thing to do each session` digest instruction (prompt-level policy, NOT an automatic hook). Co-located with the existing Operational Soft Rules soft-enforcement framing.
- Karpathy LLM-Wiki (MIT) attribution.

**What this is NOT:**
- No runnable `/wiki` skill, no wiki lib, no SessionStart or PreToolUse hook on Gemini.
- The digest-as-instruction is prompt-level policy; it does not fire automatically.
- No `#27` / live-CLI-unverified flag (Gemini's row in spec §3.4 carries no #27 flag; the surrounding `## Operational Soft Rules` framing already establishes the soft-enforcement / no-hard-hook posture).

**Cross-family note:** The host context file is owned by `harness-builder-gemini` (builder plugin), not `harness-floor-gemini`. There is no host-context file inside the floor plugin (the `gemini-extension.json` is a bare visual-qa scaffold manifest). The prose lands in the builder template; this porting-notes doc (floor-owned) carries the reference and honest-labeling.

**Tests:** `tests/lib/gemini/wiki-prose-surface.test.mjs` — doc-surface contract (presence/contract only, not behavior). Asserts the `## Project Wiki` heading, verb specs, schema keys, digest instruction, prose-only label, and a negative guard ensuring no hook-fires claim is made in the prose.

## Future work

- More schema fixtures from authenticated Gemini CLI runs.
- Tmp-dir GC hook registered in `~/.gemini/settings.json` (`Stop` hook
  cleans up after pipeline exits).
- Cost-tracking integration once usage fields are observed in authenticated
  JSON payloads.
- Streaming progress: dispatch via FIFOs instead of one-shot tmp files
  so coordinator can report per-task progress mid-wave.
- `--dispatch=mcp-server` alternative strategy if Google ships a
  managed-agents MCP server in the future.
