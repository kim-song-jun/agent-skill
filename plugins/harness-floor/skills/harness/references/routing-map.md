# Routing map — which skill for which intent

`/harness` uses this table (mirrored in `lib/routing-map.mjs`) to route free-form intent.
Direct invocation of any skill below still works; `/harness` is the optional front door.

| Intent | Route | Why |
|--------|-------|-----|
| Start a new project / adopt the harness | `/agent-init` | bootstrap memory, role agents, hooks |
| Ship a feature or bugfix as a gated PR | `/agent-all` | full intent→plan→implement→review→PR pipeline |
| A failing command / flaky test / regression | `/debug` | reproduce → bisect → hypothesis evidence |
| Map / understand the codebase | `/explore` | parallel codebase map + O(1) symbol lookup |
| Control cost / long-session context | `/thrift` | auto-summary + audit for affordable long runs |
| Read/write/compile project knowledge | `/wiki` | structured `.wiki/` knowledge base |
| Screenshots / visual regression of a UI | `/visual-qa` | browser capture + LLM design review |
| Verify notebooks / SQL / ETL / datasets | `/data-runner` | data-analysis verification |
| Hand off an in-progress task to a new session | `/agent-handoff` | durable handoff + session prompt |
| Breadth-first evidence: audit / research / report | built-in `Workflow` tool | fan-out evidence, not a durable code change |

Rule of thumb: a **durable, gated code change shipped as a PR** → `/agent-all`.
**Findings / specs / answers** → the built-in `Workflow` tool (see agent-all
`references/orchestrator-routing.md`).
