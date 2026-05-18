# agent-all-gemini — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `99eec12`
**Purpose:** Decompose the remaining implementation work to graduate
`agent-all-gemini` from scaffold to a functional orchestrator on Gemini CLI,
including the subprocess-dispatch machinery that no other platform requires.

## Why Gemini is the heaviest port

Gemini CLI has **no native subagent dispatch primitive** as of 2026-05. The
options considered (per `references/porting-notes.md`):

| Option | Verdict | Why |
|---|---|---|
| Spawn N parallel `gemini chat` subprocesses | **CHOSEN** | Works today; isolation; portable |
| `activate_skill` chained sequentially | Rejected | Loses parallelism |
| Custom MCP server emulating dispatch | Rejected | Heavy; brittle |
| Wait for native subagents | Rejected | Indefinite timeline |

Subprocess dispatch gets us isolation + parallelism but introduces IPC
complexity, tmp-file race risk, cleanup concerns, and partial-failure
semantics (subprocess crashes mid-write → corrupt JSON) that the other
three platforms don't face.

Total estimate: **1.5 weeks** (decomposition spec line 78).

## What the scaffold currently provides

Shipped in commit `99eec12` (and the related `b0e5d6b` for the subprocess
dispatch libs):

- `plugins/harness-floor-gemini/skills/agent-all-gemini/SKILL.md` — usage,
  Gemini-specific flags (`--subprocess-timeout`, `--max-subprocesses`),
  pipeline table, primitive map.
- `phases/0-preflight.md` through `phases/6-loop.md` — seven phase docs.
- `templates/agent-all.config.json.hbs` — `.agent-all.json` seed.
- `templates/pr-body.md.hbs`.
- `lib/ask-user-adapter.mjs` — shared adapter (already implemented).
- `references/porting-notes.md` — subprocess strategy rationale, open
  research questions, why-this-is-heaviest analysis.
- `bin/spawn-wave.mjs` (160 LoC) — **prototype** wave dispatcher for the
  Phase 3 fan-out. Already runs `gemini chat` subprocesses, but the
  `--output-json` flag is assumed unverified; needs hardening + tests.
- `bin/spawn-page-subagent.mjs` (174 LoC) — analogous prototype used by
  visual-qa-gemini Phase 3. Listed here because it shares the same
  IPC/cleanup primitives.

`bin/init.mjs` exists from visual-qa; does not yet install the agent-all kit.
Lib modules for config/wave/loop/cost/tmp-GC are not yet written.

## What needs to be implemented

### 1. Lib modules

- `lib/config-loader.mjs` — vendored, zero diff.
- `lib/wave-builder.mjs` — vendored, zero diff.
- `lib/loop-evaluator.mjs` — vendored, zero diff.
- `lib/ipc-tmp.mjs` — **new.** Manages `/tmp/agent-all/wave-<i>/task-<id>.json`
  layout. Per-wave + per-task subdirs to avoid race. Exports `tmpDirForWave`,
  `tmpFileForTask`, `gcTmp(beforeMs)`.
- `lib/cost-tracker.mjs` — **new.** Parses `--output-json` payloads from
  each subprocess; falls back to transcript-length × MODEL_RATE.
- `lib/state-atomic.mjs` — **new.** `write_file` + `run_shell_command: mv`
  for `.agent-all-state.json`.
- `lib/subprocess-result-parser.mjs` — **new.** Reads tmp JSON, validates
  schema, returns `{taskId, status, commits[], costUSD?, errors[]}`. Handles
  the `crashed mid-write → corrupt JSON` case by treating SyntaxError as
  `status: failed`.

### 2. Harden existing `bin/spawn-wave.mjs`

The prototype already exists. Needs:

- Confirm `gemini chat --output-json` flag against a live Gemini CLI. If
  absent, add stdout-parsing fallback with `---JSON-RESULT---` / `---END---`
  sentinels.
- Confirm `--skill-roster <dir>` flag syntax (porting-notes line 60).
- Add timeout-kill handling: SIGTERM after `--timeout`; SIGKILL after
  `--timeout + 5s`.
