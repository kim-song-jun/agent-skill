# Phase 4 — Gate

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip.
Push `{phase: 4, completedAt}` and exit.

## Steps

For each wave with `status === "completed"`:

1. Compute the wave diff via `run_shell_command`:
   `git diff <wave.startCommit>..<wave.endCommit>`.
2. Read `const orchestration = wave.orchestration ?? state.orchestration`.
   Union dynamic reviewer/coordinator roles from
   `orchestration.requiredAgents` into the gate subprocess list before
   spawning reviewers. Dynamic `orchestrator`, `design-reviewer`,
   `qa-reviewer`, `security-reviewer`, `data-reviewer`, and
   `integration-dev` selections must keep their role, reason, wave, and cost
   estimate in `.agent-skill/runs/<run-id>/spawn-log.jsonl`; if a gate
   dispatch was not already policy-evaluated in Phase 3, emit a compatible
   `BeforeAgentSpawn` policy entry before spawning it.
3. If `gates.specReview`: spawn a reviewer subprocess:
   ```
   run_shell_command("gemini chat -p 'MODE=spec; verify diff matches plan...' \
     --output-file /tmp/agent-all/wave-<i>/spec-review.json &")
   ```
4. If `gates.qualityReview`: spawn a quality reviewer subprocess (parallel
   with spec reviewer if both enabled).
5. Await both. Read result files. Bucket issues by severity.
6. If any critical AND `blockOnCritical === true`:
   - Spawn an implementer subprocess with the critical issues.
   - Re-spawn reviewer subprocesses afterward.
   - Up to 3 retry cycles. If still failing: abort, push
     `{phase: 4, status: "blocked"}`, exit code 2.
7. Record `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.
8. Push `{phase: 4, completedAt}` once all waves processed.

## Gemini-specific

Reviewer subprocesses use the same `--skill-roster .gemini/skills/reviewer/`
flag as Phase 3 implementers. The reviewer skill must accept `MODE=spec|quality`
in its prompt body — the `/gemini-init` default roster ships such a reviewer.

## Output

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.

## Per-reviewer verification check (mandatory)

Every reviewer `gemini chat` subprocess's prompt MUST include the following directive:

> When evaluating the wave's diff, explicitly verify that each implementer ran `superpowers:verification-before-completion` and the verification passed. Look for the verification command output in commit messages, the implementer's reported output, or run the verification command yourself against the wave's tip commit.
>
> If verification was skipped OR failed, escalate as a `critical` issue regardless of code quality verdict — this blocks the wave at Phase 4 even if everything else looks fine.

This complements the Phase 3 verification directive. Two-layer safety net.
