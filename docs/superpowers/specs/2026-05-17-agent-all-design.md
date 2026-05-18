> 🇰🇷 한국어: [2026-05-17-agent-all-design.ko.md](2026-05-17-agent-all-design.ko.md)

# /agent-all Skill — Design Spec (Theme C, sub-specs C-2 + C-3)

**Status:** Approved (brainstorming complete, awaiting plan)
**Date:** 2026-05-17
**Author:** kimsongjun (sungjun@molcube.com)
**Theme:** C of 3 (cost-unrestricted patterns). Combined sub-spec covering C-2 and C-3.

**Note (2026-05-18):** `/harness-init` was renamed to `/agent-init` in harness-builder v0.2.0. References below to the old name reflect the original design and remain accurate for that timeframe. Treat `harness-init` and `agent-init` as the same skill in current code.

---

## 1. Purpose

Provide a Claude Code skill — `/agent-all` — that drives an end-to-end multi-agent pipeline (intent → plan → wave dispatch → gate → PR) on top of the `.claude/agents/` roster scaffolded by `/agent-init`. Optionally loops the entire run via `--loop` until a shell break-condition succeeds, bounded by `--max-iter` and `--max-cost`.

Also extends `/agent-init` with a new `--theme=floor` flag (C-3) that bundles the `harness-floor` plugin's configs: `.visual-qa.json`, `.agent-all.json`, and a "Floor theme" CLAUDE.md section.

Cost-unrestricted by design: the skill willingly burns budget on wave parallelism, repeated review gates, and looped iterations to land high-quality changes without human babysitting.

## 2. Non-Goals

- Not a standalone planner — Phase 2 delegates to `superpowers:writing-plans`.
- Not a fresh subagent-driven-development re-implementation — Phase 3 wraps `superpowers:subagent-driven-development`.
- Not a CI replacement — `--loop` is local agent iteration, not a CI pipeline runner.
- Not a Git host abstraction — uses `gh` directly; non-GitHub hosts are out of scope.
- No standalone `/ralph` skill — loop behaviour lives inside `/agent-all`.

## 3. Inputs / Outputs

**Positional argument (required):** either a free-form prompt string OR a path to an existing `docs/tasks/<N>-<slug>.md`.

**Flags:**
- `--loop` — enable Phase 6 looping. Without it, runs phases 1-5 once.
- `--max-iter=<N>` — cap loop iterations (default: from config, hard cap 50).
- `--max-cost=<USD>` — cap accumulated cost (default: from config).
- `--wave-size=small|medium|large` — override config default.
- `--no-pr` — skip Phase 5 (PR creation).
- `--no-brainstorm` — skip Phase 1's brainstorming step (use prompt verbatim as task).
- `--resume` — skip phases already complete per `.agent-all-state.json`.
- `--force` — wipe state and restart.
- `--yes` — skip interactive confirms.

**Outputs:**

```
<project>/
├── .agent-all.json                                  # config (user/seeded)
├── .agent-all-state.json                            # .gitignored
├── docs/
│   ├── tasks/<N>-<slug>.md                          # from Phase 1
│   └── superpowers/plans/<date>-<slug>.md           # from Phase 2
└── (git history: 1 PR or N commits if --no-pr)
```

State file shape:
```json
{
  "phases": [{ "phase": N, "completedAt": "<iso>" }],
  "task": "docs/tasks/N-slug.md",
  "plan": "docs/superpowers/plans/...",
  "waves": [{ "index": 0, "tasks": [...], "status": "completed", "commits": [...] }],
  "iter": 0,
  "costUSD": 4.20,
  "prUrl": "https://github.com/.../pull/N"
}
```

## 4. Architecture

### 4.1 Package Layout

`harness-floor` plugin gains a new skill alongside `visual-qa`:

