# Phase 3 — Hypothesize

Enumerate 2-3 candidate root causes for the parsed failure. This is
the only phase where the model invents — every other phase is
mechanical.

## Steps

1. If `state.supervisor.wrappedSkill === "superpowers:systematic-debugging"`
   AND that skill is installed:
   - Render `templates/hypothesis-prompt.md.hbs` populated from
     `failure.errorParsed`, prior rejected hypotheses (use
     `hypothesis-tracker#exportToDebugLog`), and the minimal input
     from Phase 2.
   - Invoke the skill with the rendered prompt as the entry input when
     Codex exposes installed skill invocation. If the host does not expose
     that surface, keep the same prompt and use the fallback path below.
   - Capture the skill's hypothesis enumeration from the model's reply
     and add each one via `addHypothesis(state, text)`.
   - Record `state.supervisor.lastInvokedAt = new Date().toISOString()`
     and `state.supervisor.promptDigest = sha256(prompt).slice(0,16)`.

2. If the skill is NOT installed:
   - Use the inlined fallback prompt rendered from the same template.
     Banner: `[fallback — superpowers:systematic-debugging not
     installed]`. Functionality is reduced (no skill updates flow
     through) but the workflow remains intact.
   - Self-answer 2-3 hypotheses based on `failure.errorParsed`, the
     project README, and the recent git log (`git log --oneline -20`).
     Add each via `addHypothesis`.

3. Choose a `currentCandidate`:
   - `--yes` flag → automatically call
     `selectCandidate(state, nextUntested(state).id)` and append an
     `agent-interaction/v1` audit result to
     `.agent-skill/runs/debug/interactions.jsonl` with
     `appendInteractionLog({ source: "debug" })`.
   - Otherwise → present the hypotheses to the user with a "test
     these in order of easiest-to-test first" recommendation as an
     `agent-interaction/v1` decision
     (`id: "debug:hypothesis-candidate"`) through
     `../agent-all-codex/lib/interactions/renderer-codex.mjs` and let
     them pick. High-risk experiments must use option `risk: "high"`
     and cannot be auto-selected by `resolveNonTtyInteraction()`.

4. Push checkpoint:
   ```
   pushCheckpoint(state, {
     phase: 3,
     actionsTaken: ["enumerated N hypotheses", "selected candidate H<id>"],
   });
   saveState(path, state);
   ```

## Output to user

```
Hypotheses enumerated:
  H1.  <text>                                   [untested]
  H2.  <text>                                   [untested]
  H3.  <text>                                   [untested]
Candidate selected: H<id> — <text>
Supervisor: <superpowers:systematic-debugging|fallback>
```

## On error

- Skill invocation is unavailable or returns no parseable hypothesis list → fall back to
  inlined enumeration and record the parse failure on state.
- All proposed hypotheses are duplicates of previously rejected ones
  → loop with banner `prior rejections re-proposed; consider whether
  the failure description itself is wrong`.
