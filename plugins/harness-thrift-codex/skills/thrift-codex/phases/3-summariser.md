# Phase 3 — Summariser

Per the porting decomposition spec, Codex has **no `Notification` hook**
equivalent to Claude Code's. The v1 summariser delivery on Codex is via
two surfaces:

1. **stderr from the `post_tool_use` hook** — Codex surfaces hook
   stderr to the TUI as a system reminder line.
2. **A file under `~/.codex/notifications/thrift-<ts>.md`** — durable
   record the user can `cat` later.

The summariser writes a compressed summary file and emits a stderr line
telling the user to run `/compact` (which exists in the Codex TUI) and
paste the summary path.

## Triggers

1. **Auto-trigger**: `post_tool_use` hook
   (`thrift-posttool-summariser-trigger.mjs`) fires `shouldFireSummariser`
   after each tool call. When threshold hit, the hook writes a
   notification file and emits a stderr system reminder.
2. **Manual trigger**: `run /thrift summarise` from the Codex chat.

## Steps (when actually generating)

1. Load `.thrift.json` config.
2. Read `.thrift-state.json`.
3. Read conversation history. **Sandbox limitation**: Codex has no
   official transcript API exposed to plugins in v1. The summariser
   reads from a user-supplied `--history <path>` flag (markdown or
   JSON dump from `codex export` if that command exists; otherwise the
   user pastes a transcript). When Codex ships a programmatic
   transcript API, this becomes automatic.
4. Call `summarise({turns, preserveLastTurns, preserveSpecPaths,
   summariseFn})` (vendored from CC `lib/summariser.mjs` if needed; this
   plugin uses the heuristic-only path by default and does NOT depend
   on cross-plugin imports).
5. For `summariseFn`:
   - **v1 default**: `heuristicSummariseFn()` — extracts first sentence
     per turn. Dependency-free, no model call.
   - **v1 advanced (opt-in)**: `--use-cheap-model` flag — calls
     `config.summariser.model` (e.g. `gpt-5-nano`) via the OpenAI SDK
     if available in `node_modules`. Skip if SDK missing.
6. Write the summary to `.thrift/summaries/<YYYY-MM-DD>-turn<N>.md`
   via `apply_patch`.
7. Append `{at, reason, tokensBefore, tokensAfter}` to
   `state.summarisers[]` and write back to `.thrift-state.json`.
8. Emit on stderr:
   ```
   <system-reminder>thrift-codex summariser wrote: .thrift/summaries/<file>.md.
   Run /compact then paste this path into the next message.</system-reminder>
   ```
9. Also write the notification file:
   ```
   ~/.codex/notifications/thrift-<ts>.md
   ```
   Contents: same as the stderr line, but durable.

## On error

- Conversation history missing → print instructions for `codex export`
  (or the equivalent), do nothing.
- Summariser produces empty body (turns ≤ preserveLastTurns):
  print `no summarisation needed at this size` and exit.
- OpenAI SDK missing AND `--use-cheap-model` passed: warn + fall back
  to `heuristicSummariseFn`.

## Future (v2)

When Codex ships a programmatic transcript / compact API:
1. Replace step 3 with native transcript query.
2. Replace step 8 with a programmatic compact call that injects the
   summary as a system message and drops the compressed turns.
3. Drop the stderr / notification-file delivery (no longer needed).

## Summariser model TBD

Codex's cheap-summariser slot has no clear winner as of 2026-05.
Candidates (verify against `codex models list`):

- `gpt-5-nano` (placeholder default)
- `o4-mini`
- `gpt-4o-mini`

The exact slot will be re-evaluated each quarterly rate-table refresh.
