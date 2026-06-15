# Orchestrator routing: `/agent-all-gemini` vs a fan-out sweep

Two multi-agent orchestration patterns commonly apply, and the choice between
them should be deliberate, not by feel. This is the routing contract.

> **Note on "fan-out sweep".** In the Gemini port, the evidence-producing
> alternative to `/agent-all-gemini` is a coordinator-driven fan-out that
> spawns multiple parallel `gemini chat` subprocesses to gather research,
> audit many units, or produce findings/specs. It does **not** mean CI
> workflows (`.github/workflows`), the agent-all gate-sequence spec filed as
> `workflow.md`, or any product "workflow" feature.

## Decide by the deliverable

| The deliverable is… | Use |
|---|---|
| A durable code change shipped as a PR, gated by model-judged reviewers (verification/QA/orchestration audit tokens) | **`/agent-all-gemini`** |
| Breadth-first evidence: audit N dirs, fact-check M claims, review K diffs, map-reduce over many units, loop-until-dry, a research/design report | **fan-out sweep** (parallel `gemini chat` subprocesses for evidence gathering) |
| Mixed (research **then** ship) | **fan-out sweep first** → writes a `validateTaskDoc`-compliant task doc → then **`/agent-all-gemini <taskdoc> --no-brainstorm`** consumes it |

Rule of thumb: if the output is **files committed behind gates**, that is
`/agent-all-gemini`. If the output is **findings/specs/answers**, that is a
fan-out sweep. A `Workflow`/ultracode "use fan-out for every substantive task"
posture must not override this — a gated, PR-shipping change is
`/agent-all-gemini` even under that posture.

## They are siblings — never nest them

Fan-out subprocess leaves are individual `gemini chat` processes. Each leaf:

- Has no sub-subprocess dispatch capability (nesting would degrade to a
  single sequential subprocess — waves, gates, and pathspec commit review
  silently lost).
- Cannot run `/agent-all-gemini` internally.

→ Integrate them as a **file-based handoff between siblings** (a task doc / a
findings file on disk written by the fan-out sweep), never by nesting an
`/agent-all-gemini` invocation inside a fan-out subprocess.

## Governance does not transfer across the seam

agent-all-gemini's quality gate (audit tokens, pathspec commit ownership,
task ledger validation) is enforced by the **coordinator** phase instructions
in phases/3-dispatch.md and phases/4-gate.md.

A fan-out subprocess is **not** bound by those gate instructions, so
fan-out-produced verdicts inherit **none** of agent-all-gemini's
reviewer/QA enforcement.

- **Default posture:** fan-out sweeps only *produce evidence/specs*; they
  never gate a merge.
- If fan-out output must feed an agent-all-gemini gate, **launder it through
  one genuine gate-phase reviewer subprocess** so the audit-token requirement
  still fires.

## Non-goals

- Do **not** run `/agent-all-gemini` from inside a fan-out subprocess
  (degenerates to a single sequential subprocess — loses waves, gates, pathspec
  safety).
- Do **not** grant dispatch/fan-out capability to individual implementer
  subprocesses (single-task isolation is intentional).
- Do **not** rebuild agent-all-gemini as a second fan-out "frontend" that
  re-implements the gate contract in script — that trades away the gate's
  strongest property: out-of-band enforcement that survives the model
  forgetting.
