# Harness Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/harness-init` skill as a Claude Code plugin marketplace, packaging it so a fresh project can be bootstrapped with CLAUDE.md + .claude/agents/ + hooks + plugin wiring in one invocation.

**Architecture:** Single plugin marketplace at repo root. One thin SKILL.md orchestrates 5 phase prompts. Deterministic mechanics (template rendering, settings merge, stack detection, plugin scan) live as pure-JS modules in `skills/harness-init/lib/` and are TDD'd. Templates are mustache-style `.hbs` files rendered by an in-house 50-line engine — zero npm dependencies.

**Tech Stack:** Node.js native test runner (`node --test`), pure ES modules, no third-party deps. Plugin manifest follows the Claude Code plugin schema.

**Spec:** `docs/superpowers/specs/2026-05-17-harness-builder-design.md`

---

## File Structure

Mapped to spec §4.1 plus tests:

```
agent-skill/
├── .claude-plugin/
│   ├── marketplace.json         # registers this repo as a plugin marketplace
│   └── plugin.json              # registers skills + global hooks
├── skills/harness-init/
│   ├── SKILL.md                 # ≤150 lines, thin orchestrator
│   ├── phases/
│   │   ├── 1-discover.md
│   │   ├── 2-claude-md.md
│   │   ├── 3-agents.md
│   │   ├── 4-hooks.md
│   │   └── 5-wire.md
│   ├── lib/
│   │   ├── render.mjs           # mustache-subset template engine
│   │   ├── detect-stack.mjs     # manifest-based stack detection
│   │   ├── plugin-scan.mjs      # installed_plugins.json classification
│   │   └── manifest-merge.mjs   # settings.local.json merge
│   ├── templates/
│   │   ├── CLAUDE.md.hbs
│   │   ├── settings.local.json.hbs
│   │   ├── agents/
│   │   │   ├── planner.md.hbs
│   │   │   ├── dev.md.hbs
│   │   │   ├── reviewer.md.hbs
│   │   │   ├── designer.md.hbs
│   │   │   ├── qa.md.hbs
│   │   │   ├── tester.md.hbs
│   │   │   ├── frontend-dev.md.hbs
│   │   │   ├── backend-dev.md.hbs
│   │   │   └── doc-writer.md.hbs
│   │   └── hooks/
│   │       ├── context-mode-router.mjs
│   │       ├── session-summary.mjs
│   │       └── cache-heal.mjs
│   └── references/
│       └── legacy-notes.md      # archive of original 3 user skills
├── hooks/
│   └── context-mode-cache-heal.mjs   # migrated global hook
├── tests/
│   ├── lib/
│   │   ├── detect-stack.test.mjs
│   │   ├── plugin-scan.test.mjs
│   │   ├── manifest-merge.test.mjs
│   │   └── render.test.mjs
│   ├── fixtures/
│   │   ├── stacks/{node-ts,python,rust,go,monorepo}/   # tiny fake projects
│   │   └── plugins/{all-enabled,partial,missing}.json
│   └── manual-checklist.md
├── README.md
├── CHANGELOG.md
└── .gitignore
```

Every file above is created by exactly one task below.

---

## Task 1: Repo bootstrap — README, .gitignore, CHANGELOG

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `CHANGELOG.md`

- [ ] **Step 1: Write `.gitignore`**

```
# Node
node_modules/
*.log

# Test artefacts
tests/tmp/
coverage/

# OS
.DS_Store
Thumbs.db

# Per-project harness state (only relevant when this repo is itself harnessed)
.claude/.harness-state.json
```

- [ ] **Step 2: Write `README.md`**

```markdown
# agent-skill

Claude Code plugin marketplace for `/harness-init` and (eventually) sibling skills that bootstrap project-level agent harnesses.

## Install

\`\`\`
/plugin marketplace add https://github.com/<owner>/agent-skill
/plugin install harness-builder@agent-skill
\`\`\`

## What it ships

- `harness-builder` plugin → `/harness-init` skill
- Global hook `context-mode-cache-heal.mjs` (SessionStart)

See `docs/superpowers/specs/` for design, `docs/superpowers/plans/` for implementation plans.

## Themes (roadmap)

| Theme | Plugin | Status |
|-------|--------|--------|
| A. Per-project harness builder | `harness-builder` | implementing |
| B. Token-cost optimisation | `harness-thrift` | planned |
| C. Cost-unrestricted parallel mode | `harness-floor` | planned |
```

- [ ] **Step 3: Write `CHANGELOG.md`**

