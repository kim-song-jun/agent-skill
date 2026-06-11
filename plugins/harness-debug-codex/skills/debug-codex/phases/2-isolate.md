# Phase 2 — Isolate

Goal: shrink the failing input until further shrinking would make it
pass. Two strategies — pick based on failure shape.

If `--skip-isolate` was passed OR the failing input is already minimal
(single-line command, single test name): skip this phase entirely and
push a checkpoint with `actionsTaken: ["skipped — minimal already"]`.

## Strategy A — Input bisection

Use when the failing command takes a discrete input (a file, a list
of test names, an HTTP body).

1. Split the input into chunks (lines, tests, JSON object keys).
2. Define `predicate(subset)` to be `runner(subset).exitCode !== 0`.
3. Call `lib/bisector.mjs#inputBisect({input, predicate})`.
4. Record `state.failure.minimalInput = minimal` on state.

The function uses ddmin under the hood; it terminates when no single
removal preserves the failure.

## Strategy B — Git history bisection

Use when the failure is regression-shaped ("worked yesterday, broken
today"). The user must supply the last known-good commit or tag.

1. Prompt user for `knownGood` ref using `agent-interaction/v1`
   (`kind: "decision"`, `id: "debug:known-good-ref"`,
   `nonTtyPolicy: "pause"`). Render through
   `../agent-all-codex/lib/interactions/renderer-codex.mjs` and append
   the result to `.agent-skill/runs/debug/interactions.jsonl` with
   `appendInteractionLog({ source: "debug" })`. Non-TTY must pause
   rather than inventing a ref. `knownBad` is `HEAD`.
2. Call `lib/bisector.mjs#gitBisect({command: failure.command,
   knownGood, knownBad})`. The wrapper handles `git bisect start/bad/
   good/run/reset` and **always runs `git bisect reset` in `finally`**
   so a partial bisect does not strand the repo.
3. Record the returned SHA as `state.failure.offendingCommit`.

## Output to user

```
Isolated:
  strategy:      <input|git|skipped>
  minimal:       <N> chunks (was <M>)             # input mode
  offending:     <sha7>  <commit subject>         # git mode
  iterations:    <N>
```

Push checkpoint:
```
pushCheckpoint(state, {
  phase: 2,
  actionsTaken: ["<strategy> bisection", "<N> iterations"],
});
saveState(path, state);
```
