# harness-debug-codex

Theme E (systematic debugging) ported to Codex CLI. Sibling of
`harness-debug` (Claude Code source-of-truth). Mirrors the six-phase
pipeline while speaking Codex's prompt-level `run /debug` entrypoint and
shell/apply_patch primitive map.

## What it does

- **Enforces a six-phase debugging workflow.** preflight -> reproduce ->
  isolate -> hypothesize -> verify -> summarise. No fix proposals until
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
  `.agent-skill/reports/debug/<date>-<slug>.md` so a later similar bug starts from
  prior knowledge.
- **Wraps (does not replace) `superpowers:systematic-debugging`** when
  that skill is available. The skill remains the source of truth for
  HOW to think; harness-debug-codex supplies WHAT to think about and WHERE
  the conclusions land.

This gives Codex CLI a structured debugging harness around reproduction,
state capture, hypothesis tracking, bisection, and durable summaries.

## Install

From this repository checkout, install the Codex project-local skill:

```bash
./scripts/install-platform.sh --platform=codex --target=/path/to/project --theme=debug
```

Codex `all` installs also include debug:

```bash
./scripts/install-platform.sh --platform=codex --target=/path/to/project --theme=all
```

Then in your project:

```
run /debug "pytest tests/auth/test_login.py::test_valid_login -x"
run /debug --resume
run /debug --skip-isolate "<command>"
```

These public prompt-level entrypoints use the installed `.codex/skills/debug/`
skill. The source directory in this repository remains `skills/debug-codex/` to
identify the Codex implementation.

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

v0.1 — phase docs, state checkpointing, structured error parsing,
hypothesis tracking, bisection helpers, Codex prompt-level entrypoint
contract, and project-local installation into `.codex/skills/debug/`.
Runtime execution is intentionally conservative: large shell output should go
through context-mode when available, and Codex mutating experiments use
`apply_patch` plus explicit tree restoration checks.

## Roadmap

- Additional per-platform ports (`harness-debug-{copilot,gemini,cursor}`).
- v2 schema migration for multi-failure sessions.
- Integration audit with `harness-thrift` summariser pressure.
- Cross-session debug-log search beyond `grep .agent-skill/reports/debug/`.

## References

- `skills/debug/SKILL.md` — entry point
- `skills/debug/references/integration-with-superpowers.md` — Codex-safe superpowers fallback
- `docs/superpowers/specs/2026-05-18-harness-debug-design.md` — source design
