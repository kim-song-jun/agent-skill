# Phase 3 — Summariser

Per CC compact API spike (`docs/superpowers/research-notes/2026-05-18-cc-compact-api-spike.md`),
v1 ships in **advisory mode**: the summariser writes a compressed
summary to a file and emits a Notification asking the user to run
`/compact` then paste the summary path.

## Triggers

1. **Auto-trigger**: PostToolUse hook (`thrift-posttool-summariser-trigger.mjs`)
   fires `shouldFireSummariser` after each tool call. When threshold
   hit, the hook writes a notification stub and surfaces a system
   reminder. The user (or the next coordinator turn) then invokes
   `/thrift summarise` to actually generate the summary.
2. **Manual trigger**: `/thrift summarise` from a chat command.

## Steps (when actually generating)

1. Load `.thrift.json` config.
2. Read `.thrift-state.json`.
3. Read conversation history. **Sandbox limitation:** there is no
   official CC API to query conversation turns from a plugin. v1 reads
   from a user-supplied `--history <path>` flag pointing to a markdown
   or JSON dump (user pastes their `/transcript` output). When CC ships
   a programmatic transcript API, this becomes automatic.
4. Call `summarise({turns, preserveLastTurns, preserveSpecPaths, summariseFn})`
   from `lib/summariser.mjs`.
5. For `summariseFn`:
   - **v1 default**: `heuristicSummariseFn()` — extracts first sentence
     per turn. Dependency-free, no model call.
   - **v1 advanced (opt-in)**: `--use-haiku` flag — calls
     `claude-haiku-4-5-20251001` via Anthropic SDK if available in
     `node_modules`. Skip if SDK missing.
6. Write the summary to `.thrift/summaries/<YYYY-MM-DD>-turn<N>.md`.
7. `recordSummariser(state, {reason, tokensBefore, tokensAfter})` →
   updates `.thrift-state.json`.
8. Print to user:
   ```
   Summariser wrote: .thrift/summaries/<date>-turn<N>.md
   Run /compact then paste this path into the next message.
   Saved tokens: ~<N> (estimated <%> reduction).
   ```

## On error

- Conversation history missing: print instructions for `/transcript`,
  do nothing.
- summariser produces empty body (turns ≤ preserveLastTurns):
  print "no summarisation needed at this size" and exit.
- Anthropic SDK missing AND `--use-haiku` passed: warn + fall back to
  heuristicSummariseFn.

## Future (v2)

When CC ships a programmatic compact API:
1. Replace step 3 with native transcript query.
2. Replace step 8 with a programmatic compact call that injects the
   summary as a system message and drops the compressed turns.
3. No user intervention required.