- Add concurrent-cap clamp: `Math.min(wave.length, args.maxParallel)`.
- Per-task tmp file isolation per the `ipc-tmp.mjs` layout.
- Cost extraction via `cost-tracker.mjs`.
- Exit code: 0 if all completed; 1 if any failed; 2 if internal error.

### 3. Tmp-dir GC hook

Register a `Stop` hook in `~/.gemini/settings.json` that runs
`node .gemini/agent-all/lib/ipc-tmp.mjs --gc` after Gemini exits. Backstop
for any subprocess that didn't get to clean up its own tmp file.

### 4. `bin/init.mjs` extension

- Render `.agent-all.json` template into `<repo>/.agent-all.json`.
- Copy libs into `<repo>/.gemini/agent-all/lib/`.
- Render `gemini-extension.json` skill registration so `/agent-all-gemini`
  invokes the right SKILL.md.
- Optional `--with-gc-hook` flag invokes a hook installer.

### 5. Hook installer (`bin/install-gc-hook.mjs` — new)

Merges `Stop` hook entry into `~/.gemini/settings.json` JSON without
clobbering other hooks. ~80 LoC.

### 6. Phase doc tightening

Each phase doc gains shell snippets:

- Phase 0: config-loader + `gemini --version` probe + tmp-dir creation.
- Phase 2: plan written via `write_file`; mirrored via `state-atomic.mjs`.
- Phase 3: `node .gemini/agent-all/bin/spawn-wave.mjs --wave <path> --tmp ...`.
- Phase 4: same dispatcher for reviewer wave.
- Phase 5: `run_shell_command`: git push + `gh pr create`.
- Phase 6: `loop-evaluator` + tmp GC between iters.

## File-by-file work breakdown

### `skills/agent-all-gemini/lib/config-loader.mjs`

Vendored. ~55 LoC.

### `skills/agent-all-gemini/lib/wave-builder.mjs`

Vendored. ~30 LoC.

### `skills/agent-all-gemini/lib/loop-evaluator.mjs`

Vendored. ~15 LoC.

### `skills/agent-all-gemini/lib/ipc-tmp.mjs` (new)

```js
export function tmpDirForWave(rootTmp, waveIdx)
export function tmpFileForTask(rootTmp, waveIdx, taskId)
export function ensureTmpDir(path)
export function gcTmp(rootTmp, olderThanMs)
// removes wave-* subdirs older than threshold.
```

Difference from Claude Code: Claude Code's orchestrator never marshals
results through tmp files — `Task` returns the result string directly.
Gemini's subprocess model requires this entire IPC layer. ~80 LoC.

### `skills/agent-all-gemini/lib/cost-tracker.mjs` (new)

```js
export function parseJsonCost(payload) // returns USD if present
export function estimateFromTranscript(text, modelRate) // fallback
export function accumulateWaveCost(taskResults)
export function checkBudget(total, maxCostUSD)
```

~100 LoC.

### `skills/agent-all-gemini/lib/state-atomic.mjs` (new)

```js
export async function writeStateAtomic(path, state)
// writes via Node fs to <path>.tmp; renames atomically.
// Coordinator can either invoke this from bin context OR
// emit equivalent write_file + run_shell_command: mv pair.
```

~40 LoC.

### `skills/agent-all-gemini/lib/subprocess-result-parser.mjs` (new)

```js
export function parseTaskResultFile(jsonPath)
// JSON.parse with try/catch; SyntaxError → { status: "failed", errors: ["corrupt JSON"] }.
// Also tolerates missing-file → { status: "failed", errors: ["no result file"] }.
```

~50 LoC. Critical for partial-failure semantics (per porting-notes line 100).

### `bin/spawn-wave.mjs` (already exists; needs hardening)

Current: 160 LoC prototype. Add:

- `--output-json` fallback with sentinel parsing (~30 LoC).
- Timeout-kill + SIGKILL escalation (~20 LoC).
- Concurrent-cap clamp (~10 LoC).
- Integration with `ipc-tmp.mjs` for paths (~15 LoC).
- Integration with `cost-tracker.mjs` for per-task cost (~10 LoC).
- Integration with `subprocess-result-parser.mjs` for result reads
  (~15 LoC).

