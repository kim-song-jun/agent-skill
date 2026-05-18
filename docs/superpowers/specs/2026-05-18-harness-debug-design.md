# Theme D — `harness-debug` design

**Date:** 2026-05-18
**Status:** Design only — no implementation in this iteration
**Purpose:** Define the fourth pillar plugin alongside `harness-builder`
(scaffolding), `harness-floor` (cost-unrestricted), and `harness-thrift`
(cost-conscious). `harness-debug` is the debugging-focused counterpart:
disciplined reproduce → isolate → hypothesize → verify workflow with
structured logging and checkpointing so the model (and the user) never
lose context across long debugging sessions.

## Background

The harness family currently maps onto four problem postures:

| Theme | Plugin | Posture |
|---|---|---|
| A | `harness-builder` (+ 4 platform siblings) | Bootstrap scaffolding (one-shot, low cost) |
| B | `harness-thrift` | Cost-conscious long-session optimisation (low cost, sustainable runtime) |
| C | `harness-floor` (+ 4 platform siblings) | Cost-unrestricted multi-agent pipelines (high cost, high quality) |
| **D** | **`harness-debug`** (new) | **Debugging-focused disciplined investigation (mid cost, high signal-to-noise)** |

Theme A is install-time work. Theme B optimises *any* long session for
cost. Theme C burns budget to land high-quality changes. Theme D is the
missing piece: long *investigation* sessions where the cost driver is
not raw context bloat (thrift covers that) and not parallel fan-out
(floor covers that) but **wasted turns chasing the wrong hypothesis,
re-running commands, and forgetting what's already been ruled out.**

The fifth Theme (`harness-explore`, codebase mapping) is sketched
separately; `harness-debug` is scoped to *runtime failure investigation*,
not static comprehension.

## Problem

A typical multi-hour debugging session in Claude Code degrades in
predictable ways:

1. **Lost ruling-out state.** The model proposes hypothesis A, runs an
   experiment, rules it out at turn 12. By turn 40 it proposes A again
   because the rejection is buried in the conversation history.
2. **Hypothesis amnesia.** Three hypotheses get proposed at turn 8.
   The model tests hypothesis 1, partial success, gets distracted by a
   surprise log line, never returns to hypotheses 2 and 3.
3. **Command repetition.** The same `pytest -x tests/foo.py::bar`
   command runs 5+ times across the session because the model "forgets"
   the most recent failure output and re-fetches it instead of consulting
   prior results.
4. **No clean reset between hypothesis branches.** When hypothesis A
   fails, side effects (added log lines, env vars, edited files) from
   testing it pollute the test of hypothesis B. The model rarely reverts
   cleanly.
5. **Raw error output dominates the conversation.** A 500-line Python
   traceback enters context, contributes one usable signal (file:line),
   and then sits there forever. `harness-thrift` partly addresses raw
   bloat, but debugging specifically needs **structured extraction**:
   the model should never have to re-parse a stack trace on turn 30 that
   it already parsed on turn 5.
6. **No durable record.** When the session ends (or compacts), the
   reasoning chain that led to the root cause is lost. The next time a
   similar bug appears, the team starts from zero.

`harness-debug` exists because these failures are *workflow* failures,
not capability failures. The model knows how to debug; it forgets how to
debug *across many turns*.

## Goals

1. **Enforce a disciplined debugging workflow.** State the failure
   precisely → form 2-3 hypotheses → test each one → record outcome →
   narrow or pivot. No fixes proposed before Phase 1 reproduces and
   Phase 3 enumerates.
2. **Checkpoint state at every hypothesis boundary.** A
   `.debug-state.json` file persistently records: failure description
   (with parsed error), every hypothesis proposed and its current
   status, every checkpoint with a hash of the working tree, and the
   current "leading candidate" hypothesis.
3. **Parse common error output into structured form.** Stack traces
   become `[{file, line, function, exception}]`; test failures become
   `[{test, file, line, message}]`; compiler errors become
   `[{file, line, code, message}]`. The structured form lives in
   `.debug-state.json`, not in the rolling conversation.
4. **Suggest minimal repro when the user gives a vague report.** If the
   input is "my login is broken," Phase 1 asks targeted questions and
   proposes the smallest command that demonstrates the failure.
