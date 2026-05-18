# agent-all-codex — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `9d66300`
**Purpose:** Decompose the remaining implementation work to graduate
`agent-all-codex` from scaffold to a functional orchestrator on Codex CLI,
including the `agent` hook research spike that gates the preferred dispatch
path.

## Why Codex needs two dispatch strategies

Codex's hook handler types include `agent` (per `codex-rs/config/src/hook_config.rs`
`HookHandler::Agent`), but it is unconfirmed whether the handler is invokable
from user code (i.e., parent agent calls `dispatch_agent("...")` programmatically)
or strictly fires on hook-side events. Until that's resolved with a live CLI:

- **Preferred (when verified):** `agent` hook fires per wave-task; coordinator
  awaits via `codex agent wait --task-prefix`.
- **Fallback (always works):** sequential invocation of
  `.codex/skills/<role>/SKILL.md` per wave task via Codex's `Skill: <role>`
  invocation surface. ~3-5x slower but no research dependency.

Auto-detected at preflight by probing `~/.codex/config.toml` for an
`[[hooks.agent]]` entry. Explicit override via `--dispatch=agent-hook|sequential`.

Total estimate: **1 week** (decomposition spec line 76).

## What the scaffold currently provides

Shipped in commit `9d66300`:

- `plugins/harness-floor-codex/skills/agent-all-codex/SKILL.md` — front-matter,
  usage, flags including `--dispatch=...`, pipeline table, Codex primitive map.
- `phases/0-preflight.md` through `phases/6-loop.md` — seven phase docs.
- `templates/agent-all.config.json.hbs` — `.agent-all.json` seed.
- `templates/codex-hooks-snippet.toml.hbs` — `[[hooks.agent]]` template (assumed
  syntax; pending verification).
- `templates/pr-body.md.hbs` — Phase 5 PR body.
- `lib/ask-user-adapter.mjs` — shared adapter (already implemented).
- `references/porting-notes.md` — research-spike status, sequential fallback
  rationale.

`bin/init.mjs` exists from the visual-qa work; does not yet install the
agent-all kit. The lib modules and dispatcher scripts are **not yet
written**.

## What needs to be implemented

### 1. Research spike (2 days, blocks the rest)

Land a `references/codex-agent-hook-spike.md` document recording:

- Exact TOML syntax that Codex accepts (`[[hooks.agent]]` vs `[hooks.agent]`).
- Whether `agent` hook is invokable from user code or only fires reactively.
- Whether `codex agent dispatch <task>` / `codex agent wait --task-prefix=<>`
  exist as CLI subcommands, or whether the equivalents are exposed via
  Codex's tool surface.
- Per-agent cost reporting shape (in `wait` response or via separate RPC).

Until the spike completes, the sequential path is the only one that can be
shipped. Spike results gate work on dispatcher + awaiter lib modules.

### 2. Lib modules

- `lib/config-loader.mjs` — vendored from source-of-truth, zero diff.
- `lib/wave-builder.mjs` — vendored from source-of-truth, zero diff.
- `lib/loop-evaluator.mjs` — vendored from source-of-truth, zero diff.
- `lib/dispatch-agent-hook.mjs` — **new (post-spike).** Wraps the
  `agent` hook invocation primitive. Returns `{taskPrefix, started}`.
- `lib/dispatch-sequential.mjs` — **new.** Iterates wave tasks, invokes
  `.codex/skills/<role>/SKILL.md` via Codex's `Skill: <role>` text emission.
  Coordinator parses the per-task result from the skill's final message.
- `lib/await-wave.mjs` — **new.** Two modes:
  - hook mode: `codex agent wait --task-prefix <prefix>` (or whatever the
    spike confirms).
  - sequential mode: no-op (sequential dispatcher is synchronous).
- `lib/cost-tracker.mjs` — **new.** Reads costUSD from wait response if
  exposed; else estimates from token counts via codex's `/cost` telemetry
  file.
- `lib/state-atomic.mjs` — **new.** Codex has no native atomic write
  helper; this wraps `apply_patch` with temp + rename semantics for
  `.agent-all-state.json`.

### 3. Hook installer (`bin/install-hook.mjs` — new)

Merges `[[hooks.agent]]` (or whatever the spike confirms) into
`~/.codex/config.toml` without clobbering existing TOML. Uses a minimal
TOML parser (e.g., `@iarna/toml`) since the file likely contains other
hook configurations.

### 4. `bin/init.mjs` extension

Extend `harness-floor-codex/bin/init.mjs` to:

- Render `.agent-all.json` template into `<repo>/.agent-all.json`.
- Copy lib modules into `<repo>/.codex/agent-all/lib/`.
- Seed `.codex/skills/<role>/SKILL.md` stubs for each role that
  `wave-builder` references (e.g., `dev`, `frontend-dev`, `reviewer`, etc.)
  unless they already exist.
- Optional `--with-hook` flag invokes `install-hook.mjs`.

### 5. Phase doc tightening

Each phase doc gains shell snippets for the new lib modules:

