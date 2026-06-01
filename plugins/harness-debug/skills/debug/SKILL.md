---
name: debug
description: >
  Six-phase debugging workflow with hypothesis state persistence,
  structured error parsing, and git/input bisection. Use /debug to
  start an investigation from a failing command; /debug --resume to
  continue across sessions. Writes a durable log to
  docs/debug/<date>-<slug>.md at end. Wraps (does not replace)
  superpowers:systematic-debugging when that skill is installed.
---

# /debug

Drives a disciplined six-phase investigation for the current project.
Reads `.debug-state.json`, runs the failing command, parses the
error into structured form, enumerates hypotheses (delegating to
`superpowers:systematic-debugging` when available), runs minimal
experiments per hypothesis, restores working-tree state between
experiments, and writes a durable debug-log artifact at end.

## Usage

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
   shell work where output may exceed 20 lines.

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
- `superpowers:systematic-debugging` not installed → fall back to the
  inlined hypothesis prompt baked into Phase 3, with a banner saying
  so.

## When done (Phase 5)

Print:
```
Debug complete: <root-cause-one-liner>
Log: docs/debug/<date>-<slug>.md
Hypotheses: <tested>/<total> tested, <verified> verified, <rejected> rejected.
```

## References

- `docs/superpowers/specs/2026-05-18-harness-debug-design.md` — full design.
- `references/integration-with-superpowers.md` — how harness-debug
  wraps `superpowers:systematic-debugging` (advisory if available).