5. **Integrate (not replace) `superpowers:systematic-debugging`.**
   When the skill is available, `harness-debug` wraps it: Phase 3
   auto-loads the skill, captures its prompts and the model's responses
   into `.debug-state.json`, and provides the skill with the structured
   state it would otherwise have to reconstruct.
6. **Survive session boundaries.** `--resume` on a new session reads
   `.debug-state.json` and rehydrates the investigation context in
   under 200 tokens of preamble (rather than re-pasting the whole
   error).
7. **End with a durable artifact.** Phase 5 writes
   `docs/debug/<date>-<slug>.md` capturing the failure, the hypotheses
   tried, the experiments run, and the resolution (or the current
   stuck-point if abandoned).

## Non-goals

- **Replace a profiler or APM tool.** harness-debug captures runtime
  errors and reasoning; it doesn't instrument hot paths or memory
  allocations.
- **Auto-fix bugs.** The skill drives the *investigation* workflow.
  Applying the fix is a separate step (often delegated to
  `superpowers:test-driven-development` once the root cause is named).
- **Static analysis.** Lint warnings, type errors at build time, and
  dependency CVEs belong in a linting/SAST layer, not debug.
- **Replace `superpowers:systematic-debugging`.** harness-debug wraps
  and persists; the prompt-engineering inside the skill remains
  authoritative.
- **Cross-machine debugging.** Distributed traces, remote attaches,
  production debuggers — out of scope for local-first design.

## Architecture

```
plugins/harness-debug/
├── plugin.json
├── README.md
├── skills/
│   └── debug/                                  # User-facing skill: /debug
│       ├── SKILL.md
│       ├── phases/
│       │   ├── 0-preflight.md                  # git clean? failing command provided?
│       │   ├── 1-reproduce.md                  # run failing command, capture structured error
│       │   ├── 2-isolate.md                    # minimise via bisection
│       │   ├── 3-hypothesize.md                # invoke superpowers:systematic-debugging
│       │   ├── 4-verify.md                     # targeted experiment per hypothesis
│       │   └── 5-summarise.md                  # write debug log markdown
│       ├── lib/
│       │   ├── state-checkpoint.mjs            # .debug-state.json reader/writer + tree hash
│       │   ├── error-parser.mjs                # 5+ format parsers
│       │   ├── bisector.mjs                    # git bisect + input bisect wrappers
│       │   ├── hypothesis-tracker.mjs          # add/select/reject hypotheses
│       │   ├── repro-suggester.mjs             # turn vague report into a candidate command
│       │   └── superpowers-bridge.mjs          # wraps superpowers:systematic-debugging
│       ├── templates/
│       │   ├── debug-log.md.hbs                # Phase 5 artifact
│       │   ├── hypothesis-prompt.md.hbs        # Phase 3 prompt
│       │   ├── repro-prompt.md.hbs             # Phase 1 vague-report disambiguation
│       │   └── experiment-summary.md.hbs       # Phase 4 single-experiment summary
│       └── references/
│           ├── error-format-catalog.md         # documents each parser's expected input
│           └── checkpoint-conventions.md       # what counts as a checkpoint boundary
└── hooks/                                      # bundled hook scripts (optional)
    └── posttool-error-extract.mjs              # auto-extract on test/build failures
```

## `.debug-state.json` schema

