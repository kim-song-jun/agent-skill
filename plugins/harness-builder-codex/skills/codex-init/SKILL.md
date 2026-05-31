---
name: codex-init
description: >
  Scaffold AGENTS.md, .codex/skills/, an operational task ledger, a repo-local
  Codex policy hook, and an operational Codex config snippet for a new or
  existing project. Use --lite to opt out of the heavy operational artifacts.
---

# Codex Init

You are scaffolding agent infrastructure for a Codex CLI project. The default
profile is operational and heavy. `--lite` and `--theme=lite` write root
AGENTS and base skills only: planner, dev, and reviewer. `--lite` skips repo
hooks, task ledger files, operational reviewer personas, and Codex config
snippet/global hook patch output. `--dry-run` prints planned writes without
creating directories or files.

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

const lite = false;
const ctx = {
  purpose,
  size,
  qa_personas,
  deploy_targets,
  constraints,
  ...detected,
  services_str: detected.services.join(", "),
  operationalProfile: !lite,
  liteProfile: lite,
  agents: lite ? [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
  ] : [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
    { name: "orchestrator",          when: "wave ownership and shared-tree safety" },
    { name: "verification-reviewer", when: "tests, typecheck, lint, diff scope" },
    { name: "qa-reviewer",           when: "user-flow and persona validation" },
    { name: "design-reviewer",       when: "UI hierarchy and design tokens" },
    { name: "security-reviewer",     when: "authz, secrets, destructive actions" },
    { name: "data-reviewer",         when: "migrations, seeds, fixtures, backfills" },
  ],
};
```

Render and write each template:

- `templates/AGENTS.md.hbs` → `AGENTS.md` (project root)
- `templates/skills/<role>/SKILL.md.hbs` → `.codex/skills/<role>/SKILL.md` for each agent role
- `templates/hooks/agent-policy-hook.mjs` → `.codex/hooks/agent-policy-hook.mjs`
- built-in task ledger templates → `docs/tasks/index.md` and `docs/tasks/_template.md`
- `templates/local-guides/AGENTS.md.hbs` → `.codex/AGENTS.md`

Use `apply_patch` for every file write. Refuse to overwrite existing files
unless the user passes `--force`; check every planned write before creating
directories or files. In lite mode, skip hooks, local guides, operational
reviewer skills, task-ledger files, and Codex config snippet output.

## Phase 3 — Summarize

Print a 3-line summary: detected stack, runtime (if any), profile, and the
roles scaffolded. In the operational/default profile, print the Codex config
snippet to stdout for manual merge. In lite mode, do not render or print the
Codex config snippet. Do not claim that global config was patched automatically.

## Phase 4 — Optional MCP config additions (operational/default only)

In the operational/default profile, the CLI emits
`templates/codex-config.toml.hbs` to stdout. If collecting MCP servers
interactively:

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
   ctx.hook_command_pretool_toml = JSON.stringify(`node "$(git rev-parse --show-toplevel)/.codex/hooks/agent-policy-hook.mjs"`);
   ctx.hook_command_pretool_windows_toml = JSON.stringify(
     `powershell -NoProfile -ExecutionPolicy Bypass -Command "node (Join-Path (git rev-parse --show-toplevel) '.codex/hooks/agent-policy-hook.mjs')"`
   );
   ctx.mcp_servers_block = mcp_servers_block;
   ```

4. Render `templates/codex-config.toml.hbs` to stdout. The operational
   profile points Bash-only PreToolUse at the repo-local hook. Do not include
   SessionStart hook content.

For `--lite` and `--theme=lite`, skip this phase entirely. Lite mode writes
root AGENTS and base skills only, and skips repo hooks, task ledger files,
operational reviewer personas, and Codex config snippet/global hook patch
output.
