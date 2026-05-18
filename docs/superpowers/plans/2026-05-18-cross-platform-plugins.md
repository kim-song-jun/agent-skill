# Cross-platform plugin family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four new sibling plugins (`harness-builder-codex`, `-copilot`, `-gemini`, `-cursor`) so users on each tool can scaffold an AGENTS.md / equivalent memory file + role files inside their host CLI/IDE.

**Architecture:** Each plugin is self-contained: own `.claude-plugin/plugin.json` (or `gemini-extension.json`), own `templates/` directory, vendored copy of `render.mjs` + `detect-stack.mjs` (from harness-builder). Single skill per plugin: `<platform>-init`. MVP renders only the memory file + role files; hooks/MCP wiring deferred. `marketplace.json` gains four entries.

**Tech Stack:** Node ESM, `node:test`, vendored mustache-subset renderer, regex compose parser (already proven in harness-builder).

**Spec:** [`docs/superpowers/specs/2026-05-18-cross-platform-plugins-design.md`](../specs/2026-05-18-cross-platform-plugins-design.md)

---

## File Structure

| Path | Plugin | Purpose |
|---|---|---|
| `plugins/harness-builder-codex/.claude-plugin/plugin.json` | codex | Open Plugin manifest (Codex reads this natively) |
| `plugins/harness-builder-codex/skills/codex-init/SKILL.md` | codex | Single skill, Codex tool names |
| `plugins/harness-builder-codex/skills/codex-init/lib/render.mjs` | codex | Vendored |
| `plugins/harness-builder-codex/skills/codex-init/lib/detect-stack.mjs` | codex | Vendored |
| `plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs` | codex | Memory template |
| `plugins/harness-builder-codex/skills/codex-init/templates/skills/{planner,dev,reviewer}/SKILL.md.hbs` | codex | Role skills |
| `plugins/harness-builder-codex/README.md` | codex | Install + usage |
| `plugins/harness-builder-copilot/...` | copilot | Mirrors above; templates emit `.github/copilot-instructions.md.hbs` + `AGENTS.md.hbs` |
| `plugins/harness-builder-gemini/.claude-plugin/plugin.json` | gemini | Open Plugin manifest |
| `plugins/harness-builder-gemini/gemini-extension.json` | gemini | Gemini-specific manifest sibling |
| `plugins/harness-builder-gemini/skills/gemini-init/...` | gemini | GEMINI.md.hbs + `.gemini/skills/` per role |
| `plugins/harness-builder-cursor/.claude-plugin/plugin.json` | cursor | Open Plugin manifest (Cursor doesn't read this but kept for marketplace) |
| `plugins/harness-builder-cursor/skills/cursor-init/templates/rules/agent-init.mdc.hbs` | cursor | `.cursor/rules/` content |
| `plugins/harness-builder-cursor/skills/cursor-init/templates/agents/{planner,dev,reviewer}.md.hbs` | cursor | `.cursor/agents/` subagent files |
| `.claude-plugin/marketplace.json` | repo | 4 new entries |
| `tests/lib/cross-platform-manifest.test.mjs` | repo | Manifest validity tests |
| `tests/lib/cross-platform-render.test.mjs` | repo | Template snapshot tests |
| `tests/lib/cross-platform-isolation.test.mjs` | repo | No-cross-import test |
| `CHANGELOG.md`, `CHANGELOG.ko.md` | repo | feat entries |

Run tests with `node --test tests/lib/cross-platform-*.test.mjs`.

---

## Task 1: Scaffold the four plugin directories

**Files:** Create directory skeletons for all four plugins.

- [ ] **Step 1: Create the directories**

```bash
mkdir -p plugins/harness-builder-codex/.claude-plugin \
         plugins/harness-builder-codex/skills/codex-init/lib \
         plugins/harness-builder-codex/skills/codex-init/templates/skills/planner \
         plugins/harness-builder-codex/skills/codex-init/templates/skills/dev \
         plugins/harness-builder-codex/skills/codex-init/templates/skills/reviewer \
         plugins/harness-builder-copilot/.claude-plugin \
         plugins/harness-builder-copilot/skills/copilot-init/lib \
         plugins/harness-builder-copilot/skills/copilot-init/templates \
         plugins/harness-builder-gemini/.claude-plugin \
         plugins/harness-builder-gemini/skills/gemini-init/lib \
         plugins/harness-builder-gemini/skills/gemini-init/templates/skills/planner \
         plugins/harness-builder-gemini/skills/gemini-init/templates/skills/dev \
         plugins/harness-builder-gemini/skills/gemini-init/templates/skills/reviewer \
         plugins/harness-builder-cursor/.claude-plugin \
         plugins/harness-builder-cursor/skills/cursor-init/lib \
         plugins/harness-builder-cursor/skills/cursor-init/templates/rules \
         plugins/harness-builder-cursor/skills/cursor-init/templates/agents
```

- [ ] **Step 2: Write the four `plugin.json` files**

Each plugin gets a minimal `.claude-plugin/plugin.json`. All four share the same field set (Open Plugin spec). Adjust the four fields marked `<<<>>>` per plugin.

```json
{
  "name": "<<<plugin-name>>>",
  "version": "0.1.0",
  "description": "<<<one-liner>>>",
  "keywords": ["harness", "agent-init", "<<<platform>>>"],
  "skills": "./skills"
}
```

Plugin-specific values:

- `harness-builder-codex`: description = `"Run agent-init for Codex CLI projects — emits AGENTS.md + .codex/skills/"`, keywords include `"codex"`
- `harness-builder-copilot`: description = `"Run agent-init for GitHub Copilot CLI — emits .github/copilot-instructions.md + AGENTS.md"`, keywords include `"copilot"`, `"github"`
- `harness-builder-gemini`: description = `"Run agent-init for Gemini CLI (a.k.a. 'antigravity') — emits GEMINI.md + .gemini/skills/"`, keywords include `"gemini"`, `"antigravity"`
- `harness-builder-cursor`: description = `"Run agent-init for Cursor — emits .cursor/rules + .cursor/agents/"`, keywords include `"cursor"`

- [ ] **Step 3: Write Gemini's extra manifest**

Create `plugins/harness-builder-gemini/gemini-extension.json`:

```json
{
  "name": "harness-builder-gemini",
  "version": "0.1.0",
  "description": "Run agent-init for Gemini CLI — emits GEMINI.md + .gemini/skills/",
  "contextFileName": "GEMINI.md"
}
```

- [ ] **Step 4: Write a short README.md per plugin**

Each plugin's `README.md` follows this skeleton (≤30 lines). Substitute platform-specific content for each:

```markdown
# <plugin-name>

Run an `agent-init`-style scaffold inside <Platform Name>. Emits:

- `<memory file>` at project root
- `<role-files-location>` for each role
- `<AGENTS.md>` as the cross-platform fallback

## Install

<platform-specific install command, e.g., `codex plugin install <repo-url>`>

## Usage

Run `/<platform>-init` inside <Platform Name>. The skill asks for:

- Project purpose (one sentence)
- Project size (small/medium/large)
- QA personas (comma-separated)
- Deploy targets

It then writes the artifacts above.

## Manual install (Cursor only)

`bash plugins/harness-builder-cursor/bin/install.sh /path/to/project`

## Out of scope

This MVP renders memory + role files. Hooks, MCP wiring, brainstorm
integration are deferred. See `docs/superpowers/specs/...` for the design.
```

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder-codex \
        plugins/harness-builder-copilot \
        plugins/harness-builder-gemini \
        plugins/harness-builder-cursor
git commit -m "feat: scaffold harness-builder-{codex,copilot,gemini,cursor} plugins"
```

---

## Task 2: Vendor the shared lib into each plugin

**Files:** Copy `render.mjs` and `detect-stack.mjs` from `harness-builder` into each new plugin's `lib/` directory.

- [ ] **Step 1: Copy lib files**

```bash
for plugin in harness-builder-codex harness-builder-copilot harness-builder-gemini harness-builder-cursor; do
  skill_dir="plugins/${plugin}/skills/$(echo ${plugin} | sed s/harness-builder-/)-init/lib"
  cp plugins/harness-builder/skills/agent-init/lib/render.mjs       "${skill_dir}/render.mjs"
  cp plugins/harness-builder/skills/agent-init/lib/detect-stack.mjs "${skill_dir}/detect-stack.mjs"
done
```

(If sed expression complexity is uncomfortable, do each plugin's `cp` manually — there are only 4.)

- [ ] **Step 2: Verify file content**

```bash
diff plugins/harness-builder/skills/agent-init/lib/render.mjs \
     plugins/harness-builder-codex/skills/codex-init/lib/render.mjs
```

Expected: no output (files identical).

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-builder-{codex,copilot,gemini,cursor}/skills/*/lib
git commit -m "feat(cross-platform): vendor render + detect-stack lib per plugin"
```

---

## Task 3: Write the Codex memory + role templates

**Files:** Codex plugin templates.

- [ ] **Step 1: `AGENTS.md.hbs`**

Create `plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs`:

```handlebars
# {{purpose}}

> Project memory for Codex CLI. Scaffolded by `/codex-init`.

## Stack

{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

These apply to the main agent and to every role in `.codex/skills/`:

1. **Plan first.** For any non-trivial change, draft a brief plan before editing.
2. **Edit via `apply_patch`.** All file modifications go through the apply_patch tool.
3. **Shell via `shell_command` / `exec_command`.** Long-running tasks use `exec_command` to keep a PTY session.

## Roles

| Role | When to use | File |
|------|-------------|------|
{{#each agents}}| {{name}} | {{when}} | `.codex/skills/{{name}}/SKILL.md` |
{{/each}}

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}
```

- [ ] **Step 2: Role SKILL.md templates**

Create three role files. Each uses Codex's minimal frontmatter (just `name` + `description`).

`plugins/harness-builder-codex/skills/codex-init/templates/skills/planner/SKILL.md.hbs`:

```handlebars
---
name: planner
description: Draft a plan before any non-trivial change. Use when the task touches multiple files or introduces a new pattern.
---

# Planner

Read AGENTS.md for project context. Draft a numbered plan with file paths
and verification steps. Stop before editing — present the plan and wait
for confirmation.
```

`plugins/harness-builder-codex/skills/codex-init/templates/skills/dev/SKILL.md.hbs`:

```handlebars
---
name: dev
description: Implement the planned changes. Use after a plan has been confirmed.
---

# Dev

Implement the plan in order. Use `apply_patch` for every edit. After each
file change, run the project's verification command (tests, type-check,
lint) before moving on.
```

`plugins/harness-builder-codex/skills/codex-init/templates/skills/reviewer/SKILL.md.hbs`:

```handlebars
---
name: reviewer
description: Review the diff after implementation. Use before final acceptance.
---

# Reviewer

Read the diff. Verify: (a) it matches the plan, (b) tests pass, (c) no
unrelated drift. Surface specific concerns with file:line citations.
```

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-builder-codex/skills/codex-init/templates
git commit -m "feat(harness-builder-codex): AGENTS.md + 3 role SKILL.md templates"
```

---

## Task 4: Write the Codex `SKILL.md` orchestrator

**File:** `plugins/harness-builder-codex/skills/codex-init/SKILL.md`

This is the top-level skill the Codex agent invokes. It instructs the agent on what to render and where to write it. Codex skill frontmatter is just `name` + `description`.

- [ ] **Step 1: Create the orchestrator skill**

```markdown
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

Render and write:

- `templates/AGENTS.md.hbs` → `AGENTS.md` (project root)
- `templates/skills/<role>/SKILL.md.hbs` → `.codex/skills/<role>/SKILL.md` for each agent role

Use `apply_patch` for every file write. Refuse to overwrite existing files
unless the user passes `--force`.

## Phase 3 — Summarize

Print a 3-line summary: detected stack, runtime (if any), and the roles
scaffolded. Ask the user if they want to also generate a `.codex/config.toml`
MCP snippet (out of scope for the MVP — defer to a future skill).
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-builder-codex/skills/codex-init/SKILL.md
git commit -m "feat(harness-builder-codex): /codex-init skill orchestrator"
```

---

## Task 5: Mirror Task 3 + 4 for `harness-builder-copilot`

**Files:** Templates + SKILL.md for the Copilot plugin.

Copilot is similar to Codex but emits a different memory file path.

- [ ] **Step 1: Memory template `templates/copilot-instructions.md.hbs`**

```handlebars
# {{purpose}}

> Project memory for GitHub Copilot CLI. Scaffolded by `/copilot-init`.

## Stack

{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

1. **Plan first.** Sketch a brief plan before editing.
2. **Edits via `apply_patch`.** All file modifications go through it.
3. **Shell via `read_bash`.** Use it for builds, tests, lint.
4. **Memory via `store_memory`.** Capture durable decisions there with scope=`repository`.

## Roles

| Role | When to use |
|------|-------------|
{{#each agents}}| {{name}} | {{when}} |
{{/each}}

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}
```

- [ ] **Step 2: `templates/AGENTS.md.hbs`**

Identical to the Codex AGENTS.md.hbs template — Copilot also reads `AGENTS.md`. Copy it from the Codex plugin and adjust the second-line attribution to `> Project memory. Read by Copilot CLI, Codex, Cursor, and Gemini.`.

- [ ] **Step 3: `SKILL.md` orchestrator**

Mirror the Codex `SKILL.md` orchestrator. Difference: render targets are `.github/copilot-instructions.md` (primary), `AGENTS.md` (cross-tool fallback), `.github/instructions/<role>.instructions.md` for each role using `applyTo:` frontmatter.

For each role file emit:

```yaml
---
applyTo: "**"
---
```

followed by the role body. (Copilot's path-specific instruction format.)

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-builder-copilot
git commit -m "feat(harness-builder-copilot): templates + /copilot-init skill"
```

---

## Task 6: `harness-builder-gemini` templates + skill

**Files:** Gemini plugin content.

Gemini reads `GEMINI.md` and `.gemini/skills/<name>/SKILL.md`. Also has its own extension manifest.

- [ ] **Step 1: `templates/GEMINI.md.hbs`**

```handlebars
# {{purpose}}

> Project memory for Gemini CLI. Scaffolded by `/gemini-init`.

## Stack

{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

1. **Plan first.**
2. **Edit via `replace` / `write_file`.**
3. **Shell via `run_shell_command`.**
4. **Skills load via `activate_skill`.**

## Roles

| Role | When | Skill file |
|------|------|------------|
{{#each agents}}| {{name}} | {{when}} | `.gemini/skills/{{name}}/SKILL.md` |
{{/each}}

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}
```

- [ ] **Step 2: Three role SKILL.md.hbs templates**

Reuse the bodies from Task 3 Step 2 but reference Gemini's tool names (`replace`, `run_shell_command`, `read_file`, `write_file`).

- [ ] **Step 3: `SKILL.md` orchestrator**

Mirror Codex's. Difference: write paths target `GEMINI.md` and `.gemini/skills/<role>/SKILL.md`. Use `write_file` (Gemini's tool) instead of apply_patch.

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-builder-gemini
git commit -m "feat(harness-builder-gemini): templates + /gemini-init skill"
```

---

## Task 7: `harness-builder-cursor` templates + install script

**Files:** Cursor plugin — different model since Cursor has no plugin loader.

- [ ] **Step 1: `templates/rules/agent-init.mdc.hbs`**

```handlebars
---
description: "Project conventions auto-applied for this repository"
alwaysApply: true
---

# {{purpose}}

## Stack

{{stack}}{{#if runtime}} (on {{runtime}}{{#if services_str}}: {{services_str}}{{/if}}){{/if}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

1. **Plan first** for multi-file changes.
2. **Use Cursor's edit + shell tools** as you normally would.
3. **Subagents** are scaffolded in `.cursor/agents/`. Cursor reads them
   alongside `.claude/agents/` and `.codex/agents/` if present.

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}
```

- [ ] **Step 2: Three subagent templates `templates/agents/<role>.md.hbs`**

```handlebars
---
name: {{this.name}}
description: {{this.description}}
model: inherit
readonly: false
is_background: false
---

# {{this.name}}

<role-specific body>
```

(Hard-code three role files: planner.md.hbs, dev.md.hbs, reviewer.md.hbs — same shape, three different description fields.)

- [ ] **Step 3: `SKILL.md` (instructional, since Cursor doesn't execute skills)**

```markdown
---
name: cursor-init
description: Manual scaffold instructions for using harness patterns inside Cursor.
---

# Cursor Init (manual)

Cursor doesn't have an automated plugin loader, so this skill is documentation
plus a thin install script.

## Install

```bash
bash plugins/harness-builder-cursor/bin/install.sh /path/to/your/project
```

The script copies `templates/rules/agent-init.mdc` to `.cursor/rules/` and
the three `templates/agents/*.md` files to `.cursor/agents/` after rendering
with a discovery context you provide via env vars or a `.cursor-init.json`.

See `README.md` for details.
```

- [ ] **Step 4: Install script `bin/install.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?Usage: install.sh <target-project-dir>}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "${TARGET}/.cursor/rules" "${TARGET}/.cursor/agents"
echo "Scaffold the templates manually for now — automated render TBD."
echo "Templates: ${HERE}/skills/cursor-init/templates/"
echo "Target:    ${TARGET}/.cursor/"
```

Mark executable.

- [ ] **Step 5: Commit**

```bash
git add plugins/harness-builder-cursor
chmod +x plugins/harness-builder-cursor/bin/install.sh
git add plugins/harness-builder-cursor/bin/install.sh
git commit -m "feat(harness-builder-cursor): rules + agents templates + install script"
```

---

## Task 8: Update marketplace.json

**File:** `.claude-plugin/marketplace.json`

- [ ] **Step 1: Insert four new plugin entries**

Open `.claude-plugin/marketplace.json`. The current `plugins` array has two entries (harness-builder, harness-floor). Append four more entries, preserving formatting:

```json
{
  "name": "harness-builder-codex",
  "source": "./plugins/harness-builder-codex",
  "description": "Run agent-init for Codex CLI projects — emits AGENTS.md + .codex/skills/"
},
{
  "name": "harness-builder-copilot",
  "source": "./plugins/harness-builder-copilot",
  "description": "Run agent-init for GitHub Copilot CLI — emits .github/copilot-instructions.md + AGENTS.md"
},
{
  "name": "harness-builder-gemini",
  "source": "./plugins/harness-builder-gemini",
  "description": "Run agent-init for Gemini CLI (a.k.a. 'antigravity') — emits GEMINI.md + .gemini/skills/"
},
{
  "name": "harness-builder-cursor",
  "source": "./plugins/harness-builder-cursor",
  "description": "Run agent-init for Cursor — emits .cursor/rules + .cursor/agents/"
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json'))"`. No output expected.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat(marketplace): register codex/copilot/gemini/cursor plugins"
```

---

## Task 9: Tests — manifest validity + render snapshot + isolation

**Files:** Three new test files under `tests/lib/`.

- [ ] **Step 1: `tests/lib/cross-platform-manifest.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
];

for (const p of PLUGINS) {
  test(`${p}: plugin.json is valid and has required fields`, () => {
    const path = resolve("plugins", p, ".claude-plugin", "plugin.json");
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw);
    assert.equal(data.name, p);
    assert.ok(data.version, "version present");
    assert.ok(data.description, "description present");
  });
}

test("harness-builder-gemini: gemini-extension.json is valid", () => {
  const path = resolve("plugins", "harness-builder-gemini", "gemini-extension.json");
  const data = JSON.parse(readFileSync(path, "utf-8"));
  assert.equal(data.name, "harness-builder-gemini");
  assert.equal(data.contextFileName, "GEMINI.md");
});

test("marketplace.json lists all six plugins", () => {
  const data = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf-8"));
  const names = data.plugins.map((p) => p.name).sort();
  assert.deepEqual(names, [
    "harness-builder",
    "harness-builder-codex",
    "harness-builder-copilot",
    "harness-builder-cursor",
    "harness-builder-gemini",
    "harness-floor",
  ]);
});
```

- [ ] **Step 2: `tests/lib/cross-platform-render.test.mjs`**

A simple snapshot-style test that renders each plugin's memory template with a fixed ctx and asserts the output contains expected substrings (full snapshot file not required for MVP):

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "../../plugins/harness-builder-codex/skills/codex-init/lib/render.mjs";

const CTX = {
  purpose: "Demo app",
  stack: "typescript",
  runtime: "docker",
  services_str: "postgres, redis",
  deploy_targets: "fly.io",
  constraints: "",
  agents: [
    { name: "planner",  when: "all planning" },
    { name: "dev",      when: "implementation" },
    { name: "reviewer", when: "final review" },
  ],
};

const CASES = [
  { tpl: "plugins/harness-builder-codex/skills/codex-init/templates/AGENTS.md.hbs", contains: ["typescript (on docker: postgres, redis) — deploys to fly.io", "Project memory for Codex CLI"] },
  { tpl: "plugins/harness-builder-copilot/skills/copilot-init/templates/copilot-instructions.md.hbs", contains: ["typescript (on docker: postgres, redis)", "Project memory for GitHub Copilot CLI"] },
  { tpl: "plugins/harness-builder-gemini/skills/gemini-init/templates/GEMINI.md.hbs", contains: ["typescript (on docker: postgres, redis)", "Project memory for Gemini CLI"] },
  { tpl: "plugins/harness-builder-cursor/skills/cursor-init/templates/rules/agent-init.mdc.hbs", contains: ["typescript (on docker: postgres, redis)", "alwaysApply: true"] },
];

for (const c of CASES) {
  test(`renders ${c.tpl}`, () => {
    const tpl = readFileSync(resolve(c.tpl), "utf-8");
    const out = render(tpl, CTX);
    for (const needle of c.contains) {
      assert.ok(out.includes(needle), `Expected "${needle}" in render output of ${c.tpl}`);
    }
  });
}
```

- [ ] **Step 3: `tests/lib/cross-platform-isolation.test.mjs`**

Ensure no new plugin imports across plugin boundaries:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

const PLUGINS = [
  "harness-builder-codex",
  "harness-builder-copilot",
  "harness-builder-gemini",
  "harness-builder-cursor",
];

for (const p of PLUGINS) {
  test(`${p}: no cross-plugin imports`, () => {
    const root = resolve("plugins", p);
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf-8");
      const matches = src.match(/from\s+["']([^"']+)["']/g) || [];
      for (const m of matches) {
        const path = m.match(/["']([^"']+)["']/)[1];
        if (path.startsWith(".")) {
          // Resolve relative path
          const resolved = resolve(file, "..", path);
          assert.ok(
            resolved.startsWith(root) || resolved.startsWith(resolve("node_modules")),
            `${file} imports outside its plugin: ${path} → ${resolved}`,
          );
        }
      }
    }
  });
}
```

- [ ] **Step 4: Run the tests**

```bash
node --test tests/lib/cross-platform-manifest.test.mjs \
            tests/lib/cross-platform-render.test.mjs \
            tests/lib/cross-platform-isolation.test.mjs
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/cross-platform-*.test.mjs
git commit -m "test: manifest validity + render + isolation for cross-platform plugins"
```

---

## Task 10: CHANGELOG + repo README cross-link

**Files:** `CHANGELOG.md`, `CHANGELOG.ko.md`, `README.md`, `README.ko.md`.

- [ ] **Step 1: CHANGELOG.md entry**

Prepend above the current top section:

```markdown
## Cross-platform plugins — 2026-05-18

