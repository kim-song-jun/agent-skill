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

## Phase 4 — Optional: emit .gemini/settings.json stub

Ask the user (via `ask_user`) whether to emit `.gemini/settings.json`
with hook + MCP stubs. If yes:

1. Default hook commands:

   ```javascript
   ctx.hook_command_beforetool = "echo 'before write_file'";
   ctx.hook_command_sessionstart = "echo 'session start'";
   ```

2. Prompt for MCP servers (`{ name, command, args }` or `{ name, url }`,
   empty list OK). Build `mcp_servers_json_body` the same way as the
   Copilot plugin's Phase 4 step 3:

   ```javascript
   const entries = mcp_servers.map((s) => {
     const fields = s.command
       ? `      "command": ${JSON.stringify(s.command)},\n      "args": ${JSON.stringify(s.args ?? [])}`
       : `      "url": ${JSON.stringify(s.url)}`;
     return `    ${JSON.stringify(s.name)}: {\n${fields}\n    }`;
   });
   ctx.mcp_servers_json_body = entries.join(",\n");
   ```

3. Render `templates/gemini-settings.json.hbs` and write to
   `.gemini/settings.json` in the project root via `write_file`. Refuse
   to overwrite unless `--force`.

The hook commands are no-ops by default; users edit them.