```json
{
  "version": "0.1.0",
  "createdAt": "2026-05-18T14:30:00Z",
  "failure": {
    "description": "Login endpoint returns 500 on valid credentials",
    "command": "pytest tests/auth/test_login.py::test_valid_login -x",
    "lastExitCode": 1,
    "lastRunAt": "2026-05-18T14:32:11Z",
    "rawOutputRef": ".debug-artifacts/run-001.log",
    "errorParsed": {
      "kind": "pytest",
      "frames": [
        {"test": "test_valid_login", "file": "tests/auth/test_login.py", "line": 42, "message": "AssertionError: 500 != 200"}
      ],
      "rootException": {"type": "KeyError", "value": "'user_id'", "file": "src/auth/session.py", "line": 87}
    }
  },
  "hypotheses": [
    {
      "id": 1,
      "text": "Session middleware drops the user_id before the route handler runs",
      "status": "rejected",
      "experiment": "added print of session keys at middleware boundary",
      "result": "user_id present at middleware exit; rejection",
      "decidedAt": "2026-05-18T14:48:00Z"
    },
    {
      "id": 2,
      "text": "Route handler reads 'userId' (camelCase) but session writes 'user_id'",
      "status": "verified",
      "experiment": "grep handler for session.get calls",
      "result": "confirmed mismatch at src/auth/login.py:114",
      "decidedAt": "2026-05-18T15:02:00Z"
    },
    {
      "id": 3,
      "text": "DB schema migration dropped the user_id column",
      "status": "untested"
    }
  ],
  "checkpoints": [
    {
      "at": "2026-05-18T14:32:11Z",
      "phase": 1,
      "stateHashBefore": "sha256:abc123...",
      "actionsTaken": ["ran failing command", "captured stderr", "parsed pytest output"]
    },
    {
      "at": "2026-05-18T14:48:00Z",
      "phase": 4,
      "stateHashBefore": "sha256:def456...",
      "actionsTaken": ["added 2 print statements", "ran command", "removed print statements", "verified working tree restored"]
    }
  ],
  "currentCandidate": 2,
  "supervisor": {
    "wrappedSkill": "superpowers:systematic-debugging",
    "skillVersion": "5.1.0",
    "lastInvokedAt": "2026-05-18T14:35:00Z",
    "promptDigest": "sha256:..."
  },
  "resolution": null
}
```

`resolution` is populated by Phase 5 with `{rootCause, fixCommit?, debugLogPath}`.

## Component detail

### 5.1 Phase 0 — Preflight

- Confirm `pwd` is a git repo.
- Confirm tree is clean OR record a pre-debug stash hash so Phase 4's
  reset can restore baseline. (Unlike `agent-all`, debug *allows* a
  dirty tree because the failure may live in uncommitted code; it
  simply records the baseline.)
- Check that a failing command was provided (positional arg) OR detect
  one from recent shell history (best-effort). If neither: prompt the
  user for the command.
- Initialise `.debug-state.json` if missing; load existing if present
  and `--resume` was passed.
- Push initial checkpoint with `stateHashBefore = computeTreeHash()`.

### 5.2 Phase 1 — Reproduce

1. Execute `failure.command` via the harness's shell-execution tool
   (prefer `ctx_execute(language: "shell")` if context-mode is
   available, else `Bash`).
2. Capture stdout+stderr to `.debug-artifacts/run-<NNN>.log`.
3. Store `lastExitCode`. If `0`, abort with `Failure did not reproduce
   — Phase 1 cannot proceed without a deterministic failure. Did the
   environment change?`
4. Hand the captured log to `error-parser.mjs#parse(log, hints)`.
   Parser returns `{kind, frames[], rootException?}` or `{kind: "unknown", raw: <truncated>}`.
5. Write structured result to `failure.errorParsed`. Truncate raw log
   reference; the full log stays on disk, NOT in the conversation.
6. Print a single 5-line summary to the user (kind + top frame + root
   exception) and proceed.

### 5.3 Phase 2 — Isolate

The goal is to shrink the failing input until further shrinking would
make it pass.

Two strategies, chosen by `bisector.mjs`:

- **Input bisection.** When the failing command takes a discrete input
  (e.g., a file, a test name list, an HTTP body), bisect the input.
  Drop half, re-run. If still failing, drop another half. If passing,
  restore the dropped half and bisect the other side. Terminate when
  no single removal preserves the failure.
- **Git history bisection.** When the failure is regression-shaped
  ("worked yesterday, broken today"), wrap `git bisect`. Phase 2 asks
  the user for the last known-good ref; runs `git bisect start`,
  `git bisect bad`, `git bisect good <ref>`; provides
  `failure.command` as the bisect script. Records the offending commit
  in state.

Skip entirely if `--skip-isolate` is passed or the failure is already
minimal (one-line input).

Checkpoint after Phase 2 with the minimised input and (if applicable)
the offending commit recorded.

### 5.4 Phase 3 — Hypothesize