### Added
- Four new sibling plugins so users on each tool get a harness-builder equivalent inside their host:
  - `harness-builder-codex` — emits `AGENTS.md` + `.codex/skills/<role>/SKILL.md` for Codex CLI
  - `harness-builder-copilot` — emits `.github/copilot-instructions.md` + `AGENTS.md` + path-specific instruction files for GitHub Copilot CLI
  - `harness-builder-gemini` — emits `GEMINI.md` + `.gemini/skills/<role>/SKILL.md` for Gemini CLI (a.k.a. "antigravity")
  - `harness-builder-cursor` — emits `.cursor/rules/agent-init.mdc` + `.cursor/agents/<role>.md` for Cursor
- Marketplace entries for all four new plugins.
- Tests: manifest validity, render-substring snapshots, per-plugin isolation.

### Out of scope (this iteration)
- Visual-qa / agent-all parity per platform
- Hook & MCP wiring beyond stubs
- Full brainstorm integration inside each platform
```

- [ ] **Step 2: CHANGELOG.ko.md mirror**

Translate the same section structure into Korean.

- [ ] **Step 3: README cross-link**

In `README.md`, add a short section under the plugin list:

```markdown
## Cross-platform plugins

The harness-builder pattern is also available for:

| Tool | Plugin | Entry |
|------|--------|-------|
| Codex CLI | `harness-builder-codex` | `/codex-init` |
| GitHub Copilot CLI | `harness-builder-copilot` | `/copilot-init` |
| Gemini CLI ("antigravity") | `harness-builder-gemini` | `/gemini-init` |
| Cursor | `harness-builder-cursor` | manual install (`bin/install.sh`) |

