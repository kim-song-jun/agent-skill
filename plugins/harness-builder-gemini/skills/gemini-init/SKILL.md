---
name: agent-init
description: >
  Use when starting a Gemini CLI project or adopting Gemini in an existing
  repository that needs GEMINI.md, .gemini/skills, project memory, or harness
  scaffolding.
---

# /agent-init

You are scaffolding agent infrastructure for a Gemini CLI project.

## Phase 1 — Gather

Ask the user (via `ask_user`, one at a time):

1. Project purpose (one or two sentences)
2. Project size: small / medium / large
3. QA personas (comma-separated)
4. Deploy targets
5. Special constraints (compliance, performance budgets, "" if none)

Represent each prompt and any optional/default choice as the shared
`agent-interaction/v1` `AgentInteraction` schema before rendering. Gemini uses
`renderer-gemini.mjs` to produce prompt/markdown output; Claude-compatible
callers may render the same object with `renderer-claude.mjs` and native
`AskUserQuestion`. Non-TTY runs use `resolveNonTtyInteraction()` to select only
low/medium-risk recommended defaults, block high-risk choices, and append
`.agent-skill/runs/<run-id>/interactions.jsonl` with
`appendInteractionLog({ source: "gemini-init" })`.

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

Print: detected stack, runtime (if any), roles scaffolded, and the rendered
`gemini-settings.json` snippet for manual merge into `~/.gemini/settings.json`
or `<project>/.gemini/settings.json`.

The settings output is MCP-only in this release. Gemini operational enforcement
is soft prompt-level guidance, not hard hooks; the discipline rules live in
`GEMINI.md`.

## Phase 4 — Optional: emit .gemini/settings.json stub

Ask the user (via `ask_user`) whether to emit a `.gemini/settings.json` stub
for the project. If yes, keep the stub MCP-only:

1. Prompt for MCP servers (`{ name, command, args }` or `{ name, url }`,
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

2. Render `templates/gemini-settings.json.hbs` and write to
   `.gemini/settings.json` in the project root via `write_file`. Refuse
   to overwrite unless `--force`.

Hard hook blocking is not generated for Gemini in this release. Keep generated
settings limited to MCP server wiring and rely on `GEMINI.md` for operational
discipline.
