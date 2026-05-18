# agent-all-cursor — implementation spec

**Date:** 2026-05-18
**Status:** Implementation plan; scaffold already shipped in commit `d27e81a`
**Purpose:** Decompose the remaining implementation work to graduate
`agent-all-cursor` from prompt-template scaffold to a fully usable, installable
kit that matches the Claude Code `/agent-all` behavioural contract on Cursor.

## Why this spec is small relative to siblings

Cursor's subagent dispatch is implicit — there is no `dispatch()` API to wrap.
That collapses what would otherwise be three `.mjs` lib modules (`config-loader`,
`wave-builder`, `loop-evaluator`) into "the coordinator reads the JSON and
follows the rules in the phase docs". The remaining work is therefore:

1. Make the kit installable into a target workspace (one `bin/init.mjs` step).
2. Tighten the coordinator/implementer/reviewer agent templates so the planner
   actually routes correctly.
3. Add the minimum viable JS helpers that Cursor cannot do without (config
   load + plan parse + state read/write — invoked from the coordinator via
   `read_bash`).

Total estimate: **3 days** (matches the decomposition spec).

## What the scaffold currently provides

Shipped in commit `d27e81a`:

- `plugins/harness-floor-cursor/skills/agent-all-cursor/SKILL.md` — front-matter
  description, usage, pipeline table, rules, Cursor vs Claude Code diff table.
- `phases/0-preflight.md` through `phases/6-loop.md` — seven phase docs.
- `templates/agents/agent-all-coordinator.md.hbs` — parent agent template.
- `templates/agents/agent-all-implementer.md.hbs` — `is_background: true` worker
  template.
- `templates/agents/agent-all-reviewer.md.hbs` — `is_background: true` reviewer
  template (single file; mode disambiguated via prompt body).
- `templates/rules/agent-all.mdc.hbs` — `alwaysApply: true` workspace rule.
- `templates/agent-all.config.json.hbs` — `.agent-all.json` seed.
- `templates/pr-body.md.hbs` — Phase 5 PR body template.
- `lib/ask-user-adapter.mjs` — shared adapter (already implemented; reused).
- `references/porting-notes.md` — design rationale.

`bin/init.mjs` exists in `harness-floor-cursor/bin/` from the visual-qa work but
does **not** currently install the agent-all kit — it has to be extended.

## What needs to be implemented

### 1. Cursor agent + rule installer (extend `bin/init.mjs`)

Extend the existing `harness-floor-cursor/bin/init.mjs` to:

- Detect that `agent-all-cursor` was requested (e.g., new `--with agent-all`
  flag or always-install behaviour gated on the skill directory existing).
- Render each `templates/agents/*.md.hbs` into `<repo>/.cursor/agents/`.
- Render `templates/rules/agent-all.mdc.hbs` into
  `<repo>/.cursor/rules/agent-all.mdc`.
- Render `templates/agent-all.config.json.hbs` into `<repo>/.agent-all.json`
  (skip if file exists).
- Idempotent — re-running does not clobber user edits; existing files are
  diff-reported, not overwritten without `--force`.

### 2. Minimum viable JS helpers (`skills/agent-all-cursor/lib/`)

Cursor's planner runs the pipeline, but a handful of operations must be
exact and would be unsafe to delegate to natural-language interpretation by
the coordinator:

- `lib/config-loader.mjs` — load `.agent-all.json`, merge over DEFAULTS, return
  `{ ok, config, errors }`. **Same exports as Claude Code source-of-truth
  (`plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`)**, vendored
  with no changes. Coordinator invokes via `node -e "import('./.../config-loader.mjs').then(...)"`
  inside a `read_bash`. We do **not** rewrite this in markdown.
- `lib/plan-parser.mjs` — extract tasks from a markdown plan. The coordinator
  needs to know `{id, title, role, files[]}` for each `### Task N:` heading.
  New file (no Claude Code equivalent; Claude Code reads the plan in-context).
  Exports `parsePlan(markdown) → { tasks, errors }`.
- `lib/state-rw.mjs` — atomic read/write for `.agent-all-state.json`. Exports
  `readState(path)`, `writeState(path, state)` (write to `.tmp` + rename via
  Node `fs.renameSync`).

We deliberately do **not** vendor `wave-builder.mjs` — wave construction is
trivial enough (greedy bin-packing by file-overlap conflict) that the
coordinator's phase 3 doc can do it inline. Adding a helper would force the
coordinator to shell out for a 30-line calculation.

Similarly, `loop-evaluator.mjs` is unnecessary: Cursor cannot auto-re-invoke
the coordinator, so the loop logic collapses to "the user re-sends the prompt
N times until breakCondition exits 0". The coordinator handles iter accounting
inline.

### 3. Background-subagent completion bridge (deferred to follow-up)

Phase 3 fan-out and Phase 4 review both rely on the user confirming that all
`is_background: true` subagents finished before the coordinator advances. A
future enhancement (post-MVP, not in this 3-day budget) would scrape Cursor's
workspace temp dir for per-subagent transcripts and poll for end-of-turn
markers. For now, the phase docs explicitly say "Wait for user confirmation
before continuing".