```markdown
# Changelog

## [Unreleased]

- Initial repo scaffold
- `harness-builder` plugin in development (theme A)
```

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore CHANGELOG.md
git commit -m "chore: repo bootstrap (README, .gitignore, CHANGELOG)"
```

---

## Task 2: Plugin manifest

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Write `.claude-plugin/marketplace.json`**

```json
{
  "name": "agent-skill",
  "description": "Harness builder + optimisation skills for Claude Code",
  "plugins": [
    {
      "name": "harness-builder",
      "source": "./",
      "description": "Bootstrap CLAUDE.md, .claude/agents/, hooks, and plugin wiring with /harness-init"
    }
  ]
}
```

- [ ] **Step 2: Write `.claude-plugin/plugin.json`**

```json
{
  "name": "harness-builder",
  "version": "0.1.0",
  "description": "Single-command project harness bootstrapper",
  "skills": ["skills/harness-init"],
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/context-mode-cache-heal.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/
git commit -m "feat(plugin): add marketplace + plugin manifests for harness-builder"
```

---

## Task 3: Migrate global cache-heal hook

**Files:**
- Create: `hooks/context-mode-cache-heal.mjs`

- [ ] **Step 1: Copy existing global hook content**

Source content (verbatim from `C:/Users/kinso/.claude/hooks/context-mode-cache-heal.mjs`):

```javascript
#!/usr/bin/env node
// context-mode plugin cache self-heal (auto-deployed)
// Fixes anthropics/claude-code#46915: auto-update breaks CLAUDE_PLUGIN_ROOT
// Pure Node.js — no bash/shell dependency.
import { existsSync, readdirSync, statSync, symlinkSync, lstatSync, unlinkSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";
try {
  const f = resolve(homedir(), ".claude", "plugins", "installed_plugins.json");
  if (!existsSync(f)) process.exit(0);
  const cacheRoot = resolve(homedir(), ".claude", "plugins", "cache");
  const ip = JSON.parse(readFileSync(f, "utf-8"));
  for (const [k, es] of Object.entries(ip.plugins || {})) {
    if (k !== "context-mode@context-mode") continue;
    for (const e of es) {
      const p = e.installPath;
      if (!p || existsSync(p)) continue;
      if (!resolve(p).startsWith(cacheRoot + sep)) continue;
      const parent = dirname(p);
      if (!existsSync(parent)) continue;
      try { if (lstatSync(p).isSymbolicLink()) unlinkSync(p); } catch {}
      const dirs = readdirSync(parent).filter(d => /^\d+\.\d+/.test(d) && statSync(join(parent, d)).isDirectory());
      if (!dirs.length) continue;
      dirs.sort((a, b) => {
        const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
        }
        return 0;
      });
      try { symlinkSync(join(parent, dirs[dirs.length - 1]), p, process.platform === "win32" ? "junction" : undefined); } catch {}
    }
  }
} catch {}
```

- [ ] **Step 2: Verify it runs without error against the current user env**

Run: `node hooks/context-mode-cache-heal.mjs && echo "ok"`
Expected: prints `ok`. No exceptions.

- [ ] **Step 3: Commit**

```bash
git add hooks/context-mode-cache-heal.mjs
git commit -m "feat(hooks): migrate context-mode cache-heal hook into repo"
```

---

## Task 4: `lib/detect-stack.mjs` — TDD

**Files:**
- Create: `tests/fixtures/stacks/node-ts/package.json`
- Create: `tests/fixtures/stacks/node-ts/tsconfig.json`
- Create: `tests/fixtures/stacks/python/pyproject.toml`
- Create: `tests/fixtures/stacks/rust/Cargo.toml`
- Create: `tests/fixtures/stacks/go/go.mod`
- Create: `tests/fixtures/stacks/monorepo/package.json`
- Create: `tests/lib/detect-stack.test.mjs`
- Create: `skills/harness-init/lib/detect-stack.mjs`

- [ ] **Step 1: Create the 5 fixture projects (minimal contents)**

```bash
mkdir -p tests/fixtures/stacks/node-ts tests/fixtures/stacks/python tests/fixtures/stacks/rust tests/fixtures/stacks/go tests/fixtures/stacks/monorepo
```

Then write each:

`tests/fixtures/stacks/node-ts/package.json`:
```json
{ "name": "fixture-node-ts", "version": "0.0.0" }
```

`tests/fixtures/stacks/node-ts/tsconfig.json`:
```json
{ "compilerOptions": { "target": "ES2022" } }
```

`tests/fixtures/stacks/python/pyproject.toml`:
```
[project]
name = "fixture-python"
version = "0.0.0"
```

`tests/fixtures/stacks/rust/Cargo.toml`:
```
[package]
name = "fixture-rust"
version = "0.0.0"
edition = "2021"
```

`tests/fixtures/stacks/go/go.mod`:
```
module fixture-go

go 1.22
```

`tests/fixtures/stacks/monorepo/package.json`:
```json
{ "name": "fixture-monorepo", "private": true, "workspaces": ["packages/*"] }
```

- [ ] **Step 2: Write `tests/lib/detect-stack.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { detectStack } from "../../skills/harness-init/lib/detect-stack.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "stacks", name);

test("detects typescript when package.json + tsconfig.json present", () => {
  assert.equal(detectStack(fx("node-ts")), "typescript");
});

test("detects python when pyproject.toml present", () => {
  assert.equal(detectStack(fx("python")), "python");
});

test("detects rust when Cargo.toml present", () => {
  assert.equal(detectStack(fx("rust")), "rust");
});

test("detects go when go.mod present", () => {
  assert.equal(detectStack(fx("go")), "go");
});

test("detects javascript when package.json without tsconfig.json", () => {
  assert.equal(detectStack(fx("monorepo")), "javascript");
});

test("returns 'unknown' when no recognized manifest", () => {
  assert.equal(detectStack(fx("__nonexistent__")), "unknown");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: FAIL — cannot find module `detect-stack.mjs`.

- [ ] **Step 4: Write `skills/harness-init/lib/detect-stack.mjs`**

```javascript
import { existsSync } from "node:fs";
import { join } from "node:path";

const RULES = [
  { stack: "typescript", check: (d) => existsSync(join(d, "package.json")) && existsSync(join(d, "tsconfig.json")) },
  { stack: "javascript", check: (d) => existsSync(join(d, "package.json")) },
  { stack: "python",     check: (d) => existsSync(join(d, "pyproject.toml")) || existsSync(join(d, "requirements.txt")) || existsSync(join(d, "setup.py")) },
  { stack: "rust",       check: (d) => existsSync(join(d, "Cargo.toml")) },
  { stack: "go",         check: (d) => existsSync(join(d, "go.mod")) },
];

export function detectStack(projectDir) {
  if (!existsSync(projectDir)) return "unknown";
  for (const r of RULES) {
    if (r.check(projectDir)) return r.stack;
  }
  return "unknown";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/lib/detect-stack.test.mjs`
Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/stacks tests/lib/detect-stack.test.mjs skills/harness-init/lib/detect-stack.mjs
git commit -m "feat(lib): detect-stack with TDD coverage for 5 stacks + unknown"
```

---

## Task 5: `lib/plugin-scan.mjs` — TDD

**Files:**
- Create: `tests/fixtures/plugins/all-enabled.json`
- Create: `tests/fixtures/plugins/partial.json`
- Create: `tests/fixtures/plugins/missing.json`
- Create: `tests/lib/plugin-scan.test.mjs`
- Create: `skills/harness-init/lib/plugin-scan.mjs`

- [ ] **Step 1: Write fixtures**

`tests/fixtures/plugins/all-enabled.json` (combined: installed + enabled):
```json
{
  "installed": { "plugins": { "context-mode@context-mode": [{ "installPath": "/tmp/x" }], "superpowers@claude-plugins-official": [{ "installPath": "/tmp/y" }] } },
  "enabled": { "context-mode@context-mode": true, "superpowers@claude-plugins-official": true }
}
```

`tests/fixtures/plugins/partial.json`:
```json
{
  "installed": { "plugins": { "context-mode@context-mode": [{ "installPath": "/tmp/x" }], "superpowers@claude-plugins-official": [{ "installPath": "/tmp/y" }] } },
  "enabled": { "context-mode@context-mode": true }
}
```

`tests/fixtures/plugins/missing.json`:
```json
{
  "installed": { "plugins": {} },
  "enabled": {}
}
```

- [ ] **Step 2: Write `tests/lib/plugin-scan.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scanPlugins } from "../../skills/harness-init/lib/plugin-scan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, "..", "fixtures", "plugins", name), "utf-8"));

const REQUIRED = ["context-mode@context-mode", "superpowers@claude-plugins-official"];

test("classifies all-enabled as enabled", () => {
  const { installed, enabled } = load("all-enabled.json");
  const result = scanPlugins({ installedPlugins: installed, enabledPlugins: enabled, required: REQUIRED });
  assert.deepEqual(result.enabled.sort(), REQUIRED.slice().sort());
  assert.deepEqual(result.disabled, []);
  assert.deepEqual(result.missing, []);
});

test("classifies disabled-but-installed correctly", () => {
  const { installed, enabled } = load("partial.json");
  const result = scanPlugins({ installedPlugins: installed, enabledPlugins: enabled, required: REQUIRED });
  assert.deepEqual(result.enabled, ["context-mode@context-mode"]);
  assert.deepEqual(result.disabled, ["superpowers@claude-plugins-official"]);
  assert.deepEqual(result.missing, []);
});

test("classifies fully missing", () => {
  const { installed, enabled } = load("missing.json");
  const result = scanPlugins({ installedPlugins: installed, enabledPlugins: enabled, required: REQUIRED });
  assert.deepEqual(result.enabled, []);
  assert.deepEqual(result.disabled, []);
  assert.deepEqual(result.missing.sort(), REQUIRED.slice().sort());
});

test("ignores plugins not in the required list", () => {
  const result = scanPlugins({
    installedPlugins: { plugins: { "frontend-design@x": [{}] } },
    enabledPlugins: { "frontend-design@x": true },
    required: ["context-mode@context-mode"],
  });
  assert.deepEqual(result.missing, ["context-mode@context-mode"]);
  assert.equal(result.enabled.length, 0);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/lib/plugin-scan.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `skills/harness-init/lib/plugin-scan.mjs`**

```javascript
export function scanPlugins({ installedPlugins, enabledPlugins, required }) {
  const installedKeys = new Set(Object.keys(installedPlugins?.plugins || {}));
  const enabled = [];
  const disabled = [];
  const missing = [];
  for (const key of required) {
    if (installedKeys.has(key)) {
      if (enabledPlugins?.[key]) enabled.push(key);
      else disabled.push(key);
    } else {
      missing.push(key);
    }
  }
  return { enabled, disabled, missing };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/lib/plugin-scan.test.mjs`
Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/plugins tests/lib/plugin-scan.test.mjs skills/harness-init/lib/plugin-scan.mjs
git commit -m "feat(lib): plugin-scan classifies required plugins as enabled/disabled/missing"
```

---

## Task 6: `lib/manifest-merge.mjs` — TDD

**Files:**
- Create: `tests/lib/manifest-merge.test.mjs`
- Create: `skills/harness-init/lib/manifest-merge.mjs`

- [ ] **Step 1: Write `tests/lib/manifest-merge.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings } from "../../skills/harness-init/lib/manifest-merge.mjs";

test("creates fresh settings when current is empty", () => {
  const out = mergeSettings({}, {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node a.mjs" }] }] },
  });
  assert.deepEqual(out.hooks.SessionStart, [{ hooks: [{ type: "command", command: "node a.mjs" }] }]);
});

test("appends new event entries without dropping existing ones", () => {
  const current = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node existing.mjs" }] }] },
  };
  const additions = {
    hooks: { Stop: [{ hooks: [{ type: "command", command: "node stop.mjs" }] }] },
  };
  const out = mergeSettings(current, additions);
  assert.equal(out.hooks.SessionStart.length, 1);
  assert.equal(out.hooks.Stop.length, 1);
  assert.equal(out.hooks.SessionStart[0].hooks[0].command, "node existing.mjs");
});

test("appends to same event without duplicating identical commands", () => {
  const current = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node a.mjs" }] }] },
  };
  const additions = {
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node a.mjs" }, { type: "command", command: "node b.mjs" }] }] },
  };
  const out = mergeSettings(current, additions);
  const commands = out.hooks.SessionStart.flatMap(g => g.hooks.map(h => h.command));
  assert.deepEqual(commands.sort(), ["node a.mjs", "node b.mjs"]);
});

test("preserves non-hook fields verbatim", () => {
  const current = { statusLine: { type: "command", command: "echo x" }, hooks: {} };
  const out = mergeSettings(current, { hooks: { Stop: [{ hooks: [{ type: "command", command: "node s.mjs" }] }] } });
  assert.deepEqual(out.statusLine, { type: "command", command: "echo x" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/manifest-merge.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `skills/harness-init/lib/manifest-merge.mjs`**

```javascript
export function mergeSettings(current, additions) {
  const out = structuredClone(current ?? {});
  out.hooks = out.hooks ?? {};
  for (const [event, groups] of Object.entries(additions?.hooks ?? {})) {
    const existing = out.hooks[event] ?? [];
    const existingCommands = new Set(
      existing.flatMap(g => (g.hooks ?? []).map(h => h.command))
    );
    const deduped = groups.map(g => ({
      ...g,
      hooks: (g.hooks ?? []).filter(h => {
        if (existingCommands.has(h.command)) return false;
        existingCommands.add(h.command);
        return true;
      }),
    })).filter(g => g.hooks.length > 0);
    out.hooks[event] = [...existing, ...deduped];
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/manifest-merge.test.mjs`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/manifest-merge.test.mjs skills/harness-init/lib/manifest-merge.mjs
git commit -m "feat(lib): manifest-merge preserves existing hooks, dedupes commands"
```

---

## Task 7: `lib/render.mjs` — TDD (minimal mustache subset)

**Scope:** A 50-line template engine supporting `{{var}}`, `{{#if var}}…{{/if}}`, `{{#each list}}…{{/each}}` with `{{this}}` and `{{@index}}`. Not full Handlebars — only what our templates need.

**Files:**
- Create: `tests/lib/render.test.mjs`
- Create: `skills/harness-init/lib/render.mjs`

- [ ] **Step 1: Write `tests/lib/render.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../../skills/harness-init/lib/render.mjs";

test("substitutes simple variables", () => {
  assert.equal(render("hello {{name}}", { name: "world" }), "hello world");
});

test("supports dotted paths", () => {
  assert.equal(render("{{user.email}}", { user: { email: "a@b" } }), "a@b");
});

test("renders #if block when truthy", () => {
  assert.equal(render("{{#if show}}yes{{/if}}", { show: true }), "yes");
});

test("skips #if block when falsy", () => {
  assert.equal(render("a{{#if show}}yes{{/if}}b", { show: false }), "ab");
});

test("renders #each block over arrays", () => {
  const out = render("{{#each items}}- {{this}}\n{{/each}}", { items: ["a", "b"] });
  assert.equal(out, "- a\n- b\n");
});

test("#each exposes @index", () => {
  const out = render("{{#each items}}{{@index}}:{{this}} {{/each}}", { items: ["x", "y"] });
  assert.equal(out, "0:x 1:y ");
});

test("missing variable renders as empty string", () => {
  assert.equal(render("hello {{name}}!", {}), "hello !");
});

test("ignores unknown helpers gracefully (passes through)", () => {
  assert.equal(render("{{#unknown}}x{{/unknown}}", {}), "{{#unknown}}x{{/unknown}}");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lib/render.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `skills/harness-init/lib/render.mjs`**

```javascript
function lookup(ctx, path) {
  if (path === "this") return ctx.__this__ ?? "";
  if (path === "@index") return ctx.__index__ ?? "";
  const parts = path.split(".");
  let v = ctx;
  for (const p of parts) {
    if (v == null) return "";
    v = v[p];
  }
  return v ?? "";
}

function renderEach(body, list, ctx) {
  if (!Array.isArray(list)) return "";
  return list.map((item, i) => render(body, { ...ctx, __this__: item, __index__: i })).join("");
}

export function render(tpl, ctx = {}) {
  // #each
  tpl = tpl.replace(/\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, path, body) => renderEach(body, lookup(ctx, path), ctx));
  // #if
  tpl = tpl.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, path, body) => lookup(ctx, path) ? render(body, ctx) : "");
  // {{var}}
  tpl = tpl.replace(/\{\{\s*([\w.@]+)\s*\}\}/g,
    (_, path) => String(lookup(ctx, path) ?? ""));
  return tpl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lib/render.test.mjs`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/lib/render.test.mjs skills/harness-init/lib/render.mjs
git commit -m "feat(lib): render — mustache-subset engine (vars, #if, #each)"
```

---

## Task 8: Template `CLAUDE.md.hbs`

**Files:**
- Create: `skills/harness-init/templates/CLAUDE.md.hbs`

- [ ] **Step 1: Write template**

```handlebars
# {{purpose}}

> Project memory for Claude Code. Maintained by `/harness-init`.

## Stack

{{stack}}{{#if deploy_targets}} — deploys to {{deploy_targets}}{{/if}}

## Operating Principles

These apply to the main agent and to every role in `.claude/agents/`:

1. **Brainstorm first.** Before any deliverable (code, doc, design), invoke `superpowers:brainstorming` to align on intent.
2. **Parallel via superpowers.** When fanning out 2+ independent subtasks, invoke `superpowers:dispatching-parallel-agents` or `subagent-driven-development`.
3. **context-mode over Bash.** For commands whose output may exceed ~20 lines, use `mcp__plugin_context-mode_context-mode__ctx_batch_execute`.

## Agent Roster

| Role | When to use | File |
|------|-------------|------|
{{#each agents}}| {{name}} | {{when}} | `.claude/agents/{{name}}.md` |
{{/each}}

## Hooks

- `PreToolUse` (Bash) → `context-mode-router.mjs` — suggests context-mode for likely-large commands
- `Stop` → `session-summary.mjs` — appends key decisions to `docs/decisions/`
- `SessionStart` → `cache-heal.mjs` — self-heals plugin cache symlinks

## Work Folders

- `docs/superpowers/specs/` — brainstorming output (design specs)
- `docs/superpowers/plans/` — writing-plans output (implementation plans)
- `docs/decisions/` — session-summary logs
- `docs/tasks/` — long-running task tracking

{{#if constraints}}
## Special Constraints

{{constraints}}
{{/if}}
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/templates/CLAUDE.md.hbs
git commit -m "feat(templates): CLAUDE.md.hbs with agent index + principles"
```

---

## Task 9: Template `agents/planner.md.hbs` (canonical reference)

**Files:**
- Create: `skills/harness-init/templates/agents/planner.md.hbs`

This task writes the reference template fully. Task 10 lists the other 8 agent templates as variations on this structure.

- [ ] **Step 1: Write template**

```handlebars
---
name: planner
description: Decompose user requests into implementation plans. MUST invoke brainstorming first. NEVER writes code or modifies source.
tools: Read, Grep, Glob, Skill, TaskCreate, TaskUpdate, mcp__plugin_context-mode_context-mode__ctx_batch_execute, mcp__plugin_context-mode_context-mode__ctx_search
---

# planner

You produce written implementation plans. You do not write production code, edit source files, or run builds.

## Rules

1. **Brainstorm before planning.** Invoke `superpowers:brainstorming` to align with the user on intent, scope, and success criteria.
2. **Plan via writing-plans.** Once intent is clear, invoke `superpowers:writing-plans` and save to `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`.
3. **Dispatch in parallel only after a plan exists.** If the plan has 2+ independent tasks, call `superpowers:dispatching-parallel-agents` to coordinate the fan-out.
4. **context-mode for exploration.** Use `ctx_batch_execute` for any shell command likely to produce more than ~20 lines.

## Stack

This project uses **{{stack}}**.{{#if deploy_targets}} It deploys to **{{deploy_targets}}**.{{/if}}

## Output Location

- Plans → `docs/superpowers/plans/`
- Task tracking → `docs/tasks/`
- Never to `src/`, `lib/`, `app/`, or any application code path.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/templates/agents/planner.md.hbs
git commit -m "feat(templates): planner.md.hbs — canonical agent template"
```

---

## Task 10: Remaining agent templates (8 files)

**Files:** create one `.hbs` per row below.

For each, follow the planner.md.hbs structure (front-matter with name/description/tools, `## Rules` referencing the three operating principles, `## Stack`, `## Output Location`). Distinguishing content per file:

| File | description (front-matter) | tools (front-matter) | Role-specific rules |
|------|----------------------------|----------------------|---------------------|
| `dev.md.hbs` | "Implements features and bug fixes via TDD. MUST follow superpowers:test-driven-development." | `Read, Edit, Write, Grep, Glob, Bash, Skill, mcp__plugin_context-mode_context-mode__ctx_batch_execute, mcp__plugin_context-mode_context-mode__ctx_execute, TaskCreate, TaskUpdate` | (1) Always invoke `superpowers:test-driven-development` before writing code. (2) Red-green-refactor in tight loops. (3) Commit per passing test. |
| `reviewer.md.hbs` | "Reviews implementations against specs. MUST follow superpowers:requesting-code-review pattern from the requester side." | `Read, Grep, Glob, Skill, Bash` | (1) Use `superpowers:requesting-code-review` to scope what to look at. (2) Verify against the spec in `docs/superpowers/specs/`, not against assumptions. (3) Output review to `docs/reviews/`. |
| `designer.md.hbs` | "Produces UI mockups and component designs. Invokes frontend-design skill if available." | `Read, Edit, Write, Grep, Glob, Skill, mcp__plugin_context-mode_context-mode__ctx_batch_execute` | (1) Brainstorm visual options before code. (2) If `frontend-design` plugin is enabled, invoke `frontend-design:frontend-design`. (3) Designs go to `docs/design/`; code prototypes to `prototypes/`. |
| `qa.md.hbs` | "Validates {{persona}} flows end-to-end. One file per persona." | `Read, Grep, Glob, Bash, Skill, mcp__plugin_context-mode_context-mode__ctx_batch_execute` | (1) Treat the persona ({{persona}}) as the user; write acceptance scenarios first. (2) Brainstorm edge cases before testing. (3) Defect reports go to `docs/qa/{{persona}}/`. |
| `tester.md.hbs` | "Runs automated test suites and reports failures. MUST use verification-before-completion." | `Read, Bash, Grep, Skill, mcp__plugin_context-mode_context-mode__ctx_batch_execute, mcp__plugin_context-mode_context-mode__ctx_execute` | (1) Always invoke `superpowers:verification-before-completion` before declaring a run green. (2) Run via context-mode (`ctx_execute`) so large logs stay out of context. (3) Failures get a one-line summary plus link to the failing test. |
| `frontend-dev.md.hbs` | "Implements frontend features in {{stack}}. TDD where possible." | `Read, Edit, Write, Grep, Glob, Bash, Skill, mcp__plugin_context-mode_context-mode__ctx_batch_execute, TaskCreate, TaskUpdate` | (1) Brainstorm UI/UX before code. (2) Component-level tests before integration. (3) Coordinate with `designer` via `docs/design/`. |
| `backend-dev.md.hbs` | "Implements backend features in {{stack}}. TDD strictly." | `Read, Edit, Write, Grep, Glob, Bash, Skill, mcp__plugin_context-mode_context-mode__ctx_batch_execute, mcp__plugin_context-mode_context-mode__ctx_execute, TaskCreate, TaskUpdate` | (1) Write the API contract test first. (2) Migrations only after the consuming code's tests are red-and-then-green. (3) Use `superpowers:test-driven-development`. |
| `doc-writer.md.hbs` | "Writes user-facing and API documentation. Brainstorm structure before pages." | `Read, Edit, Write, Grep, Glob, Skill` | (1) Brainstorm the doc map first; never write pages in isolation. (2) Pages go to `docs/`. (3) Verify code samples by running them via `ctx_execute`. |

- [ ] **Step 1: Create all 8 files** following the planner.md.hbs structure with the columns above.

- [ ] **Step 2: Verify all 9 agent templates exist**

Run: `ls skills/harness-init/templates/agents/ | wc -l`
Expected: `9`.

- [ ] **Step 3: Commit**

```bash
git add skills/harness-init/templates/agents/
git commit -m "feat(templates): add dev, reviewer, designer, qa, tester, frontend-dev, backend-dev, doc-writer agents"
```

---

## Task 11: Template `hooks/context-mode-router.mjs`

**Files:**
- Create: `skills/harness-init/templates/hooks/context-mode-router.mjs`

- [ ] **Step 1: Write the hook**

```javascript
#!/usr/bin/env node
// PreToolUse hook for Bash. Emits a context-mode routing hint when the command
// is likely to produce >20 lines. Pure stdout — does not block the tool call.
import { readFileSync } from "node:fs";
let input = "";
try { input = readFileSync(0, "utf-8"); } catch {}
let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}
const cmd = (payload?.tool_input?.command ?? "").toString();
const LIKELY_LARGE = [
  /\bgit\s+log\b/, /\bgit\s+diff\b/, /\bnpm\s+(test|run|install)\b/,
  /\bcat\b/, /\bls\s+-/, /\bgrep\b/, /\brg\b/, /\bfind\b/,
  /\bjq\b/, /\bdocker\s+(ps|images|logs)\b/, /\bcurl\b/, /\bgh\s+/,
];
if (LIKELY_LARGE.some(rx => rx.test(cmd))) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: "<context_guidance>This command may exceed 20 lines. Prefer mcp__plugin_context-mode_context-mode__ctx_batch_execute or ctx_execute so raw output stays in the sandbox.</context_guidance>",
    },
  }));
}
process.exit(0);
```

- [ ] **Step 2: Smoke-test the hook with a synthetic payload**

Run:
```bash
echo '{"tool_input":{"command":"git log --oneline -50"}}' | node skills/harness-init/templates/hooks/context-mode-router.mjs
```
Expected: stdout contains `context_guidance`.

Run:
```bash
echo '{"tool_input":{"command":"echo hi"}}' | node skills/harness-init/templates/hooks/context-mode-router.mjs
```
Expected: stdout empty.

- [ ] **Step 3: Commit**

```bash
git add skills/harness-init/templates/hooks/context-mode-router.mjs
git commit -m "feat(templates): context-mode-router PreToolUse hook"
```

---

## Task 12: Template `hooks/session-summary.mjs`

**Files:**
- Create: `skills/harness-init/templates/hooks/session-summary.mjs`

- [ ] **Step 1: Write the hook**

```javascript
#!/usr/bin/env node
// Stop hook. Appends a short markdown entry to docs/decisions/YYYY-MM-DD-<slug>.md
// summarising the session. Reads the Stop payload from stdin; never blocks.
import { readFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

let input = "";
try { input = readFileSync(0, "utf-8"); } catch {}
let payload = {};
try { payload = JSON.parse(input || "{}"); } catch {}

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const decisionsDir = resolve(cwd, "docs", "decisions");

try {
  mkdirSync(decisionsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(decisionsDir, `${date}-session.md`);
  const stamp = new Date().toISOString();
  const note = (payload?.stop_reason || payload?.reason || "session end").toString();
  const header = existsSync(file) ? "" : `# Session decisions — ${date}\n\n`;
  appendFileSync(file, `${header}- [${stamp}] ${note}\n`);
} catch {}
process.exit(0);
```

- [ ] **Step 2: Smoke-test in tmpdir**

Run (from repo root):
```bash
TMPDIR=$(mktemp -d) && echo '{"stop_reason":"user requested halt"}' | CLAUDE_PROJECT_DIR="$TMPDIR" node skills/harness-init/templates/hooks/session-summary.mjs && ls "$TMPDIR/docs/decisions/"
```

Expected: lists one file named `YYYY-MM-DD-session.md`. Exit code 0.

- [ ] **Step 3: Commit**

```bash
git add skills/harness-init/templates/hooks/session-summary.mjs
git commit -m "feat(templates): session-summary Stop hook writes to docs/decisions/"
```

---

## Task 13: Template `hooks/cache-heal.mjs` (project-scoped)

**Files:**
- Create: `skills/harness-init/templates/hooks/cache-heal.mjs`

- [ ] **Step 1: Adapt the global cache-heal to a project scope**

This is the project-level variant of `hooks/context-mode-cache-heal.mjs`. It additionally indexes the project's CLAUDE.md into context-mode on session start (if context-mode is available).

```javascript
#!/usr/bin/env node
// SessionStart hook (project-scoped). Two responsibilities:
// 1. Heal context-mode plugin cache symlinks (mirrors the global hook).
// 2. Seed an indexing hint for context-mode by reading CLAUDE.md.
import { existsSync, readdirSync, statSync, symlinkSync, lstatSync, unlinkSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { homedir } from "node:os";

try {
  const f = resolve(homedir(), ".claude", "plugins", "installed_plugins.json");
  if (existsSync(f)) {
    const cacheRoot = resolve(homedir(), ".claude", "plugins", "cache");
    const ip = JSON.parse(readFileSync(f, "utf-8"));
    for (const [k, es] of Object.entries(ip.plugins || {})) {
      if (k !== "context-mode@context-mode") continue;
      for (const e of es) {
        const p = e.installPath;
        if (!p || existsSync(p)) continue;
        if (!resolve(p).startsWith(cacheRoot + sep)) continue;
        const parent = dirname(p);
        if (!existsSync(parent)) continue;
        try { if (lstatSync(p).isSymbolicLink()) unlinkSync(p); } catch {}
        const dirs = readdirSync(parent).filter(d => /^\d+\.\d+/.test(d) && statSync(join(parent, d)).isDirectory());
        if (!dirs.length) continue;
        dirs.sort((a, b) => {
          const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
          for (let i = 0; i < 3; i++) {
            if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
          }
          return 0;
        });
        try { symlinkSync(join(parent, dirs[dirs.length - 1]), p, process.platform === "win32" ? "junction" : undefined); } catch {}
      }
    }
  }
} catch {}

// Optional: emit a hint pointing at CLAUDE.md
try {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const claudeMd = resolve(cwd, "CLAUDE.md");
  if (existsSync(claudeMd)) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `Project harness active. Read CLAUDE.md (${claudeMd}) and .claude/agents/ for roster.`,
      },
    }));
  }
} catch {}
process.exit(0);
```

- [ ] **Step 2: Smoke-test**

Run: `node skills/harness-init/templates/hooks/cache-heal.mjs && echo ok`
Expected: prints `ok` (and possibly a JSON line if a CLAUDE.md is present in cwd — no error).

- [ ] **Step 3: Commit**

```bash
git add skills/harness-init/templates/hooks/cache-heal.mjs
git commit -m "feat(templates): project-scoped cache-heal SessionStart hook"
```

---

## Task 14: Template `settings.local.json.hbs`

**Files:**
- Create: `skills/harness-init/templates/settings.local.json.hbs`

- [ ] **Step 1: Write template**

```handlebars
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/context-mode-router.mjs\"" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-summary.mjs\"" }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/cache-heal.mjs\"" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/templates/settings.local.json.hbs
git commit -m "feat(templates): settings.local.json.hbs registers 3 project hooks"
```

---

## Task 15: render.mjs snapshot test for all templates

**Files:**
- Modify: `tests/lib/render.test.mjs` — add a new `describe` block for template snapshot.
- Create: `tests/lib/__snapshots__/templates.snap.js` (created on first run if you use a tiny inline snapshot helper).

- [ ] **Step 1: Add a snapshot-style helper inline (no dep)**

Add at top of `tests/lib/render.test.mjs`:

```javascript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

