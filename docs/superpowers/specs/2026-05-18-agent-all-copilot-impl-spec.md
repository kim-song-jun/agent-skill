# agent-all-copilot — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `6f9cefe`
**Purpose:** Decompose the remaining implementation work to graduate
`agent-all-copilot` from scaffold to a fully functional orchestrator on
GitHub Copilot CLI.

## Why Copilot is the cleanest programmatic port

GitHub Copilot CLI v0.0.380+ ships a purpose-built `task` tool with explicit
`task({prompt, context})` invocation, `agentId` tracking, and `read_agent` /
`list_agents` introspection. That maps almost 1:1 onto the Claude Code
orchestrator's per-task `Task`-tool dispatch. Most of the porting work is
**primitive substitution**, not redesign.

The two pieces that require real engineering:

1. **Awaiter.** Copilot's `subagentStop` hook is push-based; `list_agents`
   polling is the fallback. We need both with auto-fall-back.
2. **Cost tracking.** `read_agent`'s response shape for `costUSD` is not yet
   verified — we ship both a real reader and a token-count estimator.

Total estimate: **1 week** (decomposition spec line 76).

## What the scaffold currently provides

Shipped in commit `6f9cefe`:

- `plugins/harness-floor-copilot/skills/agent-all-copilot/SKILL.md` —
  description, usage, flags, pipeline table, Copilot primitive map.
- `phases/0-preflight.md` through `phases/6-loop.md` — seven phase docs
  written against Copilot's primitives.
- `templates/agent-all.config.json.hbs` — `.agent-all.json` seed.
- `templates/pr-body.md.hbs` — Phase 5 PR body.
- `lib/ask-user-adapter.mjs` — shared adapter (already implemented).
- `references/porting-notes.md` — Copilot primitive rationale + known
  unknowns.

`bin/init.mjs` exists from the visual-qa work but does not currently install
the agent-all kit — needs extension. The four core `.mjs` lib modules
(config, plan, waves, loop, dispatch, await) are **not yet written**.

## What needs to be implemented

### 1. Lib modules vendored or rewritten

The Claude Code orchestrator has three lib modules
(`plugins/harness-floor/skills/agent-all/lib/{config-loader,wave-builder,loop-evaluator}.mjs`).
Copilot can vendor two unchanged and needs Copilot-specific additions:

- `lib/config-loader.mjs` — vendored as-is from source-of-truth.
- `lib/wave-builder.mjs` — vendored as-is.
- `lib/loop-evaluator.mjs` — vendored as-is.
- `lib/dispatch-task.mjs` — **new.** Wraps a single `task({prompt, context})`
  invocation. Returns `{agentId, ok, error?}`. Coordinator imports + calls
  from within a `read_bash`-driven Node helper, OR the phase doc instructs
  the coordinator to call `task` directly through Copilot's tool surface
  and only use this lib to format the prompt deterministically.
- `lib/await-wave.mjs` — **new.** Two strategies:
  - Hook mode: subscribe to `subagentStop` (registered via Copilot's
    `~/.copilot/hooks.json`), match payload `agentId` against the set the
    coordinator dispatched, resolve when all done.
  - Poll mode: every 2s, call `list_agents`, filter by ids, exit when all
    have status ∈ {completed, failed}.
  Selection: auto-detect at preflight by checking
  `~/.copilot/hooks.json` for an existing `subagentStop` registration.
- `lib/cost-tracker.mjs` — **new.** Reads `costUSD` from each `read_agent`
  payload; if absent, estimates from `output.length * MODEL_RATE_PER_KCHAR`.
  Aggregates per-wave + per-iter totals. Compares against `--max-cost`.
- `lib/memory-bridge.mjs` — **new.** Wraps `store_memory(scope="repository")`
  and `recall_memory` for plan + state persistence. Falls back to
  filesystem if memory quota exceeded.

### 2. Hook installer (`bin/install-hooks.mjs` — new)