```
plugins/harness-floor/
├── plugin.json                                       # MODIFIED — add agent-all skill
└── skills/
    ├── visual-qa/                                    # unchanged (C-1)
    └── agent-all/                                    # NEW (C-2)
        ├── SKILL.md
        ├── phases/
        │   ├── 0-preflight.md
        │   ├── 1-intent.md
        │   ├── 2-plan.md
        │   ├── 3-dispatch.md
        │   ├── 4-gate.md
        │   ├── 5-pr.md
        │   └── 6-loop.md
        ├── lib/
        │   ├── config-loader.mjs
        │   ├── wave-builder.mjs
        │   └── loop-evaluator.mjs
        ├── templates/
        │   ├── agent-all.config.json.hbs
        │   └── pr-body.md.hbs
        └── references/
            └── legacy-notes.md
```

`harness-builder` plugin (Theme A) gets minimal additions for C-3:
- `skills/agent-init/SKILL.md` — append `--theme=floor` to the flags list
- `skills/agent-init/phases/5-wire.md` — add step `4c` handling `--theme=floor`
- `skills/agent-init/templates/CLAUDE.md.hbs` — add `{{#if floorTheme}}...{{/if}}` Floor section at the end

### 4.2 Updated `plugins/harness-floor/plugin.json`

```json
{
  "name": "harness-floor",
  "version": "0.2.0",
  "description": "Visual QA + agent-all pipeline (cost-unrestricted patterns)",
  "skills": ["skills/visual-qa", "skills/agent-all"]
}
```

### 4.3 `.agent-all.json` Schema

```json
{
  "defaults": {
    "maxIter": 1,
    "maxCostUSD": 50,
    "waveSize": "medium",
    "brainstormFirst": true,
    "createPR": true
  },
  "waves": {
    "small":  { "maxParallel": 2,  "rolesAllowed": ["dev", "reviewer"] },
    "medium": { "maxParallel": 4,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "reviewer"] },
    "large":  { "maxParallel": 8,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "qa-*", "reviewer", "doc-writer"] }
  },
  "loop": {
    "breakCondition": "npm test",
    "stableIters": 1
  },
  "gates": {
    "specReview": true,
    "qualityReview": true,
    "blockOnCritical": true
  },
  "pr": {
    "branchPrefix": "feat/agent-all/",
    "baseBranch": "main"
  }
}
```

CLI flags override the corresponding `defaults` field at run time.

### 4.4 Phase Pipeline

| Phase | Name | Skip-able? | Delegates to |
|-------|------|------------|--------------|
| 0 | Preflight | No | local checks |
| 1 | Intent | If task path passed OR `--no-brainstorm` | `superpowers:brainstorming` |
| 2 | Plan | No | `superpowers:writing-plans` |
| 3 | Dispatch | No | `superpowers:subagent-driven-development` |
| 4 | Gate | If `gates.*Review: false` | local + dispatched review subagents |
| 5 | PR | If `--no-pr` | `gh pr create` |
| 6 | Loop | If `--loop` not set | `lib/loop-evaluator.mjs` |

## 5. Component Detail

### 5.1 Phase 0 — Preflight

1. Confirm `pwd` is a git repo and the tree is clean (`git status --porcelain` empty). If dirty: abort with `Stash or commit first; agent-all needs a clean tree.`
2. Confirm `.claude/agents/` exists and contains at least `planner.md`, `dev.md`, `reviewer.md`. If not: abort with `Run /agent-init first.`
3. Load `.agent-all.json`. If missing: use hard-coded defaults (`{maxIter:1, maxCostUSD:50, waveSize:"medium", brainstormFirst:true, createPR:true}`) and print a one-line warning `(no .agent-all.json — using built-ins; run /agent-init --theme=floor to seed)`.
4. Read `.agent-all-state.json` if present. If `--resume` and `max(phases[*].phase) >= 0`, skip the rest of Phase 0.
5. Confirm input: if positional argument ends with `.md`, treat as task path — abort if file doesn't exist (`task file not found: <path>`). Otherwise treat as free-form prompt; abort if empty.
6. Push `{phase: 0, completedAt: "<iso>"}` to state.