function snapshot(name, actual) {
  const snapPath = resolve(here, "__snapshots__", `${name}.snap`);
  mkdirSync(dirname(snapPath), { recursive: true });
  if (!existsSync(snapPath) || process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, "utf-8");
  assert.equal(actual, expected, `Snapshot mismatch for ${name}. Re-run with UPDATE_SNAPSHOTS=1 to update.`);
}
```

(Place `here` declaration near top: `const here = dirname(fileURLToPath(import.meta.url));`.)

- [ ] **Step 2: Add a fixture matrix and snapshot every template against it**

```javascript
import { readdirSync } from "node:fs";

const TEMPLATES_DIR = resolve(here, "..", "..", "skills", "harness-init", "templates");

const FIXTURES = [
  { tag: "ts-small", ctx: { purpose: "Demo app", stack: "typescript", deploy_targets: "vercel", agents: [{name:"planner",when:"all planning"},{name:"dev",when:"implementation"},{name:"reviewer",when:"final review"}], constraints: "" } },
  { tag: "py-medium", ctx: { purpose: "API service", stack: "python", deploy_targets: "docker", agents: [{name:"planner",when:"all planning"},{name:"dev",when:"implementation"},{name:"designer",when:"UI"},{name:"qa-auth",when:"auth flow"},{name:"tester",when:"automated runs"},{name:"reviewer",when:"final review"}], constraints: "GDPR scope" } },
  { tag: "rs-large", ctx: { purpose: "CLI tool", stack: "rust", deploy_targets: "github releases", agents: [{name:"planner",when:""},{name:"frontend-dev",when:""},{name:"backend-dev",when:""},{name:"qa-cli",when:""},{name:"tester",when:""},{name:"reviewer",when:""},{name:"doc-writer",when:""}], constraints: "" } },
  { tag: "go-small", ctx: { purpose: "Worker", stack: "go", deploy_targets: "", agents: [{name:"planner",when:""},{name:"dev",when:""},{name:"reviewer",when:""}], constraints: "" } },
  { tag: "mono-medium", ctx: { purpose: "Monorepo", stack: "javascript", deploy_targets: "cloudflare", agents: [{name:"planner",when:""},{name:"dev",when:""},{name:"designer",when:""},{name:"qa-general",when:""},{name:"tester",when:""},{name:"reviewer",when:""}], constraints: "" } },
];