1. If `superpowers:systematic-debugging` is installed:
   - Render `templates/hypothesis-prompt.md.hbs` populated from
     `failure.errorParsed` and prior rejected hypotheses.
   - Invoke the skill with that rendered context as the entry input.
   - Capture the skill's hypothesis enumeration (the model's reply
     while inside the skill) into `hypotheses[]` with
     `status: "untested"`.
   - Record `supervisor.lastInvokedAt` and `promptDigest`.
2. If the skill is NOT installed:
   - Use a local fallback prompt baked into Phase 3 that asks the
     model to enumerate 2-3 hypotheses against `failure.errorParsed`
     and the project README + recent git log.
3. The model (or user via `--yes` skip) selects a `currentCandidate`
   from the new untested set, ordered by "easiest to test first."

### 5.5 Phase 4 — Verify

For the `currentCandidate` hypothesis:

1. Push a checkpoint with `stateHashBefore = computeTreeHash()`.
2. Propose a minimal experiment: one of
   - **Inspection** (read a file, run a query, add a single log line).
   - **Predictive change** (alter one variable, predict the new
     behaviour, verify).
   - **Bisection-within-hypothesis** (split the suspect region of
     code, eliminate half).
3. Execute the experiment.
4. Record the result on the hypothesis: `{experiment, result, decidedAt}`.
5. Decide status:
   - **verified** — fits the prediction exactly. Move to Phase 5 with
     this as `resolution.rootCause` (after one confirmation pass).
   - **rejected** — prediction failed. Move on.
   - **partial** — surprising but informative. Add a *new* hypothesis
     describing the surprise; return to Phase 3 with the candidate set
     refreshed.
6. **Always restore working-tree state to `stateHashBefore`** unless
   the experiment was non-mutating (read-only). Verify restoration via
   re-hash. Abort with loud warning if hashes don't match — the user
   has uncommitted work the experiment depended on, and continuing
   risks losing it.
7. If all hypotheses are rejected and no new ones generated: loop back
   to Phase 3 with the stale ones marked, prompting the model to
   propose entirely new directions (and to consider whether the
   *failure description* itself is wrong).

### 5.6 Phase 5 — Summarise

1. Render `templates/debug-log.md.hbs` with the full state.
2. Write to `docs/debug/<date>-<slug>.md` where slug is derived from
   `failure.description` (slugified, capped at 40 chars).
3. Populate `resolution = {rootCause, fixCommit?, debugLogPath}`.
4. Optionally append a one-line entry to `docs/debug/index.md`.
5. Print the path of the debug log and a one-line resolution summary.

The debug log is the durable retro artifact. Future debugging sessions
on related bugs can grep `docs/debug/` for prior root causes before
spinning up Phase 1.

### 5.7 lib/state-checkpoint.mjs

- `loadState(path)` → `{ok, state}` (creates skeleton if missing).
- `saveState(path, state)` — atomic write (tmp + rename).
- `computeTreeHash()` → `sha256` of `git ls-files | xargs git hash-object`
  output. Cheap, deterministic, no commit required.
- `pushCheckpoint(state, {phase, actionsTaken})` — appends with
  current hash.
- `restoreTo(hash)` — best-effort: `git stash` working changes and
  verify hash matches; if mismatch, warn loudly. Does NOT discard
  uncommitted work; only verifies and reports.

### 5.8 lib/error-parser.mjs

- `parse(rawText, hints?)` → `{kind, frames[], rootException?} | {kind: "unknown", raw}`.
- Dispatch table keyed on regex sniffs of the leading 200 bytes:
  - `^Traceback \(most recent call last\):` → Python parser
  - `at .* \(.*:\d+:\d+\)` → JS V8 parser
  - `^FAILED tests/` or `^=+ short test summary` → pytest
  - `Tests:.*failed` (jest) → jest parser
  - `error\[E\d+\]:` (rustc) → rustc parser
  - `error TS\d+:` (tsc) → tsc parser
  - `: error:` (gcc/clang) → cc parser
  - `^\s*\d+:\d+\s+(error|warning)` (eslint) → eslint parser
- Each per-format parser is a self-contained pure function with its
  own unit tests; adding a 9th format is "add a sniff + a parser."
- Parsers MUST tolerate ANSI colour codes (strip first).
- Parsers MUST cap returned `frames[]` length (default 20) to prevent
  re-bloating the state file.

