# harness-debug

Theme D — debugging-focused disciplined investigation for Claude Code.
Sits alongside Theme A (`harness-builder`, scaffolding), Theme B
(`harness-thrift`, cost-conscious), and Theme C (`harness-floor`,
cost-unrestricted multi-agent).

## What it does

- **Enforces a six-phase debugging workflow.** preflight → reproduce →
  isolate → hypothesize → verify → summarise. No fix proposals until
  the failure is reproduced and hypotheses enumerated.
- **Parses common error output into structured form.** Python
  tracebacks, JS / V8 stack traces, pytest, jest, node:test, rustc,
  tsc, gcc/clang, ESLint, generic exit codes. The structured frames
  live in `.debug-state.json`, not the rolling conversation.
- **Persists hypothesis state.** Every hypothesis proposed, its
  status (`untested` / `verified` / `rejected` / `partial`), the
  experiment run, and the result. Survives session boundaries via
  `--resume`.
- **Bisects.** Git history bisection for regressions; ddmin-style
  input bisection for shrinking failing inputs.
- **Writes a durable artifact.** Phase 5 emits
  `docs/debug/<date>-<slug>.md` so a future similar bug starts from
  prior knowledge.
- **Wraps (does not replace) `superpowers:systematic-debugging`** when
  that skill is available. The skill remains the source of truth for
  HOW to think; harness-debug supplies WHAT to think about and WHERE
  the conclusions land.

This gives Claude Code a structured debugging harness around reproduction,
state capture, hypothesis tracking, bisection, and durable summaries.

## Install

Once registered in the marketplace:

```
/plugin install harness-debug@<marketplace>
```

Then in your project:

```
/debug "pytest tests/auth/test_login.py::test_valid_login -x"
/debug --resume
/debug --skip-isolate "<command>"
```

## Configuration

State file `.debug-state.json` at project root. Schema in
`docs/superpowers/specs/2026-05-18-harness-debug-design.md`. No
user-edited config file is required for v0.1; defaults are inlined.

## Release surface

- debug-core: state checkpointing, error-parser dispatch, and Phase 0/1
  workflow entry.
- debug-error-parser: 10 format parsers for python, node, pytest, jest,
  node-test, rustc, tsc, cc, eslint, generic-exit)
- debug-bisector: ddmin input bisection and git bisect wrapper.
- debug-hypothesis-tracker: add, decide, and promote hypothesis state.
- debug-repro-suggester: Phase 1 vague-input clarifier.
- debug-summariser: Phase 5 markdown log writer.

## Status

The Claude Code debug surface matches
`docs/superpowers/specs/2026-05-18-harness-debug-design.md`; unit tests cover
the shipped lib modules and parsers.

## Future work

- Per-platform ports (`harness-debug-{codex,copilot,gemini,cursor}`).
- v2 schema migration for multi-failure sessions.
- Integration audit with `harness-thrift` summariser pressure.
- Cross-session debug-log search beyond `grep docs/debug/`.