function listTemplates(dir, base = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = `${base}${e.name}`;
    return e.isDirectory() ? listTemplates(resolve(dir, e.name), `${p}/`) : [p];
  });
}

for (const tplRel of listTemplates(TEMPLATES_DIR)) {
  if (!tplRel.endsWith(".hbs")) continue;
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
  for (const fx of FIXTURES) {
    test(`snapshot: ${tplRel} × ${fx.tag}`, () => {
      const out = render(tpl, { ...fx.ctx, persona: "auth" });
      snapshot(`${tplRel.replace(/\//g, "_")}__${fx.tag}`, out);
    });
  }
}
```

- [ ] **Step 3: Run tests; let snapshots be generated**

Run: `UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs`
Expected: passes; `tests/lib/__snapshots__/` populated.

- [ ] **Step 4: Re-run without `UPDATE_SNAPSHOTS` to confirm stability**

Run: `node --test tests/lib/render.test.mjs`
Expected: passes (no mismatches).

- [ ] **Step 5: Commit**

```bash
git add tests/lib/render.test.mjs tests/lib/__snapshots__/
git commit -m "test(lib): snapshot all templates across 5 stack/size fixtures"
```

---

## Task 16: `skills/harness-init/SKILL.md`

**Files:**
- Create: `skills/harness-init/SKILL.md`

- [ ] **Step 1: Write the skill orchestrator (thin)**

```markdown
---
name: harness-init
description: Bootstrap a Claude Code agent harness in the current project — CLAUDE.md, .claude/agents/, hooks, plugin wiring, all in one invocation. Use when starting a new project or adopting Claude Code on an existing one without an existing CLAUDE.md.
---