### 5.9 lib/bisector.mjs

- `bisectInput(input, runner, predicate)` → smallest input subset
  such that `predicate(runner(subset)) === true`. Delta-debugging
  classic ddmin algorithm.
- `bisectGit({goodRef, badRef, script})` → wraps `git bisect`.
  Returns the offending commit SHA. Cleans up with `git bisect reset`
  even on abort (try/finally).
- Both functions write progress to state so a resumed session can pick
  up mid-bisection.

### 5.10 lib/hypothesis-tracker.mjs

- `addHypothesis(state, text)` → returns new id.
- `selectCandidate(state, id)` — sets `currentCandidate`.
- `decide(state, id, {status, experiment, result})` — updates the
  hypothesis and conditionally rotates `currentCandidate`.
- `nextUntested(state)` → first hypothesis with `status: "untested"`,
  or `null`.
- `summary(state)` → `{tested: N, rejected: M, verified: K, pending: P}`.

### 5.11 lib/repro-suggester.mjs

When Phase 0 has no failing command, this lib drives a short clarifier
loop:

- Asks up to 3 disambiguating questions (rendered from
  `templates/repro-prompt.md.hbs`).
- Inspects `package.json`, `pyproject.toml`, `Makefile`, `justfile`
  for the project's "primary test command."
- Proposes 1-3 candidate commands. User picks one or types their own.
- Validates by running the proposed command once (capped at 60s) to
  confirm it produces *some* output (not necessarily a failure — that
  comes next).

### 5.12 lib/superpowers-bridge.mjs

- `isAvailable()` → checks `~/.claude/plugins/cache/.../superpowers/.../skills/systematic-debugging/`.
- `invoke(state)` — renders the bridge prompt, calls the Skill tool
  with `superpowers:systematic-debugging`, captures the model's reply,
  parses hypotheses out of it, returns `{hypotheses, promptDigest}`.
- `digestPrompt(text)` → `sha256` truncated, stored on the state so
  rerunning with an unchanged prompt is detectable (and skippable).

## Integration with `superpowers:systematic-debugging`

`harness-debug` deliberately does NOT re-implement the skill's prompt
engineering. Instead:

1. **Phase 3 auto-loads the skill** when available. The user sees the
   skill's familiar "Four Phases / Iron Law" framing.
2. **State persistence wraps the skill.** The skill's transient
   reasoning chain is captured to `.debug-state.json` so that the
   *next* turn (or the next session via `--resume`) starts from
   structured state instead of re-deriving the analysis from a long
   conversation.
3. **The skill remains the source of truth for HOW to think.**
   harness-debug supplies WHAT to think about (the parsed failure,
   prior rejections, current candidate) and WHERE the conclusions
   land (state fields, debug log).
4. **Bidirectional.** When `superpowers:systematic-debugging` advances
   to its Phase 4 (Implementation), harness-debug's Phase 4 honours
   that — running the experiment the skill proposed rather than
   inventing its own.
5. **Graceful fallback.** When the skill isn't installed,
   harness-debug uses an inlined version of the skill's four-phase
   prompt, with a banner saying "wrapped skill missing — using
   fallback prompt." Functionality is reduced (no skill updates flow
   through) but the workflow remains intact.

## Error parser format catalog

| Format | Sniff regex | `kind` | Notable fields |
|---|---|---|---|
| Python traceback | `^Traceback \(most recent call last\):` | `python` | `frames[].function`, `rootException.type` |
| V8 / Node.js | `\s+at .+ \(.+:\d+:\d+\)` | `node` | `frames[].column`, `errorName` |
| pytest | `^=+ FAILURES =+` OR `^FAILED` | `pytest` | `frames[].test`, `frames[].file` |
| jest | `^\s+✕ ` OR `Tests:.*failed` | `jest` | `frames[].test`, `expected`/`received` diff |
| node:test | `^# fail \d+` | `node-test` | `frames[].test`, `frames[].diagnostic` |
| rustc | `^error\[E\d+\]:` | `rustc` | `frames[].code`, `frames[].help` |
| tsc | `^.+\(\d+,\d+\): error TS\d+:` | `tsc` | `frames[].code` |
| gcc/clang | `^.+:\d+:\d+: (fatal )?error:` | `cc` | `frames[].file` |
| eslint | `^\s*\d+:\d+\s+(error|warning)` | `eslint` | `frames[].ruleId` |
| go test | `^--- FAIL: ` | `go-test` | `frames[].test` |

