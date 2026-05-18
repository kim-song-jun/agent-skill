# Phase 3 — Summariser (Copilot)

Copilot has no documented `/compact` equivalent. The summariser v1 ships
in **advisory mode** with a Copilot-specific delivery channel: the
summary is written to a file AND mirrored into `store_memory` so it
survives across sessions, and a stderr `<system-reminder>` advises the
user to start a fresh session (`gh copilot reset` or equivalent) with
the summary path attached.

## Triggers

1. **Auto-trigger**: `postToolUse` hook
   (`thrift-posttool-summariser-trigger.mjs`) fires
   `shouldFireSummariser` after each tool call. When threshold hit,
   the hook writes a notification stub, mirrors a "pending summary"
   marker into `store_memory`, and emits a stderr `<system-reminder>`.
   The user (or the next coordinator turn) invokes
   `/thrift-copilot summarise` to actually generate the summary.

2. **Manual trigger**: `/thrift-copilot summarise` from a chat command.

## Steps (when actually generating)

1. Load `.thrift.json` config.
2. Read `.thrift-state.json` (file) AND/OR `store_memory(key:
   "thrift/state")` (memory mirror). If file is missing but memory
   exists: reconstruct state from memory.
3. Read conversation history. **Sandbox limitation:** Copilot has no
   documented programmatic transcript API. v1 reads from a
   user-supplied `--history <path>` flag (markdown or JSON dump from
   the Copilot CLI's transcript export). When/if Copilot ships a
   programmatic transcript API, this becomes automatic.

   > **TODO: verify Copilot transcript export mechanism.**

4. Call `summariseFn({turns, preserveLastTurns, preserveSpecPaths})`.
   - **v1 default**: heuristic summariser — extracts first sentence
     per turn. Dependency-free, no model call. Same algorithm as the
     CC port.
   - **v1 advanced (opt-in)**: `--use-model` flag — calls the
     configured `summariser.model` (default `gpt-5-nano`) via Copilot's
     intermediated model surface. Fall back to heuristic on error.

5. Write the summary to `.thrift/summaries/<YYYY-MM-DD>-turn<N>.md`.

6. Mirror to `store_memory`:
   ```javascript
   await storeMemoryWrite({
     key: `${config.storeMemory.keyPrefix}summary/${ts}`,
     value: { path: summaryPath, summaryText, droppedTurnCount, at },
     scope: config.storeMemory.scope,
     invoker: hostInvoker,
   });
   ```
   If the bridge degrades to file-only: log + continue (summary still
   written to disk).

7. `recordSummariser(state, {reason, tokensBefore, tokensAfter})` →
   updates `.thrift-state.json` AND mirrors to
   `store_memory(key: "thrift/state")`.

8. Print to user:
   ```
   Summariser wrote: .thrift/summaries/<date>-turn<N>.md
   Mirror: store_memory(<scope>, <key>) — <ok|degraded>
   Saved tokens: ~<N> (estimated <%> reduction).
   Suggested action: start a fresh Copilot session and reference the
     summary path above (Copilot has no /compact equivalent).
   ```

## On error

- Conversation history missing: print instructions for the user's
  Copilot CLI transcript export, do nothing.
- summariser produces empty body (turns ≤ preserveLastTurns):
  print "no summarisation needed at this size" and exit.
- Model call fails: warn + fall back to heuristic.
- `store_memory` invoker throws or returns an error envelope: log
  `storeMemoryDegraded: true` to state and continue file-only.

## Summariser model rationale

Per the decomposition spec, Copilot intermediates the model layer —
`summariser.model` is a hint, not a binding selector. We default to
`gpt-5-nano` (cheapest OpenAI summariser-class model per current
public pricing). If Copilot picks a different model under the hood,
the audit's cost-estimator falls back to the heuristic "Copilot
intermediated; cost is whatever Copilot's billing reports" mode.

> **TODO: confirm whether Copilot exposes the actually-used model in
> any tool response or `read_agent` field. If yes, audit can substitute
> the real model into the rate-table lookup.**

## Future (v2)

When Copilot ships a programmatic transcript / compact API:
1. Replace step 3 with a native transcript query.
2. Replace step 8 with a programmatic context-replacement call.
3. No user intervention required.
