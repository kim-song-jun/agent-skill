# Orchestrator routing: `/agent-all` vs the built-in `Workflow` (ultracode) tool

Two multi-agent orchestrators commonly run side by side, and the choice between
them should be deliberate, not by feel. This is the routing contract.

> **Name collision warning.** "Workflow" is overloaded. In this contract it
> means **only** the built-in `Workflow` tool (the ultracode dynamic-orchestration
> tool that spawns `agent()` leaves). It does **not** mean CI workflows
> (`.github/workflows`), the agent-all gate-sequence spec sometimes filed as
> `workflow.md`, or any product "workflow" feature. When in doubt, say
> "the built-in Workflow tool".

## Decide by the deliverable

| The deliverable is… | Use |
|---|---|
| A durable code change shipped as a PR, gated by model-judged reviewers (verification/QA/orchestration audit tokens) | **`/agent-all`** |
| Breadth-first evidence: audit N dirs, fact-check M claims, review K diffs, map-reduce over many units, loop-until-dry, a research/design report | **built-in `Workflow`** |
| Mixed (research **then** ship) | **`Workflow` first** → it writes a `validateTaskDoc`-compliant task doc → then **`/agent-all <taskdoc> --no-brainstorm`** consumes it |

Rule of thumb: if the output is **files committed behind gates**, that is `/agent-all`.
If the output is **findings/specs/answers**, that is the `Workflow` tool. ultracode's
"use Workflow for every substantive task" posture must not override this — a
gated, PR-shipping change is `/agent-all` even under ultracode.

## They are siblings — never nest them

The dispatch tools (`Agent`/`Task`) and the `Workflow` tool exist **only at the
main-agent layer**. A roster subagent grants none of them. Therefore:

- A `Workflow` `agent()` leaf has no `Agent`/`Task` tool. If it invoked
  `/agent-all`, the skill's "dispatch the roster" steps degrade to **one
  subagent doing everything sequentially — waves, gates, and pathspec commit
  review silently lost.** Do not call `/agent-all` from inside a `Workflow`.
- An agent-all-dispatched subagent (`dev`, `reviewer`, …) has no `Workflow`
  tool, so it cannot run a Workflow.
- `workflow()` nesting is capped at one level.

→ Integrate them as a **file-based handoff between siblings** (a task doc / a
findings file on disk), never by nesting.

## Governance does not transfer across the seam

agent-all's quality gate is enforced out-of-band by the **`agent-policy-hook`**
(installed by `/agent-init`, matched on `"matcher": "Task"`): it injects the
scoping/verification directives on `PreToolUse` and rejects reports missing the
audit tokens (`verification_passed`, `VERIFICATION_AUDIT`, `QA_AUDIT`,
`ORCHESTRATION_AUDIT`) with `exit(2)` on `PostToolUse`.

A `Workflow` `agent()` call does **not** route through that Task hook, so
Workflow-produced verdicts inherit **none** of agent-all's reviewer/QA
enforcement.

- **Default posture:** the `Workflow` tool only *produces evidence/specs*; it
  never gates a merge.
- If Workflow output must feed an agent-all gate, **launder it through one
  genuine `Task`-dispatched reviewer/qa** so the audit-token hook still fires.

## Non-goals

- Do **not** call `/agent-all` from inside a `Workflow` `agent()` (degenerates
  to a single sequential subagent — loses waves, gates, pathspec safety).
- Do **not** grant `Workflow`/`Agent` to roster subagents (engine-forbidden).
- Do **not** rebuild agent-all as a second `Workflow` "frontend" that
  re-implements the Task hook in script — that trades away the hook's strongest
  property: out-of-band enforcement that survives the model forgetting.