# /harness-init

Sets up a full per-project agent harness following the three operating principles: brainstorming-first, superpowers for parallel, context-mode for large output.

## Flags

- `--force` — re-run all phases; overwrite existing artefacts.
- `--merge` — preserve existing CLAUDE.md and append a harness section.
- `--dry-run` — print decisions and intended writes; touch nothing.
- `--resume` — skip phases already marked complete in `.claude/.harness-state.json`.
- `--size=small|medium|large` — override auto-inferred agent team size.
- `--qa=<persona>[,<persona>]` — override auto-inferred QA personas.

## Pipeline

The skill runs 5 phases strictly in order. Each phase is described in a separate file; read them on demand with the Read tool.

| Phase | File | Purpose |
|-------|------|---------|
| 0 (preflight) | `phases/1-discover.md` § Preflight | git check, conflict scan, plugin scan |
| 1 | `phases/1-discover.md` | brainstorming + stack detection |
| 2 | `phases/2-claude-md.md` | render & write CLAUDE.md |
| 3 | `phases/3-agents.md` | fan-out render of `.claude/agents/*.md` |
| 4 | `phases/4-hooks.md` | copy hooks, register in `settings.local.json` |
| 5 | `phases/5-wire.md` | surface missing plugins, commit, summarise |

## Rules