- Phase 0: config-loader + dispatch-strategy auto-detect probe
  (`grep "\[\[hooks.agent\]\]" ~/.codex/config.toml` or equivalent).
- Phase 2: plan written via `apply_patch`; mirrored to state via
  `state-atomic.mjs`.
- Phase 3: wave-build inline; dispatcher selected by strategy; awaiter
  runs after dispatch.
- Phase 4: same dispatch pattern for reviewer skills.
- Phase 5: `shell_command` for git + `gh pr create` (timeout extended to
  300s per scaffold SKILL.md).
- Phase 6: `loop-evaluator` after each iter; `shell_command` for
  breakCondition.

## File-by-file work breakdown

### `skills/agent-all-codex/lib/config-loader.mjs`

Vendored copy. Identical to source-of-truth. ~55 LoC.

### `skills/agent-all-codex/lib/wave-builder.mjs`

Vendored copy. ~30 LoC.

### `skills/agent-all-codex/lib/loop-evaluator.mjs`

Vendored copy. ~15 LoC.

### `skills/agent-all-codex/lib/dispatch-agent-hook.mjs` (new, post-spike)

```js
export function buildAgentInvocation({ task, plan, role, files })
// returns the payload Codex's `agent` hook expects — exact shape TBD.
export async function dispatchAgent(invocation, codexBin = "codex")
// returns { taskPrefix, started }
```

Difference from Claude Code: Claude's `Task` tool returns a result synchronously
from the orchestrator's view. Codex's `agent` hook fires-and-forgets; the
awaiter is separate. ~90 LoC (assuming spike-confirmed contract).

### `skills/agent-all-codex/lib/dispatch-sequential.mjs` (new)

```js
export function buildSkillInvocation({ task, plan, role, files })
// returns the text the coordinator should emit to trigger
// `Skill: <role>` invocation on Codex's surface.
export function parseSkillResult(skillOutput)
// extracts STATUS, COMMITS[], errors[].
```

No Claude Code equivalent (Claude Code never serializes wave tasks). ~80 LoC.

### `skills/agent-all-codex/lib/await-wave.mjs` (new)

```js
export async function awaitWaveHook(taskPrefix, timeoutMs, codexBin)
// spawns `codex agent wait --task-prefix <prefix> --json`,
// resolves on JSON payload.
export async function awaitWaveSequential(/* no-op */)
export async function awaitWave({ strategy, ...args })
```

~80 LoC.

### `skills/agent-all-codex/lib/cost-tracker.mjs` (new)

Similar to Copilot version but reads from `codex /cost` telemetry file or
from wait-response payload (TBD per spike). ~90 LoC.

### `skills/agent-all-codex/lib/state-atomic.mjs` (new)

```js
export function buildPatchForState(prevState, newState)
// returns the patch hunk that apply_patch consumes,
// targeting <path>.tmp; coordinator then runs `shell_command: mv <path>.tmp <path>`.
```

~50 LoC.

### `bin/install-hook.mjs` (new)

```bash
node plugins/harness-floor-codex/bin/install-hook.mjs \
  --config-toml ~/.codex/config.toml [--force]
```

Uses `@iarna/toml` to parse, merges in the agent hook entry, writes back.
Idempotent. ~120 LoC.

### `bin/init.mjs` extension

`installAgentAll(opts)` — render template, copy libs, seed role-skill
stubs, optional hook install. ~120 LoC.

### Phase doc tightening

Add shell snippets to phases 0, 2, 3, 4, 5, 6. ~10 lines × 6 = ~60 lines.

### `references/codex-agent-hook-spike.md` (new)

Research notes from the 2-day spike. ~200 lines (verbatim CLI output, schema
findings, syntax decisions).

## Test plan

### Unit tests

1. `tests/lib/codex-agent-all-config-loader.test.mjs` — vendored sync check.
2. `tests/lib/codex-agent-all-wave-builder.test.mjs` — vendored sync check.
3. `tests/lib/codex-agent-all-dispatch-sequential.test.mjs` —
   `buildSkillInvocation` shape + `parseSkillResult` edge cases.
4. `tests/lib/codex-agent-all-await-wave.test.mjs` — hook mode against a
   mocked `codex agent wait` (stub child_process); sequential mode no-op.
5. `tests/lib/codex-agent-all-cost-tracker.test.mjs` — both wait-response
   and telemetry-file paths.
6. `tests/lib/codex-agent-all-state-atomic.test.mjs` — patch shape; round-
   trip through apply_patch simulator.

### Integration tests

7. `tests/integration/codex-agent-all-install.test.mjs` — `installAgentAll`
   into tmpdir; lib copy + config render + skill-stub seeding.
8. `tests/integration/codex-agent-all-hook-install.test.mjs` — `install-hook.mjs`
   against fixture `config.toml` with existing hooks; verify merge.

### Manual checklist

- [ ] Research spike: probe live Codex CLI for `agent` hook syntax + behaviour.
      Record in `codex-agent-hook-spike.md`.
