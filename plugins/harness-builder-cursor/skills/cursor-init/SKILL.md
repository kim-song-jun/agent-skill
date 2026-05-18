---
name: cursor-init
description: Scaffold instructions for using harness patterns inside Cursor — manual install today, automated render once Cursor exposes a plugin loader.
---

# Cursor Init

Cursor has no plugin loader, so this skill is documentation. The plugin
ships:

- `templates/rules/agent-init.mdc.hbs` — project rule, `alwaysApply: true`
- `templates/agents/{planner,dev,reviewer}.md.hbs` — subagent files
- `lib/render.mjs`, `lib/detect-stack.mjs` — vendored from harness-builder

## Mode A — Automated render (intended future flow)

Once Cursor supports skill invocation, a future `cursor-init` runtime will:

1. Detect project context:

   ```javascript
   import { detectProject } from "./lib/detect-stack.mjs";
   const detected = detectProject(process.cwd()); // { stack, runtime, services }
   ```

2. Gather user input (purpose, size, qa_personas, deploy_targets, constraints).

3. Render the templates with the discovery context:

   ```javascript
   import { render } from "./lib/render.mjs";

   const ctx = {
     purpose, size, qa_personas, deploy_targets, constraints,
     ...detected,
     services_str: detected.services.join(", "),
     agents: [
       { name: "planner",  description: "Drafts a plan before non-trivial changes." },
       { name: "dev",      description: "Implements after a plan is confirmed." },
       { name: "reviewer", description: "Reviews the diff before final acceptance." },
     ],
   };
   ```

4. Write the rendered outputs to:

   - `templates/rules/agent-init.mdc.hbs` → `.cursor/rules/agent-init.mdc`
   - `templates/agents/<role>.md.hbs` → `.cursor/agents/<role>.md` for each role

   Refuse to overwrite existing files unless `--force`.

## Mode B — Manual install (today)

```bash
bash plugins/harness-builder-cursor/bin/install.sh /path/to/your/project
```

The script copies the four `.hbs` template files into `.cursor/rules/` and
`.cursor/agents/` of the target project without rendering. Substitute
`{{stack}}`, `{{purpose}}`, `{{deploy_targets}}`, etc. by hand, then rename
the files by dropping the `.hbs` suffix.

## Cross-tool compatibility

Cursor also reads `.claude/agents/` and `.codex/agents/` as subagent
locations. If your project already has those (e.g., from running
`/agent-init` for Claude Code or `/codex-init`), Cursor picks them up
automatically — no separate install needed.

## Out of scope (MVP)

- Automated Mode A — waiting on a Cursor plugin loader
- `.cursor/mcp.json` emission
- Subagent dispatch wiring

See `docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md`.