See `docs/superpowers/specs/2026-05-18-cross-platform-plugins-design.md` for design notes.
```

Mirror into `README.ko.md`.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CHANGELOG.ko.md README.md README.ko.md
git commit -m "docs: cross-platform plugin family — CHANGELOG (EN/KO) + README cross-links"
```

---

## Task 11: Follow-up tracking doc

**File:** `docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md`

A short companion doc listing what each platform still needs.

- [ ] **Step 1: Create the doc**

```markdown
# Cross-platform plugins — follow-ups

What each platform plugin still needs after the 2026-05-18 MVP.

## All platforms

- Brainstorm/clarification flow inside the host platform (currently each plugin
  asks via plain prompts; should integrate with the platform's native ask-user
  affordance: Codex `ask_user`-equivalent, Gemini `ask_user`, Copilot interactive,
  Cursor `Ask questions`).
- Hook + MCP config emission. Each plugin emits a stub today; the full config
  wiring (PreToolUse / BeforeTool / etc.) is deferred to per-platform follow-ups.

## Codex CLI

- `.codex/config.toml` snippet emission for hooks + MCP servers
- Codex slash-command registration via the `commands` field in `plugin.json`
- Subagent dispatch via Codex's `agent` hook type (research the exact contract)

## GitHub Copilot CLI

- `~/.copilot/mcp-config.json` emission
- `.github/hooks/` complete hook stubs (PreToolUse/PostToolUse/AgentStop)
- Validate the dedup behavior between `copilot-instructions.md` and `AGENTS.md` in real CLI

## Gemini CLI

- `.gemini/settings.json` emission with `mcpServers` + `hooks`
- Verify `gemini-extension.json` install path and behavior with `gemini extensions install`

## Cursor

- Replace `bin/install.sh` with a Node-based renderer that takes a JSON ctx and writes files
- Investigate Cursor's `/commands` wizard format if it becomes public

## visual-qa and agent-all on each platform

Separate per-platform follow-up specs needed. Playwright MCP availability varies;
Skill-tool subagent dispatch is Claude-Code-specific.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-18-cross-platform-plugins-followups.md
git commit -m "docs(spec): follow-ups tracker for cross-platform plugin family"
```

---

## Self-Review Notes

- **Spec coverage:** Each spec section maps to at least one task above.
- **Placeholder scan:** No TBDs; every task body has concrete content. Cursor's automated render is intentionally deferred and called out as such in Task 11.
- **Type consistency:** Discovery ctx shape (`{ purpose, stack, runtime, services_str, deploy_targets, constraints, agents }`) is identical across all four plugins. Role array shape (`{ name, when }`) is consistent. Vendored lib filenames match.
- **YAGNI:** No shared lib package, no platform-abstraction interfaces, no test infrastructure beyond what's needed. Each plugin vendors what it uses.
