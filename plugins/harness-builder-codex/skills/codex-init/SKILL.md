---
name: codex-init
description: >
  Scaffold AGENTS.md, .codex/skills/, and an optional .codex/config.toml MCP
  snippet for a new or existing project. Use at the start of a Codex CLI
  engagement to give the agent durable project memory.
---

# Codex Init

You are scaffolding agent infrastructure for a Codex CLI project.

## Phase 1 — Gather

Ask the user (one at a time) for:

1. Project purpose (one or two sentences)
2. Project size: small / medium / large
3. QA personas (comma-separated, e.g., "auth, payments")
4. Deploy targets (e.g., "vercel", "fly.io", "github releases")
5. Special constraints (compliance, performance budgets, "" if none)

Run the project-detection helper to fill in `stack`, `runtime`, `services`:

```javascript
import { detectProject } from "./lib/detect-stack.mjs";
const detected = detectProject(process.cwd()); // { stack, runtime, services }
```

## Phase 2 — Render

Build the discovery context:

```javascript
import { render } from "./lib/render.mjs";

const ctx = {
  purpose,
  size,
  qa_personas,
  deploy_targets,
  constraints,
  ...detected,
  services_str: detected.services.join(", "),
  agents: [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
  ],
};
```

Render and write each template:

- `templates/AGENTS.md.hbs` → `AGENTS.md` (project root)
- `templates/skills/<role>/SKILL.md.hbs` → `.codex/skills/<role>/SKILL.md` for each agent role

Use `apply_patch` for every file write. Refuse to overwrite existing files
unless the user passes `--force`.

## Phase 3 — Summarize

Print a 3-line summary: detected stack, runtime (if any), and the roles
scaffolded. Note that hooks/MCP wiring is out of scope for this MVP.
