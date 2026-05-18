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

## Phase 4 — Optional: emit hook + MCP stubs

Ask the user whether to emit `.github/hooks/` stubs and an MCP config
snippet. If yes:

1. Copy these static stubs into the project (verbatim — no rendering):

   - `templates/hooks/preToolUse.json` → `.github/hooks/preToolUse.json`
   - `templates/hooks/postToolUse.json` → `.github/hooks/postToolUse.json`
   - `templates/hooks/agentStop.json` → `.github/hooks/agentStop.json`

   Refuse to overwrite unless `--force`.

2. Prompt for MCP servers (`{ name, command, args }` or `{ name, url }`,
   empty list OK).

3. Build the JSON body:

   ```javascript
   const entries = mcp_servers.map((s) => {
     const fields = s.command
       ? `      "command": ${JSON.stringify(s.command)},\n      "args": ${JSON.stringify(s.args ?? [])}`
       : `      "url": ${JSON.stringify(s.url)}`;
     return `    ${JSON.stringify(s.name)}: {\n${fields}\n    }`;
   });
   const mcp_servers_json_body = entries.join(",\n");
   ```

4. Render `templates/mcp-config.json.hbs` and PRINT it to stdout (do NOT
   write to `~/.copilot/mcp-config.json` automatically). Prefix output with:

   ```
   # Copy the following into ~/.copilot/mcp-config.json:
   ```
