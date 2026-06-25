# Harness Routing Front Door (`/harness`) + Orchestration-Pattern Doc — Design Spec

**Status:** Approved (brainstorming complete, awaiting plan)
**Date:** 2026-06-26
**Author:** sungjun
**Origin:** Takeaways #3 (single natural-language routing front door) and #4 (named orchestration-pattern vocabulary) from the revfactory/harness comparison. #1+#2 (evolution loop + record-then-reverify eval) already shipped (see `2026-06-25-measurable-self-improvement-design.md`).

---

## 1. Purpose

Today a user must self-classify their intent and know which of ~10 skills to invoke (`/agent-init`, `/agent-all`, `/debug`, `/explore`, `/thrift`, `/wiki`, `/visual-qa`, `/data-runner`, `/agent-handoff`) or the built-in `Workflow` tool. The only routing artifact, `agent-all`'s `references/orchestrator-routing.md`, is a 2-way `/agent-all`-vs-`Workflow` contract — it does not route across the skill surface.

This adds **`/harness <free-form intent>`**: an optional single front door that classifies intent against a routing map and surfaces an advisory `AskUserQuestion` decision (recommended skill + alternatives + one-line why); on confirmation it invokes the chosen Skill. It does NOT replace direct skill invocation — it serves "I'm not sure which to use."

