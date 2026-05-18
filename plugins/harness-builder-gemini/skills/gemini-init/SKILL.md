---
name: gemini-init
description: >
  Scaffold GEMINI.md and .gemini/skills/ for a new or existing project.
  Use at the start of a Gemini CLI engagement to give the agent durable
  project memory.
---

# Gemini Init

You are scaffolding agent infrastructure for a Gemini CLI project.

## Phase 1 — Gather

Ask the user (via `ask_user`, one at a time):

1. Project purpose (one or two sentences)
2. Project size: small / medium / large
3. QA personas (comma-separated)
4. Deploy targets
5. Special constraints (compliance, performance budgets, "" if none)

Run project detection:

```javascript
import { detectProject } from "./lib/detect-stack.mjs";
const detected = detectProject(process.cwd());
```

## Phase 2 — Render

```javascript
import { render } from "./lib/render.mjs";

const ctx = {
  purpose, size, qa_personas, deploy_targets, constraints,
  ...detected,
  services_str: detected.services.join(", "),
  agents: [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
  ],
};
```

Render and write via `write_file`:

- `templates/GEMINI.md.hbs` → `GEMINI.md` (project root)
- `templates/skills/<role>/SKILL.md.hbs` → `.gemini/skills/<role>/SKILL.md` for each role

The user can later run `activate_skill <role>` to load a role on demand.

Refuse to overwrite existing files unless `--force`.

## Phase 3 — Summarize

Print: detected stack, runtime (if any), roles scaffolded. Note that
`.gemini/settings.json` MCP wiring is out of scope for this MVP.
