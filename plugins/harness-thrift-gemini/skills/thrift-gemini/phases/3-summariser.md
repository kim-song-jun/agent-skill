# Phase 3 — Summariser (Gemini)

Per the per-platform decomposition spec, v1 ships in **advisory mode**: the
summariser writes a compressed summary to a file and suggests `/compress`
(Gemini's compact equivalent) rather than calling a programmatic compact API.

## Triggers

1. **Auto-trigger**: AfterTool hook (`thrift-aftertool-summariser-trigger.mjs`)
   fires `shouldFireSummariser` after each tool call. When threshold hit,
   the hook writes a notification stub to `.thrift/notifications/summarise.md`
   and surfaces a system reminder via stderr. The user (or the next
   coordinator turn) then invokes `/thrift-gemini summarise` to actually
   generate the summary.
2. **Manual trigger**: `/thrift-gemini summarise` from a chat command.

## Steps (when actually generating)

1. Load `.thrift.json` config.
2. Read `.thrift-state.json`.
3. Read conversation history. **Sandbox limitation:** Gemini CLI has no
   stable transcript-export API as of 2026-05. v1 reads from a
   user-supplied `--history <path>` flag pointing to a markdown dump (user
   exports their session via Gemini's interactive `/save` if available, or
   pastes manually). When Gemini ships a programmatic transcript API, this
   becomes automatic.
4. Heuristic summariser: extract first sentence per turn. Dependency-free,
   no model call. (v2 will integrate the `gemini-flash` SDK once a stable
   Node SDK ships.)
5. Write the summary to `.thrift/summaries/<YYYY-MM-DD>-turn<N>.md`.
6. Update `.thrift-state.json` with `{reason, tokensBefore, tokensAfter}`.
7. Print to user:
   ```
   Summariser wrote: .thrift/summaries/<date>-turn<N>.md
   Run /compress then paste this path into the next message.
   Saved tokens: ~<N> (estimated <%> reduction).
   ```

## Why `gemini-flash` (not haiku)

- Anthropic's Haiku has no Gemini equivalent priced equivalently.
  `gemini-flash` (per Vertex pricing as of 2026-05) is the cheapest
  Gemini family model — appropriate for summariser/compaction workloads.
- Free tier supports `gemini-flash` with rate limits; paid tier removes
  most caps. Phase 3 falls back to the heuristic summariser when the SDK
  call fails for any reason (rate limit, network, missing creds).
- **TODO verify against current Google Vertex pricing** — the price
  ratios drift; check Google's pricing page when updating the rate table
  in `lib/cost-estimator.mjs`.

## On error

- Conversation history missing: print instructions for manual paste, do
  nothing.
- Summariser produces empty body (turns ≤ preserveLastTurns): print
  "no summarisation needed at this size" and exit.
- Gemini SDK call fails (future v2): warn + fall back to heuristic.

## Future (v2)

When Gemini ships a programmatic compact API:
1. Replace step 3 with native transcript query.
2. Replace step 7 with a programmatic `/compress` call that injects the
   summary as a system message and drops the compressed turns.
3. No user intervention required.
