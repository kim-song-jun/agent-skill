---
name: copilot-init
description: >
  Scaffold .github/copilot-instructions.md, AGENTS.md, and .github/instructions/
  for a new or existing project. Use at the start of a Copilot CLI engagement
  to give the agent durable project memory.
---

# Copilot Init

You are scaffolding agent infrastructure for a GitHub Copilot CLI project.

## Phase 1 — Gather

Ask via `ask_user` (one at a time):

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

Render and write via `apply_patch`:

- `templates/copilot-instructions.md.hbs` → `.github/copilot-instructions.md`
- `templates/AGENTS.md.hbs` → `AGENTS.md` (project root)
- `templates/instructions/<role>.instructions.md.hbs` → `.github/instructions/<role>.instructions.md` for each role

Copilot CLI deduplicates content between `copilot-instructions.md` and `AGENTS.md`, so co-existence is safe.

Refuse to overwrite existing files unless `--force`.

## Phase 3 — Summarize

Print: detected stack, runtime (if any), the files written. Note that
`.github/hooks/` and `~/.copilot/mcp-config.json` wiring is out of scope
for this MVP.