It also adds **`references/orchestration-patterns.md`** (#4): names the orchestration patterns `/agent-all` already embodies, for legibility — without making the topology selectable (that would fight the anti-sprawl thesis).

## 2. Non-Goals

- **Not** a replacement for direct skill invocation — direct `/agent-all` etc. stay first-class; `/harness` is an optional router.
- **Not** an executor — `/harness` routes and hands off; it never does the work itself.
- **Not** auto-routing — every route goes through an `AskUserQuestion` confirm (Decision-Surfacing Protocol; global rules 14/15). No silent auto-invoke.
- **Not** a selectable orchestration-topology menu — `orchestration-patterns.md` documents the single opinionated pipeline; it does not make it configurable.
- **Not** all-runtime in v1 — Claude-first (see §6). Ports are a follow-up, matching the repo's selective-port precedent (`agent-handoff` is Claude-only; `wiki` is Claude+Codex).
- **Not** a new plugin — `/harness` lives inside the existing `harness-floor` plugin, so `marketplace.json` pluginCount stays 19.

## 3. Background — verified current state

- **Selective porting is the norm, NOT total parity.** `harness-floor` = {agent-all, agent-handoff, visual-qa, wiki}; `-codex` = {agent-all, visual-qa, wiki}; `-copilot/-cursor/-gemini` = {agent-all, visual-qa}. `cross-platform-manifest.test.mjs` checks plugin.json validity/version for a fixed plugin list; it does NOT require a new skill to exist in all ports. So a Claude-only `/harness` is releasable.
- **Interaction infra exists and is the repo default.** `agent-all/lib/interactions/` has `agent-interaction/v1` + `renderer-claude.mjs` (native `AskUserQuestion`) + per-runtime renderers + `resolveNonTtyInteraction()`. `/harness` lives in the SAME plugin (`harness-floor`), so it reuses these via in-plugin relative import — no cross-plugin dependency.
- **agent-all Phase 1 already routes 2-way** (deliverable → `/agent-all` vs `Workflow`) as an `agent-interaction/v1` decision. `/harness` is the N-way generalization at the front door.
- `release-smoke.sh --fast` asserts `pluginCount: 19` and a focused-contract test count; adding a skill to an existing plugin keeps pluginCount 19 (no new plugin).

## 4. Architecture

Units, each independently testable through a narrow interface:

| Unit | File | Does | Depends on |
|------|------|------|------------|
| A. Routing data + scorer | `plugins/harness-floor/skills/harness/lib/routing-map.mjs` | `ROUTING_TABLE` (intent signals → target + rationale) + `rankRoutes(intent)` → ranked candidates | nothing (pure) |
| B. Front-door skill | `plugins/harness-floor/skills/harness/SKILL.md` | classify intent → `agent-interaction/v1` decision → AskUserQuestion → on confirm invoke chosen Skill | A + agent-all interaction renderers (same plugin) |
| C. Human routing doc | `plugins/harness-floor/skills/harness/references/routing-map.md` | the N-way table for humans/agents to read | A (kept in sync) |
| D. Pattern doc (#4) | `plugins/harness-floor/skills/agent-all/references/orchestration-patterns.md` | names patterns agent-all embodies | nothing |

### 4A. `routing-map.mjs`

```js
export const ROUTING_TABLE = [
  { target: "/agent-init",    kind: "skill",    when: "start a new project / adopt the harness on a repo",        signals: ["init","scaffold","set up","new project","adopt","onboard"] },
  { target: "/agent-all",     kind: "skill",    when: "ship a feature or bugfix as a gated PR",                   signals: ["feature","implement","build","fix","bug","ship","pr"] },
  { target: "/debug",         kind: "skill",    when: "investigate a failing command / flaky test / regression",  signals: ["debug","failing","flaky","regression","error","crash","why is"] },
  { target: "/explore",       kind: "skill",    when: "map / understand the codebase",                            signals: ["explore","map","understand","where is","architecture","overview"] },
  { target: "/thrift",        kind: "skill",    when: "control cost / manage a long session's context",           signals: ["cost","budget","token","long session","context","expensive","summarize session"] },
  { target: "/wiki",          kind: "skill",    when: "read/write/compile durable project knowledge",             signals: ["wiki","knowledge","document","notes","decision log"] },
  { target: "/visual-qa",     kind: "skill",    when: "capture screenshots / visual regression of a UI",          signals: ["screenshot","visual","ui","browser","regression","playwright"] },
  { target: "/data-runner",   kind: "skill",    when: "verify notebooks / SQL / ETL / dataset artifacts",         signals: ["data","notebook","sql","etl","csv","parquet","dataset","metrics"] },
  { target: "/agent-handoff", kind: "skill",    when: "hand off an in-progress /agent-all task to a new session", signals: ["handoff","hand off","new session","resume","dispatch task"] },
  { target: "Workflow",       kind: "tool",     when: "breadth-first evidence: audit/fact-check/research report",  signals: ["audit","research","fact-check","review many","map-reduce","report","findings"] },
];

// Deterministic seed for the model: case-insensitive signal hit count, ranked.
// Returns [{ target, kind, when, score }] sorted desc; ties keep table order.
export function rankRoutes(intent) { /* score by signal substring hits */ }
```

`kind: "tool"` (Workflow) cannot be invoked as a Skill — the skill recommends it and instructs the user (file-handoff per `orchestrator-routing.md`).

### 4B. `/harness` skill behavior

1. Read free-form intent (the skill argument).
2. `rankRoutes(intent)` seeds candidates; the model refines with judgment.
3. Build an `agent-interaction/v1` `kind: "decision"` (recommended target first + 2-3 alternatives, each with its one-line `when`); render via `renderer-claude.mjs` (native `AskUserQuestion`).
4. On confirm: if `kind: "skill"`, invoke that Skill (passing the intent); if `kind: "tool"` (Workflow), instruct the user how to run it; if the top score is 0 / ambiguous, ask ONE clarifying question first.
5. Non-TTY: `resolveNonTtyInteraction()` — recommend the top route for low/medium; never auto-run a high-risk target without confirm.

### 4D. `orchestration-patterns.md` (#4)

Names what agent-all already embodies: Phase 3 (3a/3b/3c) = **fan-out/fan-in**; Phase 4 spec-reviewer + quality-reviewer + adversarial-judge = **generate-verify**; `orchestrator-routing.md` agent-all-vs-Workflow = **supervisor split**; the run-as-a-whole = **pipeline**. States explicitly: the topology is a single opinionated pipeline by design; this doc is for legibility, not configurability.

## 5. Documentation update (in scope — "전체 문서 업데이트")

- **README.md**: add `/harness` to the command/entry-point surface AND a short "front door" note; ALSO back-document the already-shipped evolution-loop feature (run-record/v1, derive-priors advisory panel, record-then-reverify eval) which is not yet in README.
- **CHANGELOG.md + CHANGELOG.ko.md**: entries for BOTH the evolution-loop feature (Tasks 1-10 of the 2026-06-25 work) AND `/harness` + orchestration-patterns, under the new version.
- **SUPPORT_MATRIX.md / ROADMAP.md**: update only if they enumerate skills/commands (verify during implementation; touch only if they list the surface).

## 6. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Front-door form | New `/harness` skill (user-chosen over CLAUDE.md-table / pure-doc) |
| 2 | Home | `harness-floor` plugin (reuses agent-all interaction renderers in-plugin); not a new plugin |
| 3 | Routing UX | classify → AskUserQuestion confirm → invoke chosen Skill (never silent auto-route) |
| 4 | Porting | Claude-first; other runtimes are a follow-up (selective-port precedent) |
| 5 | Pattern doc | document the patterns agent-all embodies; topology stays fixed (not selectable) |
| 6 | Scope | bundle #3 + #4 + the doc update; ship as one release |

## 7. Error handling & safety

- Advisory only: `/harness` never executes a target without an explicit confirm (or non-TTY low/medium default). High-risk targets (`/agent-all` PR runs) always require confirm.
- `rankRoutes` is pure and total: empty/garbage intent → all-zero scores → the skill asks a clarifying question rather than mis-routing.
- Shared-tree git safety (rules 6-10) for the release/push phase: pathspec commits, no stash/reset/branch; push only after green + user-authorized (it is).

## 8. Testing

- `rankRoutes` unit tests: representative intents → expected top target ("auth login broken" → `/debug`; "this run costs too much" → `/thrift`; "screenshot the dashboard" → `/visual-qa`; "set up a new repo" → `/agent-init`; "audit all configs" → `Workflow`). Real behavior, not mocks.
- Coverage contract: every current skill/command appears as a `ROUTING_TABLE` target (a test that diffs the table against the installed skill surface so a future skill addition is forced into the router).
- SKILL.md structure contract: the skill documents the confirm-before-invoke protocol and references the routing map.
- `routing-map.md` ↔ `routing-map.mjs` consistency (the human doc lists the same targets).
- Full `node --test` + `release-smoke.sh --fast` green (controller-verified) before release.

## 9. Rollout sequence (for the plan)

1. **A** `routing-map.mjs` (`ROUTING_TABLE` + `rankRoutes`) + unit/coverage tests.
2. **B** `harness/SKILL.md` + the confirm-before-invoke protocol + structure contract test.
3. **C** `references/routing-map.md` + consistency test.
4. **D** `references/orchestration-patterns.md` (#4).
5. **Docs** README + CHANGELOG.md + CHANGELOG.ko.md (both features).
6. **Release** version bump + release-candidate + `release-smoke.sh --fast` + fix any count/doc contracts + push origin/main.