### 5.2 Phase 1 — Intent

**If input is a path to existing `.md` file:** load it as the task. Skip brainstorming. Stash `task` in state.

**Else (free-form prompt):**
1. If `--no-brainstorm` or `defaults.brainstormFirst === false`: write the prompt verbatim to `docs/tasks/<N>-<slug>.md` where `N = nextTaskNumber()` and `slug = slugify(prompt.slice(0, 40))`. Skip brainstorming.
2. Else: invoke `Skill` with `superpowers:brainstorming` passing the prompt as `args`. After brainstorming finishes (it writes its own design doc), copy that design doc to `docs/tasks/<N>-<slug>.md`.
3. Stash `task` in state.

`nextTaskNumber()`: scan `docs/tasks/`, find max `N-` prefix, increment.

`slugify(s)`: lowercase, replace non-alphanumeric with `-`, trim leading/trailing `-`, truncate at 40 chars.

### 5.3 Phase 2 — Plan

1. Invoke `Skill` with `superpowers:writing-plans` passing the task path as `args`.
2. writing-plans saves its output to `docs/superpowers/plans/<date>-<slug>.md`. Capture that path.
3. Stash `plan` in state.

### 5.4 Phase 3 — Dispatch

1. Load the plan file. Extract task list using a simple parser (`### Task N:` heading delimiter).
2. Call `lib/wave-builder.mjs#buildWaves(taskList, waveConfig)`. Returns array of waves; each wave is a list of plan-tasks that can run in parallel (default heuristic: tasks that don't share file paths can be in the same wave, capped at `waveConfig.maxParallel`).
3. For each wave: invoke `Skill` with `superpowers:subagent-driven-development` passing wave's task list. subagent-driven-development handles its own implementer + spec-reviewer + quality-reviewer cycle per task.
4. Collect wave results into state.

### 5.5 Phase 4 — Gate

If both `gates.specReview` and `gates.qualityReview` are false, skip Phase 4 entirely (subagent-driven-development already did per-task reviews; this is a higher-level wave-level gate).

Otherwise:
1. Aggregate all task commits in this wave.
2. Dispatch a spec-reviewer subagent reviewing the wave commits vs the plan's spec coverage section.
3. Dispatch a code-quality reviewer over the wave's combined diff.
4. If any reviewer reports critical issues AND `blockOnCritical === true`: re-dispatch implementer subagents with the issues, then re-review. Up to 3 retry cycles. If still failing: abort phase with exit code 2.

### 5.6 Phase 5 — PR

If `--no-pr` or `defaults.createPR === false`: skip.

Otherwise:
1. Create branch: `<pr.branchPrefix><slug>` (from Phase 1's slug).
2. `git checkout -b <branch>` (or switch if exists; `--resume`-friendly).
3. `git push -u origin <branch>`.
4. Render `templates/pr-body.md.hbs` with `{task, plan, waves, commits, breakConditionPassed}`.
5. `gh pr create --base <pr.baseBranch> --title "<task.title>" --body <rendered>`.
6. Stash `prUrl` in state.

### 5.7 Phase 6 — Loop

If `--loop` not set: phase is a no-op, mark complete and exit.

Otherwise:
1. Run `loopConfig.breakCondition` via shell (`ctx_execute` with `language: "shell"`). Capture exit code.
2. If exit 0: increment `consecutivePass` counter. If `consecutivePass >= stableIters`: break.
3. Else: reset `consecutivePass = 0`.
4. Check guards: if `iter + 1 > maxIter` OR `costUSD > maxCostUSD`: abort with exit code 3 (`loop exhausted`).
5. Increment `iter`. Re-enter Phase 1 — but for loop iterations, **always treat the task as already-written** (the task.md from iteration 1). Skip brainstorming. Phase 2 regenerates the plan from scratch (`--no-replan` to reuse plan is out of scope for v0.1).
6. Repeat.

### 5.8 `/agent-init --theme=floor` (C-3)

**`SKILL.md` flag entry (appended to existing Flags section):**
```
- `--theme=floor` — bundle the harness-floor configs (.visual-qa.json + .agent-all.json + CLAUDE.md Floor section). Implicit `--visual-qa`.
```

**`phases/5-wire.md` new step:**

Inserted between existing `4b` (--visual-qa) and `5` (single commit):

```markdown
4c. If `--theme=floor` was passed:
    - Implicitly set `--visual-qa = true` (so step 4b also runs).
    - Verify `harness-floor` plugin enabled. If not: print install command, continue.
    - Render `plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs` with `{maxIter: 1, maxCostUSD: 50, waveSize: <size from Phase 1>}` and write to `.agent-all.json` at project root.
    - Append `.agent-all-state.json` to `.gitignore` (idempotent — already has `.agent-init-state.json` and `.visual-qa-state.json` patterns).
    - Set Phase 2 context flag `floorTheme: true` (used by `templates/CLAUDE.md.hbs` for the conditional section).
```

**`templates/CLAUDE.md.hbs` addition (appended at end):**

```handlebars
{{#if floorTheme}}
## Floor Theme

Cost-unrestricted parallel pattern enabled. Commands:

- `/visual-qa` — visual regression with LLM analysis (see `.visual-qa.json`)
- `/agent-all "task description"` — multi-wave pipeline (see `.agent-all.json`)
- `/agent-all <task-path> --loop` — iterate until the break-condition succeeds

Read `plugins/harness-floor/skills/{visual-qa,agent-all}/SKILL.md` for full flag references.
{{/if}}
```

## 6. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Not in a git repo | Phase 0 abort + `git init` suggestion |
| Working tree dirty | Phase 0 abort + `stash/commit first` |
| `.claude/agents/` missing | Phase 0 abort + `/agent-init` suggestion |
| `.agent-all.json` missing | Use built-in defaults, warn |
| Free-form prompt empty | Phase 1 abort + `provide a prompt or task path` |
| brainstorming cancelled by user | Phase 1 abort, no task.md written, state unchanged |
| writing-plans returns no plan file | Phase 2 abort + `check writing-plans output` |
| Plan parse fails (no `### Task N` headings) | Phase 3 abort + `plan must use writing-plans task heading format` |
| Single wave-task BLOCKED 3× | Wave aborts, gate sees incomplete, Phase 4 retries impl; if still BLOCKED → Phase 3 abort with exit 2 |
| `--max-cost` exceeded mid-wave | Finish current wave, abort, save partial state |
| `gh` not authenticated / missing | Phase 5 warn + skip; commits stay, branch pushed |
| Loop's breakCondition always passes | `stableIters` prevents premature exit; 1 iter then exit (acceptable) |
| Loop's breakCondition always fails | maxIter exhausted, Phase 6 exit code 3, last commit preserved |
| `--theme=floor` without harness-floor plugin enabled | harness-init step 4c prints install command, continues (degraded — configs written but unusable until install) |

## 7. Testing Strategy

### 7.1 Lib unit tests (`tests/agent-all/lib/`)

| Module | Tests |
|--------|-------|
| `config-loader.mjs` | 4 tests: minimal config, full config, missing config (defaults), invalid type |
| `wave-builder.mjs` | 5 tests: single task → 1 wave; 4 independent tasks + maxParallel=2 → 2 waves; tasks sharing file → serialized; rolesAllowed filter; empty plan |
| `loop-evaluator.mjs` | 5 tests: breakCondition exit 0 → break; exit non-0 → continue; stableIters=2 requires 2 consecutive passes; maxIter exhausted → exit code 3; maxCostUSD exceeded → exit |

### 7.2 Template snapshot tests (`tests/agent-all/templates/`)

`agent-all.config.json.hbs` + `pr-body.md.hbs` × 3 fixtures (minimal / full / loop-enabled) = 6 snapshots.

### 7.3 Scenario integration (`tests/agent-all/scenarios/`)

Mock `superpowers:subagent-driven-development` and `superpowers:writing-plans` via stub functions. 4 scenarios:
1. Single wave success → phases 1-5 complete, PR url returned
2. Multi-wave partial fail → wave 1 ok, wave 2 has 1 task BLOCKED, retry succeeds
3. `--loop` 3 iterations → breakCondition exits 0 on iter 3, loop exits cleanly
4. `--max-iter=2` exhausted → exit code 3 with partial state preserved

### 7.4 harness-init integration tests

Extend the existing `tests/lib/render.test.mjs` snapshot matrix with a new fixture `{ floorTheme: true }` covering `templates/CLAUDE.md.hbs`. Verify the Floor section appears only when `floorTheme === true`.

### 7.5 Manual E2E checklist (`tests/agent-all/manual-checklist.md`)

12 items including: empty `.claude/agents/`, dirty tree, brainstorming cancel mid-run, `--resume` after Ctrl-C, `--loop` with deliberately failing breakCondition, `--max-cost` early abort, `--no-pr` flow, `/agent-init --theme=floor` bundle verification.

### 7.6 Out of scope

- Real Claude API calls (mocked)
- Real `gh pr create` (manual checklist covers)
- Real subagent dispatch (scenario tests use stubs)

## 8. Migration impact

- `plugins/harness-floor/plugin.json` bumps from v0.1.0 to v0.2.0 (new skill).
- No breaking changes to `harness-builder` or `visual-qa` skills; their public surface is unchanged.
- The `--theme=floor` flag is additive; existing `/agent-init` invocations continue to work.

## 9. Examples

### One-shot feature from free-form prompt

```
/agent-all "Add OAuth login with GitHub"
```

Runs:
1. Phase 1 (brainstorming) — AI and user dialogue on requirements
2. Phase 2 (plan) — superpowers:writing-plans generates task list
3. Phase 3 (dispatch) — 2-3 waves of subagents implement + review
4. Phase 4 (gate) — optional spec/quality review
5. Phase 5 (PR) — creates PR from `feat/agent-all/oauth-login` branch

Typical output: 4–6 commits in the PR, cost ~$12–15 for Sonnet.

### Loop until tests pass

```
/agent-all "Fix the intermittent race condition in payment tests" --loop --max-iter=5
```

Iteration 1: brainstorm + plan + dispatch (failing test)
Iteration 2: regenerate plan, dispatch with focus on race fix (still fails)
Iteration 3: redesign, dispatch (green)
Phase 6 detects `npm test` exit 0, breaks loop.

Total cost: ~$30–40, wallclock: 15–20 min depending on test suite.

### Reuse existing task, skip brainstorming

```
/agent-all docs/tasks/7-auth-improvements.md --loop --max-iter=10 --max-cost=50
```

Phase 1 loads the task file. No brainstorming.
Phase 2 regenerates plan from the task.
Phases 3–6 loop until breakCondition or cost limit.

### Codex rescue pattern

```
/agent-all "Migrate ORM schema to Prisma" --wave-size=medium
# Wave 1: frontend-dev + backend-dev implement
# If wave blocks after 2 retries:
/codex:rescue
```

When a subagent reports BLOCKED, Codex skill invokes OpenAI to get a second opinion on the stuck task.

## 10. Future work (out of scope)

- **Replan-mid-loop** (`--no-replan` or `--replan-every=N`): currently each loop iteration regenerates the plan. Configurable replan strategy.
- **PR comment integration**: Phase 5 could optionally comment review summaries to the PR.
- **Cost telemetry**: cost-estimator is rough; integrate actual token-usage reporting once exposed by the runtime.
- **Distributed waves**: across multiple machines (out of scope for local-first design).
