# Phase 4 — Verify

Run one minimal experiment per candidate hypothesis. Restore the
working tree between experiments.

## Steps for the current `state.currentCandidate`

1. **Push pre-experiment checkpoint:**
   ```
   const hashBefore = computeTreeHash();
   pushCheckpoint(state, {
     phase: 4,
     hash: hashBefore,
     actionsTaken: ["pre-experiment baseline for H<id>"],
   });
   ```

2. **Propose a minimal experiment.** Exactly one of:
   - **Inspection** — read a file, run a query, add a single log line.
   - **Predictive change** — alter one variable, predict the new
     behaviour, verify.
   - **Bisection-within-hypothesis** — split the suspect region of
     code, eliminate half.

   No batch experiments. Confounding kills signal.

3. **Execute the experiment.** Use the same execution path as Phase 1
   (prefer `ctx_execute`).

4. **Decide status.** Call
   `decide(state, candidateId, {status, experiment, result})`:
   - **verified** — outcome matches the prediction exactly. Proceed
     to Phase 5 (after one confirmation pass).
   - **rejected** — prediction failed. Promote the next untested
     hypothesis as the new candidate (`selectCandidate(state,
     nextUntested(state).id)`).
   - **partial** — surprising but informative. Add a new hypothesis
     describing the surprise (`addHypothesis(state, <new text>,
     {parentId: candidateId})`) and return to Phase 3 with the
     refreshed candidate set.

5. **Restore working tree** unless the experiment was read-only:
   ```
   const r = restoreTo(state, hashBefore);
   if (!r.matched) {
     warn(`Working tree differs from pre-experiment hash.
       expected: ${hashBefore}
       current:  ${r.currentHash}
       reason:   ${r.reason}
     The experiment left uncommitted artifacts. Restoring requires
     manual `git stash` / `git checkout -- <files>` — debug will NOT
     auto-discard your work.`);
   }
   ```

6. **Push post-experiment checkpoint:**
   ```
   pushCheckpoint(state, {
     phase: 4,
     actionsTaken: ["experiment: <one-liner>", "result: <status>", "restored: <matched>"],
   });
   saveState(path, state);
   ```

7. **Loop:**
   - If the new candidate exists and is `untested` → repeat Phase 4.
   - If all hypotheses are rejected and no new ones generated → loop
     back to Phase 3 with the stale ones marked, and prompt the model
     to propose entirely new directions (and consider whether the
     *failure description itself* is wrong). Cap loops at N=5; after
     that, escalate to the user with `5 cycles complete, no
     verification — is the failure description wrong?`.

## Output to user (per experiment)

```
H<id> experiment: <one-liner>
  prediction: <what the candidate predicted>
  result:     <observed>
  decision:   <verified|rejected|partial>
  tree:       <restored|differs>
```