Registers `subagentStop` into `~/.copilot/hooks.json` with merge semantics
(don't clobber existing user hooks). The hook payload is forwarded to a
short-lived dispatcher script that appends the `agentId, status, output,
costUSD` JSON line to `<repo>/.copilot/agent-all/inbox.jsonl` for the
coordinator to read.

### 3. `bin/init.mjs` extension

Extend the existing `harness-floor-copilot/bin/init.mjs` (which currently
handles visual-qa) to also install:

- `.agent-all.json` template into `<repo>/.agent-all.json` (skip if exists).
- Lib modules into `<repo>/.copilot/agent-all/lib/` (copied from skill
  directory so the coordinator's `read_bash` can invoke them via
  `node .copilot/agent-all/lib/...`).
- `bin/install-hooks.mjs` invocation (optional, gated on `--with-hooks`).

### 4. Coordinator agent file

Copilot doesn't use `.copilot/agents/` (no formal subagent file format), but
it does honour `.github/copilot-instructions.md`. The init script should
append (or create) an `agent-all` section to that file with the coordinator
prompt — so when a user types `/agent-all-copilot ...` Copilot's planner has
the pipeline rules in context.

### 5. Phase doc tightening

Each phase doc needs shell snippets pointing at the new lib modules:

- Phase 0: `node .copilot/agent-all/lib/config-loader.mjs .agent-all.json`,
  plus a probe for `task` tool availability + `subagentStop` hook presence.
- Phase 1: brainstorm prompts persisted via `store_memory(key="agent-all/intent")`.
- Phase 2: plan written to `docs/superpowers/plans/...` AND mirrored via
  `store_memory(key="agent-all/plan")` for fast subagent reads.
- Phase 3: wave construction via `node .copilot/agent-all/lib/wave-builder.mjs`,
  then explicit `task(...)` calls per wave task, awaiter selected by
  `await-wave.mjs --mode=auto`.
- Phase 4: same dispatch pattern for reviewer `task`s.
- Phase 5: `read_bash`: `git checkout -b <branch>; git push -u origin <branch>; gh pr create ...`.
- Phase 6: `loop-evaluator.mjs` run after each wave; re-enter Phase 1 if
  `continue`.

## File-by-file work breakdown

### `skills/agent-all-copilot/lib/config-loader.mjs`

Vendored copy of `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`.
Zero diff. Same `DEFAULTS`, same `loadConfig` signature. ~55 LoC.

### `skills/agent-all-copilot/lib/wave-builder.mjs`

Vendored copy. Same `buildWaves(tasks, waveConfig) → waves[][]`. ~30 LoC.

### `skills/agent-all-copilot/lib/loop-evaluator.mjs`

Vendored copy. Same `evaluateLoop(state, limits, runner) → {action, ...}`.
~15 LoC.

### `skills/agent-all-copilot/lib/dispatch-task.mjs` (new)

```js
export function buildTaskCall({ task, plan, role, files })
// returns { prompt: string, context: { files, plan_section, role } }
// Coordinator calls Copilot's `task` tool with this payload.
export function parseTaskResult(agentOutput)
// extracts STATUS, COMMITS[], errors[] from the implementer's final message.
```

Difference from Claude Code: Claude's `Task` tool takes `{description,
prompt, subagent_type}`; Copilot's `task` takes `{prompt, context}` and
infers the subagent. We collapse those differences here. ~80 LoC.

### `skills/agent-all-copilot/lib/await-wave.mjs` (new)

```js
export async function awaitWaveHook(agentIds, inboxPath, timeoutMs)
// tails inboxPath, resolves when every id has a terminal status.
export async function awaitWavePoll(agentIds, listAgentsFn, intervalMs, timeoutMs)
// polls listAgentsFn every intervalMs.
export async function awaitWave({ agentIds, strategy = "auto", inboxPath, listAgentsFn })
// auto-selects hook or poll based on inboxPath existence.
```

No Claude Code equivalent — Claude Code's `Task` tool is synchronous from
the orchestrator's POV. Copilot's `task` returns immediately with an
`agentId`. ~140 LoC.

### `skills/agent-all-copilot/lib/cost-tracker.mjs` (new)

```js
export function recordAgentCost(agentId, payload)
// payload from read_agent. Uses payload.costUSD if present, else estimates.
export function waveCost(agentIds) // sum
export function totalCost() // running total across all waves + iters
export function checkBudget(maxCostUSD) // throws if exceeded
```

Difference from Claude Code: Claude Code measures cost in the infrastructure
layer (Anthropic API receipts). Copilot's per-agent cost may or may not be
exposed in `read_agent`. We probe at preflight and downgrade gracefully.
~90 LoC.

### `skills/agent-all-copilot/lib/memory-bridge.mjs` (new)

```js
export async function storeRepoMemory(key, value)
export async function recallRepoMemory(key)
export async function bridgeToFile(key, filePath)
// mirrors memory to a file as fallback insurance.
```

Wraps Copilot's `store_memory` / `recall_memory`. ~60 LoC.

### `bin/install-hooks.mjs` (new)

```bash
node plugins/harness-floor-copilot/bin/install-hooks.mjs \
  --hooks-file ~/.copilot/hooks.json \
  --inbox <repo>/.copilot/agent-all/inbox.jsonl \
  [--force]