Post-hardening size: ~260 LoC.

### `bin/install-gc-hook.mjs` (new)

Merges `Stop` hook into `~/.gemini/settings.json`. ~80 LoC.

### `bin/init.mjs` extension

`installAgentAll(opts)` — render config, copy libs, render
`gemini-extension.json` skill entry, optional GC hook install. ~100 LoC.

### `gemini-extension.json` extension

Already exists for visual-qa. Add `/agent-all-gemini` skill registration:
```json
{ "skills": [{ "name": "agent-all-gemini", "path": "skills/agent-all-gemini/SKILL.md" }] }
```

### Phase doc tightening

Shell snippets in phases 0, 2, 3, 4, 5, 6. ~10 lines × 6 = ~60 lines.

## Test plan

### Unit tests

1. `tests/lib/gemini-agent-all-config-loader.test.mjs` — vendored sync.
2. `tests/lib/gemini-agent-all-wave-builder.test.mjs` — vendored sync.
3. `tests/lib/gemini-agent-all-ipc-tmp.test.mjs` — path generation; GC
   removes old dirs; preserves recent.
4. `tests/lib/gemini-agent-all-cost-tracker.test.mjs` — JSON path; estimate
   path; budget check.
5. `tests/lib/gemini-agent-all-state-atomic.test.mjs` — atomic rename;
   interrupted write doesn't corrupt target.
6. `tests/lib/gemini-agent-all-subprocess-result-parser.test.mjs` — valid
   JSON; corrupt JSON; missing file; partial write (`{"status":"complete`).

### Integration tests

7. `tests/integration/gemini-spawn-wave.test.mjs` — drive `bin/spawn-wave.mjs`
   with a stub `gemini` binary (a small shell script that emits JSON to the
   expected tmp file). Verify:
   - parallel dispatch (timing assertion)
   - timeout-kill (stub that sleeps forever; verify SIGTERM + SIGKILL)
   - corrupt-output handling
   - cost extraction
8. `tests/integration/gemini-agent-all-install.test.mjs` — `installAgentAll`
   into tmpdir; libs + config + skill entry render.
9. `tests/integration/gemini-agent-all-gc-hook-install.test.mjs` — install
   into fixture `settings.json`; merge; idempotency.

### Stress test

10. `tests/stress/gemini-spawn-wave-races.test.mjs` — spawn 8 stub
    subprocesses concurrently, each writing to its own tmp file. Run 100
    iterations; assert zero result-collisions, zero missing files.

### Manual checklist

- [ ] Confirm `gemini chat --output-json` flag against live Gemini CLI.
- [ ] Confirm `--skill-roster <dir>` flag syntax.
- [ ] End-to-end with a 3-task plan; observe parallel subprocesses in `ps`;
      verify tmp dir contents.
- [ ] Force a subprocess crash mid-task; verify partial-failure path; verify
      coordinator continues with other tasks.
- [ ] Loop mode + tmp GC between iters.
- [ ] Disk-space stress: large matrix; verify slug dir grows but tmp dir
      stays bounded.

## Effort estimate breakdown

Target: **1.5 weeks (~7-8 working days, 56-64 hr)** per decomposition spec
line 78.

| Slice | Work | Hours |
|---|---|---|
| Live Gemini CLI flag verification | `--output-json`, `--skill-roster`; document in porting-notes | 6 |
| Lib vendoring (3 files) | Copy + sync tests | 2 |
| `ipc-tmp.mjs` | New | 4 |
| `cost-tracker.mjs` | Two-path | 4 |
| `state-atomic.mjs` | Atomic wrap | 3 |
| `subprocess-result-parser.mjs` | Edge-case handling | 4 |
| `bin/spawn-wave.mjs` hardening | Fallback + timeout + integration | 8 |
| `bin/install-gc-hook.mjs` | JSON merge | 4 |
| `bin/init.mjs` extension | Renderer | 4 |
| Phase doc tightening | Shell snippets × 6 phases | 3 |
| Unit tests (6 files) | All lib coverage | 6 |
| Integration tests (3 files) | spawn-wave, install, hook | 5 |
| Stress test (1 file) | Race conditions | 4 |
| Manual checklist + buffer | E2E + flag confirmation + fixes | 7 |
| **Total** | | **64 hr ≈ 1.5 weeks** |

