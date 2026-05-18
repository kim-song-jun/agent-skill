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

## Phase 4 — Optional: emit Codex config stub

Ask the user (via `ask_user` or equivalent) whether to also emit
`.codex/config.toml` with hook and MCP stubs. If yes:

1. Prompt for MCP servers (optional, empty list OK). For each, capture
   either `{ name, command, args }` (stdio) or `{ name, url }` (HTTP).

2. Build the `mcp_servers_block` as a TOML string:

   ```javascript
   const lines = [];
   for (const s of mcp_servers) {
     lines.push(`[mcp_servers.${s.name}]`);
     if (s.command) {
       lines.push(`command = ${JSON.stringify(s.command)}`);
       lines.push(`args = ${JSON.stringify(s.args ?? [])}`);
     } else if (s.url) {
       lines.push(`url = ${JSON.stringify(s.url)}`);
     }
     lines.push("");
   }
   const mcp_servers_block = lines.join("\n");
   ```

3. Extend the ctx with defaults:

   ```javascript
   ctx.hook_command_pretool = "echo 'pre apply_patch'";
   ctx.hook_command_sessionstart = "echo 'session start'";
   ctx.mcp_servers_block = mcp_servers_block;
   ```

4. Render `templates/codex-config.toml.hbs` and write to `.codex/config.toml`
   in the project root. Refuse to overwrite unless `--force`.

The hook commands are no-ops by default; users edit them.
