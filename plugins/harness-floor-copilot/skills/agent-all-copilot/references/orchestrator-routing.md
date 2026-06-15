# Orchestrator routing: `/agent-all-copilot` vs the `task` fan-out

Two multi-agent orchestration modes commonly run side by side, and the choice
between them should be deliberate, not by feel. This is the routing contract.

> **Name collision warning.** "task fan-out" means the Copilot CLI `task` tool
> used to spawn independent parallel sub-tasks for *evidence-producing* work.
> It does **not** mean the implementation `task` dispatches inside a running
> `/agent-all-copilot` pipeline. When in doubt, say "evidence fan-out via
> `task`" vs "agent-all implementation wave dispatch".

## Decide by the deliverable

| The deliverable is… | Use |
|---|---|
| A durable code change shipped as a PR, gated by model-judged reviewers (VERIFICATION_AUDIT / QA_AUDIT / ORCHESTRATION_AUDIT tokens) | **`/agent-all-copilot`** |
| Breadth-first evidence: audit N dirs, fact-check M claims, review K diffs, map-reduce over many units, loop-until-dry, a research/design report | **`task` fan-out (evidence mode)** |
| Mixed (research **then** ship) | **`task` fan-out first** → it writes a `validateTaskDoc`-compliant task doc → then **`/agent-all-copilot <taskdoc> --no-brainstorm`** consumes it |

Rule of thumb: if the output is **files committed behind gates**, that is
`/agent-all-copilot`. If the output is **findings/specs/answers**, that is
the `task` evidence fan-out. A "use task for every substantive work item"
posture must not override this — a gated, PR-shipping change is
`/agent-all-copilot` even when the request sounds exploratory.

## They are siblings — never nest them

Implementation `task` dispatches exist **only inside the agent-all-copilot
orchestration loop**. An evidence-fan-out `task` spawned for research has no
agent-all pipeline context. Therefore:

- A research fan-out `task` must not attempt to re-enter `/agent-all-copilot`
  mid-execution — there is no shared state, wave ledger, or gate to attach to.
- An agent-all wave implementation `task` must not spawn its own evidence
  fan-out as a nested task.

Integrate them as a **file-based handoff between siblings** (a task doc on
disk), never by nesting.

## Governance does not transfer across the seam

agent-all-copilot's quality gate is enforced by the orchestrator's explicit
audit-token checks in Phase 4. An evidence fan-out `task` never routes through
that gate, so its verdicts inherit **none** of agent-all's reviewer/QA
enforcement.

- **Default posture:** the `task` evidence fan-out only *produces evidence/specs*;
  it never gates a merge.
- If fan-out output must feed an agent-all gate, **launder it through one
  genuine agent-all Phase 4 reviewer `task`** so the audit-token check still
  runs.

## Non-goals

- Do **not** call `/agent-all-copilot` from inside an evidence fan-out `task`
  (degenerates to a single sequential subagent — loses waves, gates, pathspec
  safety).
- Do **not** run evidence fan-out from within an agent-all wave task (breaks
  the orchestration loop state).
- Do **not** rebuild agent-all-copilot as a second fan-out "frontend" that
  re-implements the Phase 4 audit-token check in a fan-out leaf — that trades
  away the orchestrator's strongest property: out-of-band enforcement that
  survives the model forgetting.