```

Reads existing JSON, merges in a `subagentStop` entry pointing at a tiny
dispatcher script (shipped alongside) that `>> inbox.jsonl` the payload.
~100 LoC.

### `bin/init.mjs` extension

Add `installAgentAll(opts)` mirroring the Cursor approach:
- Copy lib modules into `<repo>/.copilot/agent-all/lib/`.
- Render `.agent-all.json` template.
- Append agent-all section to `.github/copilot-instructions.md` (or create).
- Optionally install hooks via `install-hooks.mjs`.

~100 LoC.

### Phase doc tightening

Add shell snippets to phases 0, 2, 3, 4, 6 — each gets a "Shell helpers"
subsection naming the exact `node .copilot/agent-all/lib/...` invocation.
~10 lines per phase × 5 phases = ~50 lines of new doc.

## Test plan

### Unit tests

1. `tests/lib/copilot-agent-all-config-loader.test.mjs` — vendored copy sync
   check.
2. `tests/lib/copilot-agent-all-wave-builder.test.mjs` — same as Claude Code
   test, verifies vendored copy.
3. `tests/lib/copilot-agent-all-dispatch-task.test.mjs` —
   `buildTaskCall` returns expected `{prompt, context}` shape;
   `parseTaskResult` handles STATUS/COMMITS/errors edge cases.
4. `tests/lib/copilot-agent-all-await-wave.test.mjs` — hook mode tails a
   fake inbox file; poll mode against a stub `list_agents` function.
   Both end-states asserted (all-completed, partial failure, timeout).
5. `tests/lib/copilot-agent-all-cost-tracker.test.mjs` — `costUSD` present
   path vs estimate path; budget cap throws.
6. `tests/lib/copilot-agent-all-memory-bridge.test.mjs` — store + recall;
   fallback to file when memory mocked to reject.

### Integration tests

7. `tests/integration/copilot-agent-all-install.test.mjs` — invoke
   `installAgentAll` into tmpdir, assert lib files copied,
   `.github/copilot-instructions.md` updated, idempotency.
8. `tests/integration/copilot-agent-all-hook-install.test.mjs` — invoke
   `install-hooks.mjs` against a fake `hooks.json`, verify merge semantics
   (existing hooks preserved).

### Manual checklist

- [ ] Live Copilot CLI install: confirm `task` tool available
      (`copilot tools list | grep task`).
- [ ] Probe `subagentStop` hook payload shape via `tools.list` RPC; update
      `await-wave.mjs` if differs from `{agentId, status, output, costUSD}`.
- [ ] Run end-to-end against a real repo with a 3-task plan; verify all
      three implementer `task`s ran in parallel; verify reviewer pass; verify
      PR created.
- [ ] Loop mode with `--max-iter=3 --loop --break-condition="npm test"` on
      a deliberately-broken test.

## Effort estimate breakdown

Target: **1 week** (decomposition spec line 76).

| Slice | Work | Hours |
|---|---|---|
| Lib vendoring (3 files) | Copy + sync tests | 2 |
| `dispatch-task.mjs` | New, with `parseTaskResult` edge cases | 5 |
| `await-wave.mjs` | Hook + poll + auto-select | 8 |
| `cost-tracker.mjs` | Read + estimate + budget | 5 |
| `memory-bridge.mjs` | Store/recall + file fallback | 4 |
| `bin/install-hooks.mjs` | JSON merge + dispatcher script | 5 |
| `bin/init.mjs` extension | Renderer + instructions append | 4 |
| Phase doc tightening | Shell snippets in 5 phases | 3 |
| Unit tests (6 files) | All lib coverage | 6 |
| Integration tests (2 files) | Install + hook-install | 3 |
| Manual checklist + buffer | Live Copilot probe + fixes | 5 |
| **Total** | | **50 hr ≈ 1 week** |

## Open questions

1. **`subagentStop` hook payload shape.** The phase docs and `await-wave.mjs`
   assume `{agentId, status, output, costUSD}`. Need live `tools.list` RPC
   probe — added in Copilot v1.0.31. If the shape differs, the dispatcher
   script in `install-hooks.mjs` needs to translate. **Spike before
   implementation.**

2. **`task` tool maxConcurrency.** Unknown whether Copilot caps concurrent
   `task` invocations per session. If so, `wave.maxParallel` should clamp.
   `await-wave.mjs` already serializes within a wave so no race risk, but
   if the cap is `< maxParallel` we get implicit serialization at the
   Copilot layer. **Probe in Phase 0 preflight; report in summary.**

3. **`store_memory` scope=repository TTL.** Unspecified. If memory evicts
   mid-run, `memory-bridge.mjs` falls back to file — but the coordinator
   needs to know about eviction to avoid stale reads. Mitigation: always
   write to memory **and** file; on read, prefer memory and validate
   against file timestamp. **Decide before implementing memory-bridge.**

4. **`read_agent` cost field.** May or may not exist. `cost-tracker.mjs`
   handles both paths but the estimate-path heuristic
   (`output.length * MODEL_RATE`) is crude — real per-token counting
   requires the agent's transcript, which `read_agent` may or may not
   include. **Defer accurate cost to a follow-up; warn in scaffold-phase.**

5. **Hook registration is global.** `subagentStop` in `~/.copilot/hooks.json`
   fires for every Copilot session, not just `agent-all-copilot` runs. The
   dispatcher script needs to no-op when the inbox path doesn't exist
   (i.e., no active agent-all run). Easy but worth documenting.

6. **Plan-writer integration.** Claude Code uses `superpowers:writing-plans`.
   Copilot has no equivalent skill. Phase 2 currently says "coordinator
   drafts inline + persist to store_memory". Quality varies by model.
   Should we ship a Copilot-flavored writing-plans skill? Likely deferred
   to a separate cross-cutting iteration.

7. **`subagentStop` fires on failure too.** Distinguishing "agent failed
   gracefully" from "agent crashed mid-task" requires the hook payload's
   `status` field. If absent, we treat any non-`completed` as `blocked`
   and let the reviewer phase decide.

## Acceptance criteria

- [ ] `node plugins/harness-floor-copilot/bin/init.mjs --skill=agent-all
      --target=<dir>` installs lib files, config template, and
      `.github/copilot-instructions.md` entry.
- [ ] `node plugins/harness-floor-copilot/bin/install-hooks.mjs` registers
      `subagentStop` without clobbering existing hooks; second invocation
      is a no-op.
- [ ] All 6 unit tests + 2 integration tests pass under `npm test`.
- [ ] `lib/config-loader.mjs`, `lib/wave-builder.mjs`, `lib/loop-evaluator.mjs`
      have identical exports and behaviour as the Claude Code source-of-truth
      (snapshot-tested).
- [ ] `lib/await-wave.mjs` correctly resolves when given a fake inbox AND
      when given a stub `list_agents`; correctly times out at the configured
      limit.
- [ ] `lib/cost-tracker.mjs` aggregates per-wave + per-iter totals; throws
      on budget overrun.
- [ ] Manual end-to-end test in a live Copilot session completes a 3-task
      plan with parallel `task` dispatch + reviewer pass + PR creation.
- [ ] `references/porting-notes.md` updated with live confirmation of
      `subagentStop` payload, `task` concurrency cap, and `read_agent` cost
      field availability.
- [ ] No changes to `plugins/harness-floor/skills/agent-all/`.
- [ ] CHANGELOG entry added under a `Copilot agent-all graduation` heading.