- [ ] Sequential-only end-to-end smoke test (works regardless of spike
      results).
- [ ] If spike succeeds: agent-hook end-to-end on a 3-task plan; verify
      parallel dispatch.
- [ ] Hook install merge: verify existing user hooks preserved.
- [ ] Loop mode + breakCondition.

## Effort estimate breakdown

Target: **1 week** (decomposition spec line 76).

| Slice | Work | Hours |
|---|---|---|
| Research spike | Live Codex CLI probe + write `codex-agent-hook-spike.md` | 12 |
| Lib vendoring (3 files) | Copy + sync tests | 2 |
| `dispatch-sequential.mjs` | New | 4 |
| `dispatch-agent-hook.mjs` | Post-spike, contingent on findings | 5 |
| `await-wave.mjs` | Hook + sequential modes | 5 |
| `cost-tracker.mjs` | Two-path reader | 4 |
| `state-atomic.mjs` | apply_patch wrapper | 3 |
| `bin/install-hook.mjs` | TOML merge | 4 |
| `bin/init.mjs` extension | Renderer + role-stub seeding | 4 |
| Phase doc tightening | Shell snippets × 6 phases | 3 |
| Unit tests (6 files) | All lib coverage | 6 |
| Integration tests (2 files) | Install + hook-install | 3 |
| Manual checklist + buffer | Spike validation + E2E | 5 |
| **Total** | | **60 hr ≈ 1 week (with spike buffer)** |

## Open questions

1. **`agent` hook invocation contract.** The decomposition spec line 24-26
   flags this as the central unknown. The phase docs and lib modules assume
   it's user-invokable; if it's strictly reactive (fires on parent→child
   events from some other system), `dispatch-agent-hook.mjs` can't be
   written and the port collapses to sequential-only. **Spike before
   anything else.**

2. **`codex agent dispatch` / `codex agent wait` CLI subcommands.** Assumed
   to exist; not verified. If absent, the dispatcher emits text that the
   coordinator forwards to Codex's tool surface (and Codex's runtime
   routes to the hook). **Spike output decides.**

3. **TOML hook block syntax.** `[[hooks.agent]]` is the porting-notes
   assumption (line 12). Codex may want `[hooks] agent = [...]` matching
   the existing `PreToolUse` / `SessionStart` shape. The hook installer
   needs the right shape or `~/.codex/config.toml` corrupts. **Spike
   output is canonical.**

4. **Cost reporting.** Wait-response may or may not include `costUSD`.
   `codex /cost` telemetry file is the fallback but its path and JSON
   shape are unverified. **Spike.**

5. **Role-skill stub seeding.** `bin/init.mjs` seeds `.codex/skills/<role>/SKILL.md`
   stubs for every role wave-builder may reference. If users already have
   richer skill files for these roles, do we overwrite or skip? **Skip
   unless `--force`; print a diff so users can manually merge if desired.**

6. **`apply_patch` atomicity.** Codex's `apply_patch` writes to the target
   directly; there's no built-in temp+rename. Our `state-atomic.mjs`
   simulates by writing to `<path>.tmp` then `shell_command: mv`. Risk:
   if the coordinator crashes between patch and mv, `<path>.tmp` lingers.
   Mitigation: Phase 0 cleans up stale `.tmp` files.

7. **Skill-roster path for sequential dispatch.** Codex resolves
   `Skill: <role>` against some search path. If the path doesn't include
   `<repo>/.codex/skills/`, the sequential dispatcher can't find seeded
   stubs. Need to confirm with the spike or document a required env var.

8. **Hybrid strategy.** Porting notes line 81 mentions `--dispatch=hybrid`
   (try agent-hook per task, fall back per-failure to sequential). Out of
   scope for this iteration but called out for follow-up.

## Acceptance criteria

- [ ] `references/codex-agent-hook-spike.md` exists and documents:
      `agent` hook invocation contract, CLI subcommand shape, cost reporting,
      TOML syntax.
- [ ] `node plugins/harness-floor-codex/bin/init.mjs --skill=agent-all
      --target=<dir>` installs config, libs, role-skill stubs.
- [ ] `node plugins/harness-floor-codex/bin/install-hook.mjs` merges the
      hook into `~/.codex/config.toml` without clobbering; idempotent.
- [ ] All 6 unit tests + 2 integration tests pass under `npm test`.
- [ ] Vendored libs (`config-loader`, `wave-builder`, `loop-evaluator`)
      match source-of-truth byte-for-byte.
- [ ] Sequential dispatch works end-to-end on a 3-task plan in a real Codex
      CLI session (slow but functional).
- [ ] If spike confirms agent-hook is invokable: agent-hook dispatch works
      end-to-end with measurable parallelism.
- [ ] `references/porting-notes.md` updated to reference the spike file and
      remove "unconfirmed" caveats where confirmed.
- [ ] No changes to `plugins/harness-floor/skills/agent-all/`.
- [ ] CHANGELOG entry under a `Codex agent-all graduation` heading.