1. **You orchestrate; the phase files are the source of truth.** Before each phase, Read its file and follow it literally.
2. **State lives in `.claude/.harness-state.json`.** Shape: `{ "phases": [{ "phase": N, "completedAt": "<iso>" }], "discovery": {...}, "plugin_scan": {...}, "commit": "<sha>" }`. After each completed phase, append a `{phase, completedAt}` entry to `phases`. `--resume` resumes after `max(phases[*].phase)`.
3. **Brainstorm before scaffolding.** Phase 1 invokes `superpowers:brainstorming` — do not skip it even if you "know" what the user wants.
4. **Parallel only in Phase 3.** Before fan-out, invoke `superpowers:dispatching-parallel-agents` to set up the dispatch correctly.
5. **context-mode for any inspection.** When reading `installed_plugins.json`, large directories, or `git status`, use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` instead of raw Bash.

## Lib modules

Deterministic mechanics live in `lib/`. Import them when a phase says so:

- `lib/render.mjs` — `render(tpl, ctx)` for `.hbs` templates
- `lib/detect-stack.mjs` — `detectStack(projectDir)`
- `lib/plugin-scan.mjs` — `scanPlugins({ installedPlugins, enabledPlugins, required })`
- `lib/manifest-merge.mjs` — `mergeSettings(current, additions)`

Each phase file names which helpers it needs and how to call them.

## On error

- Conflict (existing CLAUDE.md without `--merge`/`--force`): abort with a message naming the next user action.
- Missing required plugins (`context-mode`, `superpowers`): do NOT abort; surface install commands in Phase 5 and continue in degraded mode.
- Hook smoke-test failure: print warning, continue.
- Anything else: log and abort cleanly. Never leave a half-written `settings.local.json`.

## When done

Print a one-screen summary: phases completed, files written, plugin install commands the user still needs to run, and one-line next-step suggestion.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/SKILL.md
git commit -m "feat(skill): harness-init orchestrator (thin SKILL.md)"
```

---

## Task 17: `phases/1-discover.md`

**Files:**
- Create: `skills/harness-init/phases/1-discover.md`

- [ ] **Step 1: Write the phase prompt**