Each parser ships a fixture file under
`tests/error-parser/fixtures/<kind>.txt` plus an expected JSON output;
unit tests assert exact match. Adding a new format is a 3-file PR
(sniff entry + parser + fixture pair).

## Testing strategy

| Layer | Tests |
|---|---|
| `lib/state-checkpoint.mjs` | round-trip save/load; hash determinism; atomic write under concurrent writes |
| `lib/error-parser.mjs` | one test per supported format using fixture pairs; ANSI-strip; truncation cap; unknown-format fallback |
| `lib/bisector.mjs` | ddmin on synthetic input lists; git bisect against a throwaway in-test repo |
| `lib/hypothesis-tracker.mjs` | add/select/decide state transitions; nextUntested ordering |
| `lib/repro-suggester.mjs` | candidate selection from synthetic project trees (npm / py / make) |
| `lib/superpowers-bridge.mjs` | isAvailable detection; mock-skill invocation; promptDigest stability |
| Phase integration | scenario tests with a fixture failing repo: Python traceback failure end-to-end, JS test failure end-to-end, regression-shaped failure with git-bisect, vague-input flow via repro-suggester |
| Templates | snapshot tests for `debug-log.md.hbs`, `hypothesis-prompt.md.hbs`, `repro-prompt.md.hbs`, `experiment-summary.md.hbs` × 2 fixtures each |
| Manual checklist | `tests/debug/manual-checklist.md` — 10 items including: `--resume` mid-session, all-hypotheses-rejected loopback, working-tree restoration failure warning, superpowers skill missing fallback |

## Decomposition into sub-projects

| Sub-project | Scope | Estimate |
|---|---|---|
| `debug-core` | plugin shell, state-checkpoint, Phase 0 preflight, Phase 1 skeleton (reproduce + parser dispatch) | 3 days |
| `debug-error-parser` | 5+ format parsers (python, node, pytest, jest, rustc/tsc, cc, eslint); fixture corpus; dispatch table | 5 days |
| `debug-bisector` | ddmin input bisector + git bisect wrapper + Phase 2 | 4 days |
| `debug-hypothesis-tracker` | hypothesis-tracker lib + Phase 3 + Phase 4 + superpowers-bridge integration | 5 days |
| `debug-summariser` | Phase 5 + debug-log.md.hbs + docs/debug/ index management | 2 days |
| Tests + manual checklist | end-to-end harness with fixture failing repos (Python, Node, Rust) | 2 days |

**Total: ~3 weeks.**

## Per-platform port considerations

Like its sibling themes, `harness-debug` may need per-platform
counterparts:

- `harness-debug-codex` — Codex sessions are often shorter and more
  one-shot; the checkpoint mechanism is still valuable but the loop
  with `--resume` matters less. Most of the libs port unchanged; the
  skill rendering layer differs.
- `harness-debug-copilot` — Copilot has `store_memory`, which could
  serve as an alternative persistence backend for `.debug-state.json`
  (skipping the file altogether). Significant rework of state-checkpoint.
- `harness-debug-gemini` — Gemini Extensions surface differently;
  the skill becomes a slash-command equivalent. Error parser libs
  reusable as-is.
- `harness-debug-cursor` — Cursor has built-in test-runner integration;
  Phase 1 reproduce can defer to Cursor's runner UI rather than
  shelling out. Phase 2-5 unchanged.

**Recommendation:** ship Claude-Code-only Theme D first (validate the
hypothesis-state pattern works in practice), then decompose ports per
the standard porting-decomposition spec format.

## Open questions

1. **Working-tree restoration semantics under partial commits.** If
   the user committed an experiment mid-Phase-4 (intentionally or
   accidentally), the `stateHashBefore` no longer matches. Should
   restore-warn escalate to abort? Or offer to `git revert` the
   experimental commit? Current draft: warn loudly, do nothing
   destructive. Confirm with users post-implementation.

