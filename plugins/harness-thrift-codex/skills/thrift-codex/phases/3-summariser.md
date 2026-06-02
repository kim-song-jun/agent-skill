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
3. Read conversation history. **Host API boundary**: Codex does not
   expose an official plugin transcript API in the current release
   surface. The summariser reads from a user-supplied `--history <path>`
   flag (markdown or JSON dump from `codex export` if that command
   exists; otherwise the user pastes a transcript).
4. Call `summarise({turns, preserveLastTurns, preserveSpecPaths,
   summariseFn})` (vendored from CC `lib/summariser.mjs` if needed; this
   plugin uses the heuristic-only path by default and does NOT depend
   on cross-plugin imports).
5. For `summariseFn`:
   - **Release default**: `heuristicSummariseFn()` — extracts first
     sentence per turn. This is the dependency-free, no model call path,
     so release installs do not require an OpenAI SDK peer dependency.
   - **Model-backed extension point**: local automation may provide a
     model-backed `summariseFn` and use `config.summariser.model` (for
     example `gpt-5-nano`) as its deployment model setting. The packaged
     Codex release remains valid without that optional integration.
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
- Model-backed `summariseFn` unavailable: warn + fall back to
  `heuristicSummariseFn`.

## API-gated extension path

If Codex exposes a stable programmatic transcript / compact API:
1. Replace step 3 with native transcript query.
2. Replace step 8 with a programmatic compact call that injects the
   summary as a system message and drops the compressed turns.
3. Drop the stderr / notification-file delivery (no longer needed).

## Summariser model release contract

`gpt-5-nano` is the packaged deployment default. Teams can override
`.thrift.json` `summariser.model` when their Codex model roster differs.
Re-evaluate this default during the quarterly rate-table refresh
alongside `lib/cost-estimator.mjs`.
