---
name: codex-init
description: >
  Scaffold AGENTS.md, .codex/skills/, an operational task ledger, a repo-local
  Codex policy hook, and an operational Codex config snippet for a new or
  existing project. Use --lite to opt out of the heavy operational artifacts.
---

# /codex-init

You are scaffolding agent infrastructure for a Codex CLI project. The default
profile is operational and heavy. `--lite` and `--theme=lite` write root
AGENTS and base skills only: planner, dev, and reviewer. `--lite` skips repo
hooks, task ledger files, operational reviewer personas, and Codex config
snippet/global hook patch output. `--dry-run` prints planned writes without
creating directories or files. `--lang=en|ko|auto` records the selected
interaction language in `AGENTS.md`; keep `.agent-all.json` `language` aligned
with that value when the floor bundle is installed. `--update-foundations`
prints the approved foundation update plan, then updates/installs only
`superpowers@claude-plugins-official` and `context-mode@context-mode`;
`--dry-run --update-foundations` prints the same plan without mutation. This
does not patch global CLI config files.
When `/codex-init` is run through `scripts/install-platform.sh`, the wrapper
runs the post-install doctor automatically for `all`, `builder`, and `--lite`
profiles. For a manual skill run, re-run the same check with
`node /path/to/agent-skill/scripts/doctor.mjs --target=. --platform=codex --profile=builder`
or `--profile=lite`.

## Phase 1 — Gather

Ask the user (one at a time) for:

1. Project purpose (one or two sentences)
2. Project size: small / medium / large
3. QA personas (comma-separated, e.g., "auth, payments")
4. Deploy targets (e.g., "vercel", "fly.io", "github releases")
5. Special constraints (compliance, performance budgets, "" if none)

Run the project-detection helper to derive `stack`, `runtime`, `services`:

```javascript
import { detectProject } from "./lib/detect-stack.mjs";
const detected = detectProject(process.cwd()); // { stack, runtime, services }
```

## Phase 2 — Render

Build the discovery context:

```javascript
import { render } from "./lib/render.mjs";
import { scanFoundationState } from "./lib/foundation-check.mjs";

const lite = false;
const foundationState = scanFoundationState({ installedPluginIds });
const ctx = {
  purpose,
  size,
  qa_personas,
  deploy_targets,
  constraints,
  ...detected,
  language,
  services_str: detected.services.join(", "),
  operationalProfile: !lite,
  liteProfile: lite,
  degradedFoundations: !lite && foundationState.degraded,
  foundationMissing: foundationState.missing.join(", "),
  foundationUpdateCommand: foundationState.updateCommand,
  foundationInstructions: foundationState.instructions,
  agents: lite ? [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
  ] : [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
    { name: "orchestrator",          when: "wave ownership and shared-tree safety" },
    { name: "integration-dev",        when: "cross-stack wiring and API contracts" },
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
- `templates/task-ledger/AGENTS.md.hbs` → `docs/tasks/AGENTS.md`
- `templates/task-ledger/index.md.hbs` → `docs/tasks/index.md`
- `templates/task-ledger/_template.md.hbs` → `docs/tasks/_template.md`
- `templates/task-ledger/_handoff-template.md.hbs` → `docs/tasks/_handoff-template.md`
- `templates/task-ledger/agent-task-ledger-check.mjs` → `scripts/agent-task-ledger-check.mjs`
- operational workspace keepfiles → `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/decisions/`, and `docs/tasks/`
- `templates/local-guides/AGENTS.md.hbs` → `.codex/AGENTS.md`
- `templates/folder-guides/AGENTS.md.hbs` → `<detected-folder>/AGENTS.md`

Use `apply_patch` for every file write. Refuse to overwrite existing files
unless the user passes `--force`; check every planned write before creating
directories or files. In lite mode, skip hooks, local guides, operational
reviewer skills, task-ledger/workspace files, and Codex config snippet output.
In operational mode, detect whether `superpowers@claude-plugins-official` and
`context-mode@context-mode` are installed. Missing foundations do not abort the
scaffold; render the degraded foundation status, approved foundation updater,
and manual fallback install commands into `AGENTS.md`.
When `--update-foundations` is explicitly passed, print the approved foundation
update plan before running any foundation mutation. Refresh only the approved
foundation marketplaces, reinstall/update only the approved foundation plugins,
and do not patch global CLI config files.

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
   profile points Codex `PreToolUse` for `Bash` at the repo-local hook. Do not
   include SessionStart hook content.

For `--lite` and `--theme=lite`, skip this phase entirely. Lite mode writes
root AGENTS and base skills only, and skips repo hooks, task ledger files,
operational reviewer personas, and Codex config snippet/global hook patch
output.

## When done

Print the detected stack, runtime, profile, roles scaffolded, and in the
operational/default profile, the Codex config snippet for manual merge. Do not
claim that global config was patched automatically. Include the post-install
doctor command that matches the profile (`builder` for `/codex-init`, `lite`
for `--lite`) so the user can re-run validation.