2. **How aggressively to truncate `errorParsed.frames`.** Cap at 20
   frames preserves most useful info but discards deep recursion
   tails. Should the cap be configurable per `.debug.json`? Or should
   we keep all frames but stash deep tails in `.debug-artifacts/`
   like the raw log? Lean: 20 is plenty for v1; configurable in v2.

3. **`superpowers:systematic-debugging` version pinning.** If the
   skill bumps prompt structure, `superpowers-bridge.mjs#invoke` may
   parse incorrectly. Track skill version in state and warn on
   mismatch? Or pin a known-good version range in `plugin.json`?

4. **State file size growth across very long sessions.** A 6-hour
   debug session might accumulate 30+ checkpoints, 15+ hypotheses.
   `.debug-state.json` could reach 100KB+, which is fine on disk but
   wasteful to re-load each turn. Should checkpoints older than the
   last verified hypothesis be archived to a cold log? Threshold
   trigger?

5. **Integration with `harness-thrift`.** If both plugins are active,
   thrift's auto-summariser may compact the very turns that
   harness-debug needs to reconstruct hypothesis state. Solution:
   harness-debug writes its state to a file (already in design), so
   summariser pressure is harmless. But: the audit report from thrift
   may need a "debug session active" annotation to avoid double-counting
   tokens.

6. **Detecting "the failure description was wrong" vs "all hypotheses
   wrong."** After N rejected hypotheses with no new ones generated,
   should Phase 4 escalate to "the bug isn't what you think it is" and
   restart Phase 1 with the user's confirmation? What's a sensible N?
   (Draft: N=5 with explicit user prompt.)

7. **Multi-failure investigations.** A test suite failure may reveal
   3 independent bugs. Current design assumes one root cause per
   `.debug-state.json`. Should the file support a `failures[]` array,
   or should users run `/debug` once per failure? Lean: one-per-file
   for v1, document the workflow.

## Recommended next sessions

1. **Spike: error-parser fixture corpus.** ~2 days. Collect 3-5 real
   failure logs per supported format (python, node, pytest, jest,
   rustc, tsc, cc, eslint). Hand-author the expected JSON outputs.
   This corpus drives the rest of the design and surfaces edge cases
   early.

2. **Spike: `superpowers:systematic-debugging` skill API discovery.**
   ~1 day. Can the Skill tool capture the model's reply text inside
   the skill? Or do we have to inline-render the skill's prompt? Outcome
   determines whether `superpowers-bridge.mjs` is a thin wrapper or a
   reimplementation.

3. **Implement debug-core + debug-error-parser.** ~8 days combined.
   These are independent and unlock Phase 1 end-to-end with parsed
   output. Even shipping just these two delivers "structured error in
   state, not in conversation" value.

4. **Implement debug-hypothesis-tracker.** ~5 days. The most novel
   piece. Validate the `.debug-state.json` schema with a real
   debugging session before locking it.

5. **Implement debug-bisector.** ~4 days. Most-mechanical;
   independent of the rest. Can be parallelised with #4.

6. **Implement debug-summariser + ship v0.1.** ~2 days. End-to-end
   useful product; iterate from there based on real-session feedback.

7. **Cross-plugin compatibility audit.** ~1 day. Run a session with
   harness-thrift + harness-floor + harness-debug all active. Confirm
   no hook conflicts, no state file collisions, no double-summarisation
   of debug-state content. Document any required precedence rules.

## Out of scope (this design iteration)

- Implementation of any sub-project.
- Per-platform Theme D ports.
- Web UI / dashboard for debug logs.
- Cross-session debug-log search (`grep docs/debug/` is sufficient for v1).
- Auto-fix or fix-suggestion generation.
- Integration with external bug trackers (Jira / Linear / GitHub Issues).
- Profiler / sampler integration.
- Network-level / distributed-trace debugging.

## Marketplace entry (when implemented)

```json
{
  "name": "harness-debug",
  "source": "./plugins/harness-debug",
  "description": "Theme D — debugging-focused disciplined investigation: reproduce → isolate → hypothesize → verify with structured error parsing, hypothesis state persistence, git/input bisection, and durable debug-log artifacts. Wraps superpowers:systematic-debugging."
}
```