```markdown
# Phase 1 — Discover

## Preflight (run before Phase 1 proper)

1. Confirm `pwd` is a git repository (`.git/` exists). If not: print `git init` suggestion, abort.
2. Check for existing artefacts. Abort (unless `--force` or `--merge`) if any of these exist:
   - `CLAUDE.md` (unless `--merge` set)
   - `.claude/agents/` non-empty
   - `.claude/hooks/` contains any of `context-mode-router.mjs`, `session-summary.mjs`, `cache-heal.mjs`
3. Read `~/.claude/plugins/installed_plugins.json` and the active `settings.json` `enabledPlugins`. Call:
   ```javascript
   import { scanPlugins } from "./lib/plugin-scan.mjs";
   const scan = scanPlugins({ installedPlugins, enabledPlugins, required: ["context-mode@context-mode", "superpowers@claude-plugins-official"] });
   ```
   Stash `scan` for Phase 5. Do NOT abort on missing plugins.
4. Read `.claude/.harness-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 1`, skip Phase 1 proper.

## Phase 1 proper

1. Invoke `Skill` with `superpowers:brainstorming` and these prompts:
   - Project purpose (1-2 sentences for CLAUDE.md preamble)
   - Size: small / medium / large (override: `--size`)
   - QA personas (override: `--qa`)
   - Deploy targets
   - Special constraints (compliance, performance budgets, etc.)
2. Run `detectStack(cwd)` from `lib/detect-stack.mjs`. Stash result.
3. Build the discovery context object:
   ```javascript
   const ctx = {
     purpose: "...",                  // from brainstorming
     size: "medium",                  // from brainstorming or --size
     qa_personas: ["auth"],           // from brainstorming or --qa
     deploy_targets: "vercel",        // from brainstorming
     constraints: "",                 // from brainstorming
     stack: detectStack(cwd),         // from helper
   };
   ```
4. Update `.claude/.harness-state.json` (create with `{ "phases": [] }` if missing). Set top-level `discovery` and `plugin_scan`, then push `{ "phase": 1, "completedAt": "<iso>" }` onto `phases`. Use atomic write: temp file + rename.
5. Do not commit yet. Phase 5 makes a single bootstrap commit.

## Output to user

Print a 3-line summary: detected stack, chosen size, QA personas. Ask "proceed to Phase 2?" and wait for confirmation unless `--yes` was passed.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/phases/1-discover.md
git commit -m "feat(phases): 1-discover — preflight + brainstorming + stack detection"
```

---

## Task 18: `phases/2-claude-md.md`

**Files:**
- Create: `skills/harness-init/phases/2-claude-md.md`

- [ ] **Step 1: Write the phase prompt**

```markdown
# Phase 2 — CLAUDE.md

## Inputs

- `discovery` from Phase 1 (`purpose`, `stack`, `deploy_targets`, `constraints`)
- `size`, `qa_personas` (drives the `agents` array passed to the template)

## Steps

1. Compute the agents array based on `size` and `qa_personas`:
   - `small`: `[planner, dev, reviewer]`
   - `medium`: + `designer, qa-{persona}…, tester`
   - `large`: + `frontend-dev, backend-dev, doc-writer`

   Build entries: `{ name, when }`. Use these `when` strings:
   | name | when |
   |------|------|
   | planner | "decompose a request into a plan" |
   | dev | "implement a feature/bugfix via TDD" |
   | designer | "produce UI mockups or component designs" |
   | qa-{persona} | "validate the {persona} flow end-to-end" |
   | tester | "run automated suites and report failures" |
   | reviewer | "review against the spec before merging" |
   | frontend-dev | "implement frontend code" |
   | backend-dev | "implement backend code or migrations" |
   | doc-writer | "produce user-facing or API documentation" |

2. Read `templates/CLAUDE.md.hbs`.
3. Render with `render(tpl, { ...discovery, agents })`.
4. Write `CLAUDE.md` at project root.
   - If `--merge` and the file exists: append `\n\n---\n\n## Harness\n\n<rendered content>` instead of overwriting.
5. Push `{ "phase": 2, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`.

## Output to user

Print: `CLAUDE.md written (N lines)`.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/phases/2-claude-md.md
git commit -m "feat(phases): 2-claude-md — render & write CLAUDE.md"
```

---

## Task 19: `phases/3-agents.md`

**Files:**
- Create: `skills/harness-init/phases/3-agents.md`

- [ ] **Step 1: Write the phase prompt**

```markdown
# Phase 3 — Agents (parallel fan-out)

## Pre-fan-out

Invoke `Skill` with `superpowers:dispatching-parallel-agents` first. Adopt its dispatch checklist.

## Inputs

- `discovery` and the `agents` array from Phase 2.

## Steps

1. Compute the file list:
   - For each entry in `agents`:
     - If `name` starts with `qa-`: template = `templates/agents/qa.md.hbs`, context = `{ ...discovery, persona: name.slice(3) }`.
     - Else: template = `templates/agents/<name>.md.hbs`, context = `{ ...discovery, persona: "" }`.

2. **Fan out** the render+write work. Each subagent gets one role:
   ```
   For each role in <agents list>:
     - Read template path
     - Render with provided context (use lib/render.mjs)
     - Write to .claude/agents/<role-name>.md
     - Return { role, path, bytesWritten }
   ```
   Dispatch via `Skill` with `superpowers:dispatching-parallel-agents`. Treat each role-render as an independent task — they share no state.

3. Collect results. If any role failed, abort the phase: list the failures, leave `.harness-state.json` unchanged. Do NOT mark Phase 3 complete on partial success.

4. On full success, set top-level `agents_written` to the list of paths and push `{ "phase": 3, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`.

## Output to user

Print a table: role → file path → bytes.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/phases/3-agents.md
git commit -m "feat(phases): 3-agents — fan-out role rendering via superpowers"
```

---

## Task 20: `phases/4-hooks.md`

**Files:**
- Create: `skills/harness-init/phases/4-hooks.md`

- [ ] **Step 1: Write the phase prompt**

```markdown
# Phase 4 — Hooks

## Steps

1. `mkdir -p .claude/hooks`
2. Copy these 3 files verbatim from `templates/hooks/` to `.claude/hooks/`:
   - `context-mode-router.mjs`
   - `session-summary.mjs`
   - `cache-heal.mjs`
3. Smoke-test each by running `node .claude/hooks/<file>.mjs < /dev/null` (or `< NUL` on Windows). Exit code must be 0. If any fails, print the stderr and abort — do not write `settings.local.json`.
4. Read `templates/settings.local.json.hbs` and render with `render(tpl, {})` (template has no variables but we still go through the engine for consistency).
5. If `.claude/settings.local.json` already exists:
   - Parse it.
   - Call `mergeSettings(current, additions)` from `lib/manifest-merge.mjs`.
   - Write the result back.
   Otherwise write the rendered template as-is.
6. Push `{ "phase": 4, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`.

## Output to user

Print: `Hooks installed: context-mode-router, session-summary, cache-heal`.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/phases/4-hooks.md
git commit -m "feat(phases): 4-hooks — install hooks + merge settings"
```

---

## Task 21: `phases/5-wire.md`

**Files:**
- Create: `skills/harness-init/phases/5-wire.md`

- [ ] **Step 1: Write the phase prompt**

```markdown
# Phase 5 — Wire

## Steps

1. Re-read `plugin_scan` from `.harness-state.json`.
2. Compose a "missing plugins" report:

   For each plugin in `scan.missing`, print:
   ```
   - {plugin}
     /plugin marketplace add <git-url>   # if not already known
     /plugin install {plugin}
   ```

   For each plugin in `scan.disabled`:
   ```
   - {plugin}
     /plugin enable {plugin}
   ```

   If both arrays are empty: print "All required plugins are enabled."

