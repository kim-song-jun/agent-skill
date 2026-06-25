# Orchestration patterns agent-all embodies

`/agent-all` is one opinionated pipeline. It already embodies several named
multi-agent patterns — this doc makes them legible so the design can be reasoned
about. **The topology is fixed by design; it is NOT selectable or configurable** —
a single enforced shape is what makes verification-independence and audit gates
hold (offering a menu would multiply the test matrix and weaken the guarantees).

| Pattern | Where in agent-all |
|---------|--------------------|
| **Pipeline** | the whole run: intent → plan → dispatch → gate → PR → loop |
| **Fan-out / fan-in** | Phase 3 dispatches implementer subagents per wave task (3a scope / 3b ask / 3c implement) and joins |
| **Generate-verify** | Phase 4 runs spec-reviewer + quality-reviewer + an adversarial judge over the generated change |
| **Supervisor split** | `references/orchestrator-routing.md` routes between `/agent-all` and the built-in `Workflow` tool by deliverable |

For the front-door router across all skills (not just within agent-all), see the
`harness` skill's `references/routing-map.md`.