### 4. Phase doc tightening

The current `phases/*.md` files describe what the coordinator should do but
do not give it explicit shell snippets for the JS helper calls. For each
phase that needs a helper:

- Phase 0 (preflight): `node lib/config-loader.mjs .agent-all.json | jq .`.
- Phase 2 (plan): coordinator drafts inline, then runs `node lib/plan-parser.mjs <plan-path>` to confirm parse-ability before dispatching.
- Phase 3 (dispatch): wave-build calculation stays inline.
- Phase 6 (loop): coordinator runs `bash -c "<breakCondition>"` via `read_bash`,
  records exit code in `state.consecutivePass`.

## File-by-file work breakdown

### `bin/init.mjs` (extend existing)

The existing `harness-floor-cursor/bin/init.mjs` renders the visual-qa kit.
Add a second `installAgentAll(opts)` exported function that:

```js
export function installAgentAll({ repoDir, force = false, ctx = {} })
```

- Reads each `templates/agents/*.hbs` and `templates/rules/agent-all.mdc.hbs`,
  renders with `bin/lib/render.mjs` (already exists), writes to
  `<repoDir>/.cursor/{agents,rules}/`.
- Emits manifest of files written/skipped.

Invoked from the CLI front-door:
```
node plugins/harness-floor-cursor/bin/init.mjs --skill=agent-all --target=.
```

Lines of code: ~80 (mostly file walking + render glue).

### `skills/agent-all-cursor/lib/config-loader.mjs`

Vendored from `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`
with no modifications. Exports `DEFAULTS`, `loadConfig(path)`. Identical
deepMerge + validate. ~55 LoC.

**Difference from source-of-truth: zero.** This is a deliberate copy so the
Cursor skill is self-contained — users installing only this plugin should not
need `harness-floor` on their plugin marketplace.

### `skills/agent-all-cursor/lib/plan-parser.mjs` (new)