3. Update `.gitignore`. If `.claude/.harness-state.json` is not already listed, append it. Idempotent.

4. Make sure `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/decisions/`, `docs/tasks/` exist. `mkdir -p` for each. Add a `.gitkeep` to each.

5. Single git commit:
   ```bash
   git add CLAUDE.md .claude/ .gitignore docs/
   git commit -m "chore: bootstrap harness via /harness-init"
   ```

6. Set top-level `commit` to the new SHA and push `{ "phase": 5, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`. Write to disk (this update happens AFTER the commit in step 5, and `.harness-state.json` is `.gitignored` from step 3 so it stays out of git).

## Output to user

Print the success summary:
- Phases completed: 5 / 5
- CLAUDE.md, N agents, 3 hooks installed
- Missing plugins (if any) — with the exact install commands
- Next step suggestion: "Try `/harness-init --dry-run` or invoke planner with `/plan <goal>`."
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/phases/5-wire.md
git commit -m "feat(phases): 5-wire — surface missing plugins, commit, summarise"
```

---

## Task 22: `references/legacy-notes.md`

**Files:**
- Create: `skills/harness-init/references/legacy-notes.md`

- [ ] **Step 1: Capture provenance of the existing 3 user skills**

Read each existing skill's SKILL.md (under `C:/Users/kinso/.claude/skills/`) and archive the descriptions plus a note about which phase absorbed which.

```markdown
# Legacy Notes

This skill replaces three earlier user skills. Their behaviour is now absorbed into `/harness-init`'s phases.

## Original `claude-init`

> Use when bootstrapping a fresh project that has no CLAUDE.md yet. Refuses if CLAUDE.md exists (use claude-md-improver instead). Optional --merge flag preserves existing CLAUDE.md and appends a bootstrap section.

**Absorbed by:** Phase 2 (`phases/2-claude-md.md`). `--merge` flag preserved.

## Original `agent-init`

> Use after /claude-init (or in a project with existing CLAUDE.md) to scaffold .claude/agents/ with role files (planner / dev / designer / qa-{persona} / tester / reviewer). Takes --size=small|medium|large to scale agent count, auto-infers QA personas from README+DB+route guards (or accepts --qa= override), and injects Agent Pipeline Index into CLAUDE.md.

**Absorbed by:** Phase 3 (`phases/3-agents.md`). `--size` and `--qa` flags preserved.

## Original `agent-all`

> Use when running an end-to-end multi-agent pipeline on a single task — accepts a free-form prompt or existing task doc and drives planner+builders+gates until PR. Requires `.claude/agents/` scaffolded by /agent-init.

**Status:** Not absorbed by this plugin. Lives on as a follow-on workflow that uses the harness this plugin produces. Theme C ("cost-unrestricted parallel mode") is its intended home in this repo.
```

- [ ] **Step 2: Commit**

```bash
git add skills/harness-init/references/legacy-notes.md
git commit -m "docs(skill): legacy-notes captures provenance of pre-merger user skills"
```

---

## Task 23: `tests/manual-checklist.md`

**Files:**
- Create: `tests/manual-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Manual end-to-end checklist

Run before each `harness-builder` release. Use a fresh tmpdir as the target project.

## Setup

```bash
mkdir /tmp/harness-fixture && cd /tmp/harness-fixture && git init
# (Optional: drop a package.json or pyproject.toml to influence stack detection)
```

## Run

In Claude Code, invoke `/harness-init`.

## Checks

- [ ] Phase 1 actually triggers `superpowers:brainstorming` (you see brainstorming questions).
- [ ] Stack detection picked the right language (or "unknown").
- [ ] Phase 3 dispatches in parallel (visible in the agent log as multiple subagents launched at once).
- [ ] `CLAUDE.md` written; `--merge` test: re-run with `--merge` against an existing CLAUDE.md and confirm it appends rather than overwrites.
- [ ] `.claude/agents/*.md` count matches size (small=3, medium=6+#qa, large=9+#qa).
- [ ] Each generated agent file contains the three operating principles in its `## Rules` section.
- [ ] `.claude/hooks/{context-mode-router,session-summary,cache-heal}.mjs` exist and are syntactically valid (`node --check`).
- [ ] `.claude/settings.local.json` registers the three hooks.
- [ ] `.gitignore` contains `.claude/.harness-state.json`.
- [ ] Final commit message is `chore: bootstrap harness via /harness-init`.
- [ ] Re-running with no flags is a no-op and prints "All phases already complete (use --force to re-run)".
- [ ] `--force` rebuilds from scratch and overwrites artefacts.
- [ ] `--dry-run` writes nothing to disk.
- [ ] Missing-plugin scenario: temporarily disable `context-mode` in settings, re-run, confirm Phase 5 prints the install command.
```

- [ ] **Step 2: Commit**

```bash
git add tests/manual-checklist.md
git commit -m "test: manual end-to-end checklist for releases"
```

---

## Task 24: Final lint / verify everything together

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

Run: `node --test tests/`
Expected: all tests pass.

- [ ] **Step 2: Lint-check every JS file with `node --check`**

Run:
```bash
find . -name "*.mjs" -not -path "./node_modules/*" -exec node --check {} \;
```
Expected: every command exits 0, no syntax errors.

- [ ] **Step 3: Sanity-check the plugin manifest**

Run:
```bash
node -e "JSON.parse(require('node:fs').readFileSync('.claude-plugin/marketplace.json','utf-8'));JSON.parse(require('node:fs').readFileSync('.claude-plugin/plugin.json','utf-8'));console.log('manifests ok')"
```
Expected: prints `manifests ok`.

- [ ] **Step 4: Confirm git tree is clean**

Run: `git status --porcelain`
Expected: empty output.

- [ ] **Step 5: Tag the release candidate**

```bash
git tag harness-builder-v0.1.0-rc1
```

This tag is local. Pushing/publishing is a follow-up out of this plan's scope.

---

## Coverage Self-Check

| Spec section | Covered by |
|--------------|------------|
| §1 Purpose | Tasks 8, 9, 10, 16–21 (templates + phases bake principles) |
| §2 Non-goals | Task 16 SKILL.md rules; Task 21 Phase 5 surfaces commands without running |
| §3 Inputs/Outputs (flags) | Task 16 SKILL.md flags section; Task 17 Phase 1 honours `--force`/`--merge`/`--resume`; Task 18 honours `--merge` |
| §4.1 Repo layout | Tasks 1–23 collectively |
| §4.2 Plugin manifest | Task 2 |
| §4.3 Phase pipeline | Tasks 16–21 |
| §4.4 Dependency resolution | Tasks 5 (plugin-scan), 17 (Phase 1 calls scan), 21 (Phase 5 surfaces) |
| §5.1 Discover | Task 17 |
| §5.2 CLAUDE.md | Task 18 |
| §5.3 Agents | Task 19 |
| §5.4 Hooks | Task 20 |
| §5.5 Wire | Task 21 |
| §6 Error handling | Task 16 (SKILL.md), Task 17 (preflight aborts), Task 19 (no partial success), Task 20 (smoke-test then write), Task 21 (degraded-mode wording) |
| §7.1 Lib tests | Tasks 4–7, 15 |
| §7.2 Manual checklist | Task 22 |
| §7.3 Out of scope | Respected — no `/plugin install` automation in plan |
| §8 Future work | Captured in README (Task 1) roadmap table |