## Open questions

1. **`gemini chat --output-json` flag.** Phase docs assume this exists.
   Stdout-sentinel fallback is implementable but uglier. **Live CLI probe
   blocks `cost-tracker.mjs` finalisation.**

2. **`gemini chat --skill-roster <dir>` flag syntax.** May be `--skills-dir`
   or `--rule-dir`. Subprocesses need to find the right skill roster or
   they invoke the wrong implementer logic. **Live CLI probe blocks
   `spawn-wave.mjs` hardening.**

3. **Per-subprocess token cost.** Even with `--output-json`, the payload
   schema may not include `costUSD`. Fallback heuristic uses transcript
   length, which is crude. **Acceptable for MVP; flag as best-effort in
   summary output.**

4. **Concurrent subprocess rate limits.** Some Gemini API tiers cap parallel
   requests. `--max-subprocesses=8` default is a guess. Should we probe at
   preflight? Probably not — Gemini doesn't expose plan-tier via API.
   **Document in install README; users adjust by config.**

5. **Tmp dir race conditions.** Per-wave + per-task subdirectories should
   eliminate collisions, but the stress test (test #10) is the real proof.
   **Block release until stress test passes 100 iters with zero races.**

6. **MCP session contention.** `agent-all-gemini` itself doesn't use MCP,
   but if subprocesses inherit the parent's MCP server connections, browser
   handles may collide. The Phase 3 doc explicitly tells subprocesses NOT
   to use MCP (only the parent does). **Document and enforce in subprocess
   prompt template.**

7. **`Stop` hook scope.** The GC hook fires for every Gemini session, not
   just agent-all runs. The handler must no-op when the per-run tmp dir
   doesn't exist. Easy but worth a test.

8. **Lock-file contention across subprocesses.** Parallel implementers may
   race on `package-lock.json`. Subprocess implementer template should
   fail fast with `STATUS: blocked, REASON: lock conflict` so the
   coordinator can sequentialise retries.

9. **`bin/spawn-wave.mjs` and `bin/spawn-page-subagent.mjs` overlap.**
   Both use the same IPC + cost + subprocess patterns. Should we extract
   a shared `bin/lib/subprocess-runner.mjs`? **Yes, after both modules
   stabilise.** Tracked as follow-up.

10. **Loop continue from in-process.** Phase 6's loop re-enters Phase 1
    inside the same session. For Gemini, this works but each iter spawns
    a fresh wave of subprocesses — memory pressure from accumulated
    Playwright contexts (if visual-qa is invoked in the loop body) can
    OOM. **Document and test bounded iters.**

## Acceptance criteria

- [ ] `node plugins/harness-floor-gemini/bin/init.mjs --skill=agent-all
      --target=<dir>` installs config, libs, gemini-extension entry.
- [ ] `node plugins/harness-floor-gemini/bin/install-gc-hook.mjs` merges
      the Stop hook; idempotent.
- [ ] `node bin/spawn-wave.mjs --dry-run --wave <fixture>` emits per-task
      command lines without executing.
- [ ] Stress test (10) passes 100 iters with zero races.
- [ ] All 6 unit tests + 3 integration tests + 1 stress test pass under
      `npm test`.
- [ ] `bin/spawn-wave.mjs` handles: parallel dispatch, timeout-kill,
      corrupt JSON, missing tmp file, cost extraction. All covered by
      integration test (7).
- [ ] Vendored libs match source-of-truth byte-for-byte.
- [ ] Live Gemini end-to-end smoke test on a 3-task plan; observe parallel
      subprocesses, tmp dir contents, final state file.
- [ ] `references/porting-notes.md` updated with live confirmation of
      `--output-json` and `--skill-roster` flag syntax.
- [ ] No changes to `plugins/harness-floor/skills/agent-all/`.
- [ ] CHANGELOG entry under a `Gemini agent-all graduation` heading.
