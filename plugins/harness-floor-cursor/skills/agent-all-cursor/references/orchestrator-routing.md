# Orchestrator routing: `/agent-all` vs Cursor background fan-out

Two multi-agent patterns commonly run side by side in Cursor, and the choice
between them should be deliberate, not by feel. This is the routing contract.

> **Name note.** "Cursor background fan-out" means using `.cursor/agents/*.md`
> with `is_background: true` directly from a coordinating chat — without the
> agent-all pipeline's gate/commit/loop machinery. It does **not** mean running
> `@agent-all-implementer` outside of Phase 3.

## Decide by the deliverable

| The deliverable is… | Use |
|---|---|
| A durable code change shipped as a PR, gated by model-judged reviewers (VERIFICATION_AUDIT / QA_AUDIT / ORCHESTRATION_AUDIT tokens) | **`/agent-all`** |
| Breadth-first evidence: audit N dirs, fact-check M claims, review K diffs, map-reduce over many units, loop-until-dry, a research/design report | **Cursor background fan-out** (invoke `@<role>` with `is_background: true` directly, outside agent-all) |
| Mixed (research **then** ship) | **Background fan-out first** -> it writes a `validateTaskDoc`-compliant task doc -> then **`/agent-all <taskdoc> --no-brainstorm`** consumes it |

Rule of thumb: if the output is **files committed behind gates**, that is
`/agent-all`. If the output is **findings/specs/answers**, use Cursor
background agents directly. The "use agents for every substantive task" posture
must not override this — a gated, PR-shipping change is `/agent-all`
even when it feels like a large background task.

## They are siblings — never nest them

Cursor's `.cursor/agents/*.md` background dispatch (`is_background: true`)
exists at the **coordinator chat layer**. A roster subagent invoked via
`@agent-all-implementer` or `@agent-all-reviewer` gets none of that routing
authority — it cannot itself invoke another background fan-out sweep. Therefore:

- An `@agent-all-implementer` or `@agent-all-reviewer` subagent must NOT
  attempt to trigger another `@agent-all-coordinator`. If it did, Cursor's
  description-match routing would simply re-enter the pipeline with none of the
  Phase 3 wave/gate/pathspec-commit machinery active — waves, gates, and the
  orchestrator-owned commit step silently lost.
- Do not call `/agent-all` from inside a background fan-out sweep; the
  fan-out agent has no coordinator state.

Integrate them as a **file-based handoff between siblings** (a task doc / a
findings file on disk), never by nesting.

## Governance does not transfer across the seam

The Cursor port of `/agent-all` enforces its quality gate through the **coordinator** reading
audit tokens from each `@agent-all-reviewer` return: `VERIFICATION_AUDIT`,
`QA_AUDIT`, and `ORCHESTRATION_AUDIT` (each `passed|failed|skipped`).

A plain Cursor background fan-out **does not** route through those reviewer
invocations, so fan-out-produced verdicts inherit **none** of agent-all's
reviewer/QA enforcement.

- **Default posture:** background fan-out only *produces evidence/specs*; it
  never gates a merge.
- If fan-out output must feed an agent-all gate, **launder it through one
  genuine `@agent-all-reviewer` dispatch** inside Phase 4 so the audit-token
  check still fires.

## Non-goals

- Do **not** invoke `@agent-all-coordinator` from inside an implementer or
  reviewer subagent (degenerates to sequential re-entry — loses waves, gates,
  and pathspec safety).
- Do **not** grant background `is_background: true` agents the ability to
  re-trigger the full pipeline (engine limitation; coordinator is the only fan-out root).
- Do **not** rebuild the Cursor port of `/agent-all` as a second background fan-out "frontend"
  that re-implements the audit-token check in the subagent prompt — that loses
  the coordinator's role as the single pathspec-commit owner.
