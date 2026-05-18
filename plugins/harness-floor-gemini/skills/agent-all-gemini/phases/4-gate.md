# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff via `run_shell_command`:
   `git diff <wave.startCommit>..<wave.endCommit>`.
2. If `gates.specReview`: spawn a reviewer subprocess:
   ```
   run_shell_command("gemini chat -p 'MODE=spec; verify diff matches plan...' \
     --output-file /tmp/agent-all/wave-<i>/spec-review.json &")
   ```
3. If `gates.qualityReview`: spawn a quality reviewer subprocess (parallel
   with spec reviewer if both enabled).
4. Await both. Read result files. Bucket issues by severity.
5. If any critical AND `blockOnCritical === true`:
   - Spawn an implementer subprocess with the critical issues.
   - Re-spawn reviewer subprocesses afterward.
   - Up to 3 retry cycles. If still failing: abort, push
     `{phase: 4, status: "blocked"}`, exit code 2.
6. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
7. Push `{phase: 4, completedAt}` once all waves processed.

## Gemini-specific

Reviewer subprocesses use the same `--skill-roster .gemini/skills/reviewer/`
flag as Phase 3 implementers. The reviewer skill must accept `MODE=spec|quality`
in its prompt body — the `/gemini-init` default roster ships such a reviewer.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.