```js
export function parsePlan(markdown) {
  // Extract `### Task N: <title>` headings.
  // For each task block, scan for `^- (?:Create|Modify):\s*\`([^\`]+)\`` → files.
  // Scan for `^role:\s*(\S+)$` → role.
  return { tasks: [{ id, title, role?, files: [...] }], errors: [...] };
}
```

No Claude Code equivalent — Claude Code's coordinator reads the plan
in-context and identifies tasks via LLM. Cursor's coordinator can do the
same, but we vendor this parser so the dispatch phase has a deterministic
fallback when the LLM mis-counts headings. ~40 LoC.

### `skills/agent-all-cursor/lib/state-rw.mjs` (new)

```js
export function readState(path) { /* returns {} if missing */ }
export function writeState(path, state) {
  // write to <path>.tmp; fsync; rename to <path>.
}
```

Claude Code uses the native `Write` tool which is already atomic on the
filesystem layer. Cursor's chat surface doesn't promise atomicity, so this
helper exists to be invoked from `read_bash`. ~30 LoC.

### Phase docs (edits only)

Each phase doc gets one short "Shell helpers" section appended that lists the
exact commands the coordinator should run. No new phases; no restructuring.

- `phases/0-preflight.md`: add config-loader invocation.
- `phases/2-plan.md`: add plan-parser invocation.
- `phases/3-dispatch.md`: add plan-parser + state-rw invocations.
- `phases/6-loop.md`: add state-rw + break-condition shell snippet.

### Cursor agent template tightening

`templates/agents/agent-all-coordinator.md.hbs`: front-matter must include
`description` that triggers Cursor's planner to route `@agent-all-coordinator`
mentions. Current description is too generic; needs verbs and trigger phrases
so other agents in the workspace don't compete.

`templates/agents/agent-all-implementer.md.hbs`: `is_background: true` must
be present in frontmatter. Body must give Cursor enough scaffolding to
output `STATUS: completed|blocked|failed` + `COMMITS: [...]` in the final
message so the coordinator can parse results.

`templates/agents/agent-all-reviewer.md.hbs`: same as implementer but with
`mode=spec` vs `mode=quality` branching on the first line of the prompt body
(per `references/porting-notes.md` rationale — Cursor's description-match
routing is coarse).

## Test plan

### Unit tests (Node, no Cursor runtime needed)

Add to `tests/lib/`:

1. `tests/lib/cursor-agent-all-config-loader.test.mjs` — exact same shape as
   `tests/lib/agent-all-config-loader.test.mjs` (Claude Code). Verifies the
   vendored copy stays in sync.
2. `tests/lib/cursor-agent-all-plan-parser.test.mjs` — parses a fixture plan
   with 3 tasks, asserts ids, titles, files. Edge case: malformed heading,
   missing files block.
3. `tests/lib/cursor-agent-all-state-rw.test.mjs` — write then read, verify
   atomic-rename behaviour by interrupting (write tmp then assert no partial
   `.agent-all-state.json`).

### Integration tests

4. `tests/integration/cursor-agent-all-install.test.mjs` — invoke
   `installAgentAll({ repoDir: tmpdir, force: true })`, assert files appear
   in `.cursor/agents/` and `.cursor/rules/`, assert idempotency on second
   run.
5. `tests/integration/cursor-agent-all-templates-render.test.mjs` — render
   each `.hbs` with a fixed ctx, snapshot-compare to golden output.

### Manual checklist (not automated)

- [ ] Install kit into a real Cursor workspace via `bin/init.mjs`.
- [ ] Invoke `@agent-all-coordinator run /agent-all for "smoke test"` and
      walk through all phases.
- [ ] Verify `is_background: true` actually fans out — open Cursor's
      background-chats panel and count concurrent implementer chats.
- [ ] Loop mode: invoke with `--loop --max-iter=3` and confirm coordinator
      asks user to "send continue" between iters.

## Effort estimate breakdown

Target: **3 days** (decomposition spec line 79).

| Slice | Work | Hours |
|---|---|---|
| `bin/init.mjs` extension | `installAgentAll()` + file walking + idempotency check | 4 |
| `lib/config-loader.mjs` | vendored copy + verify sync with source-of-truth | 1 |
| `lib/plan-parser.mjs` | new parser + edge cases | 3 |
| `lib/state-rw.mjs` | atomic write helper | 2 |
| Phase doc tightening | add shell snippets to 4 phase docs | 2 |
| Agent template tightening | tune frontmatter description + STATUS contract | 3 |
| Unit tests (3 files) | config-loader, plan-parser, state-rw | 3 |
| Integration tests (2 files) | install + render | 3 |
| Manual checklist + buffer | real Cursor smoke test + fixes | 3 |
| **Total** | | **24 hr ≈ 3 days** |

## Open questions

1. **Background-subagent completion detection.** Cursor offers no programmatic
   "all my background chats finished" event. Mitigation: phase 3 doc asks
   user to confirm. Long-term: scrape Cursor's workspace temp transcripts
   (path varies by Cursor version) or wait for `cursor-cli` GA. **Defer.**

2. **`.cursor/rules/*.mdc` `alwaysApply: true` collision.** If another rule
   in the workspace also has `alwaysApply: true`, the two rules concatenate
   in every prompt. Bloats context. Mitigation: install with `applyMode:
   manualByDescription` and require users to opt in by mentioning
   `agent-all` in their chat. Need user feedback to decide.

3. **Reviewer mode disambiguation.** The single `agent-all-reviewer.md`
   handles both spec and quality review via `mode=...` in the prompt body
   (per porting-notes). If Cursor's planner ignores body content when
   matching descriptions, both modes will look identical and routing
   collapses. Alternative: ship two reviewer files with intentionally
   non-overlapping descriptions (`agent-all-spec-reviewer`,
   `agent-all-quality-reviewer`). Test against a live Cursor install before
   committing.

4. **Cost tracking.** Cursor's chat surface doesn't expose per-turn cost.
   The coordinator can record only what the user pastes back. Should we
   prompt the user for cost after each wave? Or just drop `--max-cost`
   enforcement on Cursor entirely? **Recommendation: best-effort with a
   warning at install time; do not abort on cost-cap on Cursor.**

5. **Plan-writer integration.** Claude Code uses `superpowers:writing-plans`.
   Cursor has no equivalent skill. Phase 2 currently says "coordinator
   drafts inline OR user supplies a file". For an MVP this works, but the
   quality of the inline-drafted plans depends entirely on the coordinator
   agent template's prompt — needs iteration after real-world use.

## Acceptance criteria

- [ ] `bin/init.mjs --skill=agent-all --target=<dir>` installs all six
      template files into the target workspace without prompting.
- [ ] Re-running the same command without `--force` reports "0 files
      written, 6 skipped (already present)".
- [ ] `node skills/agent-all-cursor/lib/config-loader.mjs <path>` returns
      JSON matching the Claude Code source-of-truth shape.
- [ ] `node skills/agent-all-cursor/lib/plan-parser.mjs <plan.md>` returns
      `{ tasks: [{ id, title, role?, files }] }` for a 3-task fixture.
- [ ] `node skills/agent-all-cursor/lib/state-rw.mjs` write-then-read
      round-trips losslessly; interrupted write leaves the original file
      intact.
- [ ] All 3 unit tests + 2 integration tests pass under `npm test`.
- [ ] Manual smoke test: invoke `@agent-all-coordinator` in a live Cursor
      workspace, observe Phase 0 through Phase 5 completion on a trivial
      task ("add a CHANGELOG entry").
- [ ] `references/porting-notes.md` updated with results of the manual
      smoke test (especially: did description-routing work? did
      `is_background` parallelism happen?).
- [ ] No changes to `plugins/harness-floor/skills/agent-all/` (the source of
      truth stays untouched).
- [ ] CHANGELOG entry added under a `Cursor agent-all graduation` heading.
