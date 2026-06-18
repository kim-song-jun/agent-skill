---
name: debug
description: >
  Use when investigating a failing Codex CLI command, flaky behavior,
  regression, or unclear runtime error that needs reproducible debugging
  evidence and durable hypothesis state.
---

# /debug

Drives a disciplined six-phase investigation for the current Codex project.
Reads `.debug-state.json`, runs the failing command, performs structured error parsing,
enumerates hypotheses (delegating to
`superpowers:systematic-debugging` when available), runs minimal
experiments per hypothesis, restores working-tree state between
experiments, and writes a durable debug-log artifact at end.

## Usage

From an installed Codex project, open `codex` in the repo and type the public
harness entrypoints:

```
run /debug "<failing command>"
run /debug --resume
run /debug --skip-isolate "<command>"
run /debug --yes "<command>"
```

The installed project-local skill is named `debug`. The source directory
remains `debug-codex` only to identify the Codex implementation inside this
repository.

```
/debug "<failing command>"          # start a fresh investigation
/debug --resume                     # continue from existing state
/debug --skip-isolate "<command>"   # skip Phase 2 input/git bisection
/debug --yes "<command>"            # don't prompt; pick first candidate
```

## Flags

- `--resume` — load existing `.debug-state.json` and resume after the
  highest completed phase.
- `--skip-isolate` — skip Phase 2 (use when the failure input is
  already minimal).
- `--yes` — non-interactive: auto-select the first untested hypothesis
  as the candidate in Phase 3.
- `--force` — overwrite existing `.debug-state.json` instead of
  resuming.
- `--slug=<name>` — override the auto-generated slug for the Phase 5
  output path.

## Pipeline

The skill runs 6 phases strictly in order. Each phase has its own file
under `phases/`; Read it on demand.

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git check, command presence, state init |
| 1 | `phases/1-reproduce.md` | run failing command, parse error to structured form |
| 2 | `phases/2-isolate.md` | minimise input or `git bisect` regression |
| 3 | `phases/3-hypothesize.md` | enumerate 2-3 hypotheses (wraps superpowers if available) |
| 4 | `phases/4-verify.md` | one experiment per candidate, restore tree between |
| 5 | `phases/5-summarise.md` | render debug-log.md and resolution summary |

## Rules

1. **You orchestrate; phases are the source of truth.** Read each
   phase file before running it.
2. **State lives in `.debug-state.json`.** Atomic writes only. The
   schema is fixed in `docs/superpowers/specs/2026-05-18-harness-debug-design.md`.
3. **Never propose a fix before Phase 1 reproduces AND Phase 3
   enumerates.** This is the Iron Law from
   `superpowers:systematic-debugging` and it applies here too.
4. **One experiment per candidate per turn.** No batch experiments;
   they confound results.
5. **Always restore the working tree after a mutating experiment.**
   Verify via `restoreTo(state, stateHashBefore)` — if it returns
   `matched: false`, warn loudly and do not proceed silently.
6. **context-mode for any non-trivial command output.** Use
   `mcp__plugin_context-mode_context-mode__ctx_batch_execute` for
   shell work where output may exceed 20 lines when available; otherwise
   run the smallest useful `shell_command`/`exec_command` and capture raw
   output to `.debug-artifacts/`.
7. **Shared interaction model for user decisions.** Any choice, resume,
   or confirmation uses `agent-interaction/v1` from
   `../agent-all/lib/interactions/*.mjs`, renders through
   `renderer-codex.mjs`, and appends the result to
   `.agent-skill/runs/debug/interactions.jsonl` with
   `appendInteractionLog({ source: "debug" })`. Non-TTY may choose a
   recommended low/medium-risk option, but high-risk options and unknown
   refs must use `nonTtyPolicy: "pause"`.

## Codex primitive map

| Action | Codex primitive |
|---|---|
| Read file | implicit model file read |
| Write durable artifacts | `apply_patch` or a phase lib atomic writer |
| Shell one-shot | `shell_command` |
| Reused shell session | `exec_command` |
| Large shell output | context-mode `ctx_execute` / `ctx_batch_execute` when installed |
| Prompt user | `agent-interaction/v1` via `renderer-codex.mjs`, logged to `interactions.jsonl` |
| Invoke helper skill | installed skill invocation when Codex exposes it; fallback prompt otherwise |

## Lib modules

- `lib/error-parser.mjs` — `parseError(text, hints?)` → `{kind, frames[], rootException?}` for 10 formats.
- `lib/state-checkpoint.mjs` — `loadState/saveState/computeTreeHash/pushCheckpoint/restoreTo`.
- `lib/debug-artifacts.mjs` — `finishDebugSession/renderDebugLog/slugifyDebugSubject` for Phase 5 state/log/index output.
- `lib/bisector.mjs` — `inputBisect({input, predicate})` ddmin; `gitBisect({command, knownGood, knownBad, spawn?})`.
- `lib/hypothesis-tracker.mjs` — `addHypothesis/decide/selectCandidate/nextUntested/summary/exportToDebugLog`.
- `lib/repro-suggester.mjs` — `suggestCommands({projectRoot, vague})` for Phase 0 when no command was provided.

## On error

- `failure` doesn't reproduce in Phase 1 → abort with `Failure did not
  reproduce — environment changed?`. Do NOT advance.
- All hypotheses rejected and no new ones generated → loop back to
  Phase 3 with a banner suggesting the failure description itself may
  be wrong.
- `restoreTo` returns `matched: false` after a Phase 4 experiment →
  warn `working tree differs from checkpoint; uncommitted experiment
  artifacts remain` and do not auto-discard.
- `superpowers:systematic-debugging` not installed or not exposed by the
  current Codex host -> fall back to the
  inlined hypothesis prompt baked into Phase 3, with a banner saying
  so.

## When done (Phase 5)

Print:
```
Debug complete: <root-cause-one-liner>
Log: .agent-skill/reports/debug/<date>-<slug>.md
Hypotheses: <tested>/<total> tested, <verified> verified, <rejected> rejected.
```

## References

- `docs/superpowers/specs/2026-05-18-harness-debug-design.md` — full design.
- `references/integration-with-superpowers.md` — how harness-debug-codex
  wraps `superpowers:systematic-debugging` on Codex (advisory if available).
