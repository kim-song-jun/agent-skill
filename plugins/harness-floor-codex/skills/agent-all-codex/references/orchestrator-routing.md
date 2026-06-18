# Orchestrator routing: `/agent-all` vs a Codex research sweep

Two execution modes serve different deliverables. The choice between them
should be deliberate, not by feel. This is the routing contract for the Codex
port.

> **Platform note.** Codex CLI has no built-in multi-agent `Workflow` tool.
> The equivalent for evidence-producing / fan-out work is a `codex exec`
> research sweep — one or more sequential `codex exec <research-prompt>` calls
> — that writes its findings as a `validateTaskDoc`-compliant task doc on disk.
> Governance does not transfer across this seam; a research sweep produces
> evidence only; it never gates a merge.

## Decide by the deliverable

| The deliverable is… | Use |
|---|---|
| A durable code change shipped as a PR, gated by model-judged reviewers (VERIFICATION_AUDIT / QA_AUDIT / ORCHESTRATION_AUDIT tokens) | **`/agent-all`** |
| Breadth-first evidence: audit N dirs, fact-check M claims, review K diffs, map-reduce over many units, loop-until-dry, a research / design report | **`codex exec` research sweep** |
| Mixed (research **then** ship) | **`codex exec` sweep first** → it writes a `validateTaskDoc`-compliant task doc → then **`/agent-all <taskdoc> --no-brainstorm`** consumes it |

Rule of thumb: if the output is **files committed behind gates**, that is
`/agent-all`. If the output is **findings / specs / answers**, that is a
`codex exec` research sweep. The "use the pipeline for every substantive task"
posture must not override this — a gated, PR-shipping change is
`/agent-all` even when you might be tempted to use a sweep.

## They are siblings — never nest them

A `codex exec` research sweep has no awareness of the `/agent-all`
pipeline and cannot invoke Phase 3 dispatch, Phase 4 gate, or pathspec commit
review. Therefore:

- Do not call `/agent-all` from inside a `codex exec` research prompt —
  the pipeline's wave/gate/commit-review safety is silently lost.
- Do not invoke a second research sweep from inside a Phase 3 sequential skill
  invocation — sequential role skills have no outer pipeline context and cannot
  hand off cleanly.

Integrate them as a **file-based handoff between siblings** (a task doc or a
findings file on disk), never by nesting.

## Governance does not transfer across the seam

`/agent-all`'s quality gate is enforced in-phase by Phase 4's sequential
reviewer dispatch and audit-token contract (VERIFICATION_AUDIT, QA_AUDIT,
ORCHESTRATION_AUDIT). A `codex exec` research sweep produces prose; it emits
none of those tokens and therefore cannot pass the Phase 4 gate on its own.

- **Default posture:** a `codex exec` research sweep only *produces
  evidence/specs*; it never gates a merge.
- If sweep output must feed an `/agent-all` gate, launder it through one
  genuine Phase 4 sequential reviewer dispatch so the audit-token contract still
  fires.

## Non-goals

- Do **not** call `/agent-all` from inside a research sweep (degenerates
  to a single sequential invocation — loses waves, gates, pathspec safety).
- Do **not** grant multi-agent orchestration capabilities to sequential role
  skills; they operate within one wave task.
- Do **not** rebuild `/agent-all` as a second research-sweep "frontend"
  that re-implements the gate in script — that trades away the gate's strongest
  property: explicit audit-token enforcement that survives the model forgetting.
