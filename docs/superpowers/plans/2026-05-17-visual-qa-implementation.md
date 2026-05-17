# Visual-QA Implementation Plan (Theme C, sub-spec C-1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Note (2026-05-18):** `/harness-init` was renamed to `/agent-init` in harness-builder v0.2.0. References below to the old name reflect the original design and remain accurate for that timeframe. Treat `harness-init` and `agent-init` as the same skill in current code.

**Goal:** Build the `/visual-qa` skill in a new `harness-floor` plugin alongside the existing `harness-builder`. The skill drives Playwright MCP to capture a configured matrix of screenshots, runs per-image LLM analysis, diffs vs the prior run, and writes a report. This plan also includes the layout migration from single-plugin to multi-plugin.

**Architecture:** 6 sequential phases (preflight → config → discover → capture → aggregate → summary). Phase 3 is the only parallel phase: one subagent per page (via `superpowers:dispatching-parallel-agents`). Deterministic mechanics (config validation, matrix construction, run diff, cost estimation) live in `plugins/harness-floor/skills/visual-qa/lib/` as pure JS, TDD'd. The page-subagent IS the LLM analyzer — no external API client.

**Tech Stack:** Node 18+ native test runner, ES modules, no third-party deps. Playwright MCP tools (`mcp__plugin_playwright_playwright__*`) at runtime. Multi-plugin marketplace layout.

**Spec:** `docs/superpowers/specs/2026-05-17-visual-qa-design.md`

---

## File Structure (after all tasks)

```
agent-skill/
├── .claude-plugin/
│   └── marketplace.json                          # 2 plugins registered
├── plugins/
│   ├── harness-builder/                          # MIGRATED from repo root
│   │   ├── plugin.json
│   │   ├── hooks/context-mode-cache-heal.mjs
│   │   └── skills/agent-init/
│   │       ├── SKILL.md
│   │       ├── phases/{1..5}.md
│   │       ├── lib/{render,detect-stack,plugin-scan,manifest-merge}.mjs
│   │       ├── templates/{CLAUDE.md.hbs, settings.local.json.hbs, agents/*, hooks/*}
│   │       └── references/legacy-notes.md
│   └── harness-floor/                            # NEW
│       ├── plugin.json
│       └── skills/visual-qa/
│           ├── SKILL.md
│           ├── phases/{0..5}.md                  # 6 phase prompts
│           ├── lib/
│           │   ├── config-loader.mjs
│           │   ├── matrix-builder.mjs
│           │   ├── diff-runs.mjs
│           │   └── cost-estimator.mjs
│           └── templates/
│               ├── visual-qa.config.json.hbs
│               ├── analysis-prompt.md.hbs
│               └── report.md.hbs
├── tests/
│   ├── lib/                                      # Existing — harness-builder tests, paths updated
│   └── visual-qa/                                # NEW
│       ├── lib/{config-loader,matrix-builder,diff-runs,cost-estimator}.test.mjs
│       ├── templates/snapshot.test.mjs           # one file, all 3 templates × 3 fixtures
│       ├── scenarios/page-subagent.test.mjs      # mocked Playwright+LLM
│       ├── fixtures/
│       │   ├── configs/{minimal,full,invalid-*}.json
│       │   └── runs/{prior-empty,prior-issues}.json
│       └── manual-checklist.md
└── docs/superpowers/{specs,plans}/               # Unchanged
```

---

## Task 1: Migrate Theme A to multi-plugin layout

**Files:**
- Move: `skills/agent-init/` → `plugins/harness-builder/skills/agent-init/`
- Move: `hooks/` → `plugins/harness-builder/hooks/`
- Move: `.claude-plugin/plugin.json` → `plugins/harness-builder/plugin.json`
- Modify: `.claude-plugin/marketplace.json` (update source path)
- Modify: `tests/lib/detect-stack.test.mjs`, `plugin-scan.test.mjs`, `manifest-merge.test.mjs`, `render.test.mjs` (import paths)
- The 55 snapshot files under `tests/lib/__snapshots__/` stay valid (named by template-relative-path, not absolute).

- [ ] **Step 1: Move directories with git**

```bash
mkdir -p plugins/harness-builder
git mv skills/agent-init plugins/harness-builder/skills/agent-init
git mv hooks plugins/harness-builder/hooks
git mv .claude-plugin/plugin.json plugins/harness-builder/plugin.json
```

- [ ] **Step 2: Update marketplace.json**

Replace `.claude-plugin/marketplace.json` content with:

```json
{
  "name": "agent-skill",
  "description": "Harness builder + visual-QA + (future) optimisation skills for Claude Code",
  "plugins": [
    {
      "name": "harness-builder",
      "source": "./plugins/harness-builder",
      "description": "Bootstrap CLAUDE.md, .claude/agents/, hooks, and plugin wiring with /agent-init"
    }
  ]
}
```

- [ ] **Step 3: Update test import paths**

In each of these 4 files, replace `../../skills/agent-init/lib/` with `../../plugins/harness-builder/skills/agent-init/lib/`:
- `tests/lib/detect-stack.test.mjs`
- `tests/lib/plugin-scan.test.mjs`
- `tests/lib/manifest-merge.test.mjs`
- `tests/lib/render.test.mjs`

Also in `tests/lib/render.test.mjs` update `TEMPLATES_DIR`:

```javascript
// Was:
// const TEMPLATES_DIR = resolve(here, "..", "..", "skills", "harness-init", "templates");
// Becomes:
const TEMPLATES_DIR = resolve(here, "..", "..", "plugins", "harness-builder", "skills", "harness-init", "templates");
```

- [ ] **Step 4: Run all tests to verify migration**

Run: `node --test tests/lib/*.test.mjs`
Expected: all 79 tests pass (10 unit + 14 other unit + 55 snapshot).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(layout): move harness-builder under plugins/ for multi-plugin marketplace"
```

---

## Task 2: Scaffold harness-floor plugin

**Files:**
- Create: `plugins/harness-floor/plugin.json`
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Write `plugins/harness-floor/plugin.json`**

```json
{
  "name": "harness-floor",
  "version": "0.1.0",
  "description": "Visual QA skill with Playwright MCP capture and LLM per-image analysis",
  "skills": ["skills/visual-qa"]
}
```

- [ ] **Step 2: Register in marketplace.json**

Replace `.claude-plugin/marketplace.json`:

```json
{
  "name": "agent-skill",
  "description": "Harness builder + visual-QA + (future) optimisation skills for Claude Code",
  "plugins": [
    {
      "name": "harness-builder",
      "source": "./plugins/harness-builder",
      "description": "Bootstrap CLAUDE.md, .claude/agents/, hooks, and plugin wiring with /agent-init"
    },
    {
      "name": "harness-floor",
      "source": "./plugins/harness-floor",
      "description": "Cost-unrestricted patterns starting with /visual-qa (visual regression + LLM analysis via Playwright MCP)"
    }
  ]
}
```

- [ ] **Step 3: Verify manifests are valid JSON**

Run:
```bash
node -e "JSON.parse(require('node:fs').readFileSync('.claude-plugin/marketplace.json','utf-8'));JSON.parse(require('node:fs').readFileSync('plugins/harness-floor/plugin.json','utf-8'));console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-floor .claude-plugin/marketplace.json
git commit -m "feat(plugin): register harness-floor in marketplace"
```

---

## Task 3: `lib/config-loader.mjs` — TDD

**Files:**
- Create: `tests/visual-qa/fixtures/configs/minimal.json`
- Create: `tests/visual-qa/fixtures/configs/full.json`
- Create: `tests/visual-qa/fixtures/configs/invalid-missing-baseurl.json`
- Create: `tests/visual-qa/fixtures/configs/invalid-bad-breakpoint.json`
- Create: `tests/visual-qa/fixtures/configs/invalid-env-missing.json`
- Create: `tests/visual-qa/lib/config-loader.test.mjs`
- Create: `plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs`

- [ ] **Step 1: Write 5 fixtures**

`tests/visual-qa/fixtures/configs/minimal.json`:
```json
{
  "baseUrl": "http://localhost:3000",
  "breakpoints": [{ "name": "desktop", "width": 1440, "height": 900 }],
  "pages": [{ "name": "home", "path": "/", "components": [] }]
}
```

`tests/visual-qa/fixtures/configs/full.json`:
```json
{
  "baseUrl": "http://localhost:3000",
  "auth": {
    "type": "form",
    "cookieFile": ".visual-qa-auth.json",
    "loginFlow": [
      { "goto": "/login" },
      { "fill": "[name=email]", "value": "${env:VQA_EMAIL}" },
      { "click": "button[type=submit]" },
      { "waitFor": "[data-testid=dashboard]" }
    ]
  },
  "breakpoints": [
    { "name": "mobile", "width": 375, "height": 812 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "pages": [
    {
      "name": "settings",
      "path": "/settings",
      "requiresAuth": true,
      "components": [
        { "name": "save-btn", "selector": "button[type=submit]", "states": ["hover", "focus"] }
      ]
    }
  ],
  "flows": [
    { "name": "x", "steps": [{ "goto": "/x" }, { "screenshot": "y" }] }
  ],
  "analysis": {
    "model": "claude-sonnet-4-6",
    "categories": ["accessibility"],
    "severityThreshold": "minor"
  },
  "output": { "dir": "docs/visual-qa", "keepLastN": 5 }
}
```

`tests/visual-qa/fixtures/configs/invalid-missing-baseurl.json`:
```json
{
  "breakpoints": [{ "name": "d", "width": 1, "height": 1 }],
  "pages": []
}
```

`tests/visual-qa/fixtures/configs/invalid-bad-breakpoint.json`:
```json
{
  "baseUrl": "http://localhost",
  "breakpoints": [{ "name": "d" }],
  "pages": []
}
```

`tests/visual-qa/fixtures/configs/invalid-env-missing.json`:
```json
{
  "baseUrl": "http://localhost",
  "breakpoints": [{ "name": "d", "width": 1, "height": 1 }],
  "pages": [{ "name": "p", "path": "/", "components": [{ "name": "c", "selector": "[data-x=${env:MISSING_VAR_FOR_TEST}]" }] }]
}
```

- [ ] **Step 2: Write `tests/visual-qa/lib/config-loader.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../../../plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "configs", name);

test("loads minimal config", () => {
  const result = loadConfig(fx("minimal.json"), {});
  assert.equal(result.ok, true);
  assert.equal(result.config.baseUrl, "http://localhost:3000");
  assert.equal(result.config.pages.length, 1);
});

test("loads full config and resolves env vars", () => {
  const result = loadConfig(fx("full.json"), { VQA_EMAIL: "user@example.com" });
  assert.equal(result.ok, true);
  const emailStep = result.config.auth.loginFlow.find(s => s.fill === "[name=email]");
  assert.equal(emailStep.value, "user@example.com");
});

test("rejects when baseUrl is missing", () => {
  const result = loadConfig(fx("invalid-missing-baseurl.json"), {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => e.path === "baseUrl" && /required/i.test(e.message)));
});

test("rejects when breakpoint missing width/height", () => {
  const result = loadConfig(fx("invalid-bad-breakpoint.json"), {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /breakpoints\[0\]/.test(e.path)));
});

test("rejects when ${env:VAR} is unresolved", () => {
  const result = loadConfig(fx("invalid-env-missing.json"), {});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /MISSING_VAR_FOR_TEST/.test(e.message)));
});
```

- [ ] **Step 3: Run test — expect FAIL (module not found)**

Run: `node --test tests/visual-qa/lib/config-loader.test.mjs`
Expected: error containing "Cannot find module".

- [ ] **Step 4: Write `plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs`**

```javascript
import { readFileSync, existsSync } from "node:fs";

const REQUIRED_TOP = ["baseUrl", "breakpoints", "pages"];

function* validate(cfg) {
  for (const k of REQUIRED_TOP) {
    if (cfg[k] === undefined) yield { path: k, message: `${k} is required` };
  }
  if (Array.isArray(cfg.breakpoints)) {
    cfg.breakpoints.forEach((bp, i) => {
      if (typeof bp.name !== "string") yield { path: `breakpoints[${i}].name`, message: "must be string" };
      if (typeof bp.width !== "number") yield { path: `breakpoints[${i}].width`, message: "must be number" };
      if (typeof bp.height !== "number") yield { path: `breakpoints[${i}].height`, message: "must be number" };
    });
  }
  if (Array.isArray(cfg.pages)) {
    cfg.pages.forEach((p, i) => {
      if (typeof p.name !== "string") yield { path: `pages[${i}].name`, message: "must be string" };
      if (typeof p.path !== "string") yield { path: `pages[${i}].path`, message: "must be string" };
    });
  }
}

function resolveEnv(obj, env) {
  const errors = [];
  function walk(node) {
    if (typeof node === "string") {
      return node.replace(/\$\{env:([A-Z0-9_]+)\}/g, (match, name) => {
        if (env[name] === undefined) {
          errors.push({ path: "(env)", message: `env var ${name} not set (referenced as ${match})` });
          return match;
        }
        return env[name];
      });
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  }
  const resolved = walk(obj);
  return { resolved, errors };
}

export function loadConfig(path, env) {
  if (!existsSync(path)) {
    return { ok: false, errors: [{ path, message: "config file not found" }] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return { ok: false, errors: [{ path, message: `invalid JSON: ${e.message}` }] };
  }
  const { resolved, errors: envErrors } = resolveEnv(raw, env);
  const schemaErrors = Array.from(validate(resolved));
  const errors = [...schemaErrors, ...envErrors];
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: resolved };
}
```

- [ ] **Step 5: Run tests — expect 5/5 pass**

Run: `node --test tests/visual-qa/lib/config-loader.test.mjs`
Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/visual-qa/fixtures/configs tests/visual-qa/lib/config-loader.test.mjs plugins/harness-floor/skills/visual-qa/lib/config-loader.mjs
git commit -m "feat(visual-qa): config-loader with schema validation + env resolution (TDD)"
```

---

## Task 4: `lib/matrix-builder.mjs` — TDD

**Files:**
- Create: `tests/visual-qa/lib/matrix-builder.test.mjs`
- Create: `plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs`

- [ ] **Step 1: Write tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatrix } from "../../../plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs";

test("page with no components yields one _page entry per breakpoint", () => {
  const cfg = {
    breakpoints: [{ name: "m", width: 1, height: 1 }, { name: "d", width: 2, height: 2 }],
    pages: [{ name: "home", path: "/", components: [] }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 2);
  assert.ok(m.every(e => e.kind === "page"));
});

test("component with no states yields default only", () => {
  const cfg = {
    breakpoints: [{ name: "d", width: 1, height: 1 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button" }],
    }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 2); // 1 page + 1 component default
  assert.equal(m[1].state, "default");
});

test("component with states yields default + each state", () => {
  const cfg = {
    breakpoints: [{ name: "d", width: 1, height: 1 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button", states: ["hover", "focus"] }],
    }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 4); // 1 page + default + hover + focus
  assert.deepEqual(m.filter(e => e.kind === "component").map(e => e.state).sort(), ["default", "focus", "hover"]);
});

test("flows produce flow_step entries per screenshot action", () => {
  const cfg = {
    breakpoints: [{ name: "d", width: 1, height: 1 }],
    pages: [],
    flows: [
      { name: "f", steps: [{ goto: "/x" }, { screenshot: "a" }, { click: "btn" }, { screenshot: "b" }] },
    ],
  };
  const m = buildMatrix(cfg);
  const flowSteps = m.filter(e => e.kind === "flow_step");
  assert.equal(flowSteps.length, 2);
  assert.deepEqual(flowSteps.map(e => e.label), ["a", "b"]);
});

test("matrix total: 2 bp × (1 page + 1 component × 2 states) = 6 + 2 flow_steps = 8", () => {
  const cfg = {
    breakpoints: [{ name: "m", width: 1, height: 1 }, { name: "d", width: 2, height: 2 }],
    pages: [{
      name: "home", path: "/",
      components: [{ name: "btn", selector: "button", states: ["hover"] }],
    }],
    flows: [{ name: "f", steps: [{ screenshot: "a" }, { screenshot: "b" }] }],
  };
  const m = buildMatrix(cfg);
  assert.equal(m.length, 8);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs`**

```javascript
export function buildMatrix(config) {
  const matrix = [];
  const breakpoints = config.breakpoints ?? [];
  for (const page of config.pages ?? []) {
    for (const bp of breakpoints) {
      matrix.push({ kind: "page", page: page.name, bp: bp.name });
      for (const comp of page.components ?? []) {
        const states = ["default", ...(comp.states ?? [])];
        for (const state of states) {
          matrix.push({ kind: "component", page: page.name, bp: bp.name, component: comp.name, state });
        }
      }
    }
  }
  for (const flow of config.flows ?? []) {
    let stepIndex = 0;
    for (const step of flow.steps ?? []) {
      if (step.screenshot) {
        matrix.push({ kind: "flow_step", flow: flow.name, stepIndex, label: step.screenshot });
      }
      stepIndex++;
    }
  }
  return matrix;
}
```

- [ ] **Step 4: Run — 5/5 pass**

- [ ] **Step 5: Commit**

```bash
git add tests/visual-qa/lib/matrix-builder.test.mjs plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs
git commit -m "feat(visual-qa): matrix-builder flattens config into capture work-list (TDD)"
```

---

## Task 5: `lib/diff-runs.mjs` — TDD

**Files:**
- Create: `tests/visual-qa/fixtures/runs/prior-empty.json`
- Create: `tests/visual-qa/fixtures/runs/prior-issues.json`
- Create: `tests/visual-qa/lib/diff-runs.test.mjs`
- Create: `plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs`

- [ ] **Step 1: Write fixtures**

`tests/visual-qa/fixtures/runs/prior-empty.json`:
```json
{ "slug": "prior", "issues": [] }
```

`tests/visual-qa/fixtures/runs/prior-issues.json`:
```json
{
  "slug": "prior",
  "issues": [
    { "page": "home", "component": "hero", "state": "default", "bp": "desktop", "category": "alignment", "description": "logo off-center", "severity": "major" },
    { "page": "home", "component": "hero", "state": "hover", "bp": "desktop", "category": "color-contrast", "description": "text-bg ratio 3.1", "severity": "minor" }
  ]
}
```

- [ ] **Step 2: Write tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { diffRuns, issueKey } from "../../../plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, "..", "fixtures", "runs", name), "utf-8"));

const baseIssue = { page: "home", component: "hero", state: "default", bp: "desktop", category: "alignment", description: "logo off-center", severity: "major" };

test("issueKey is stable for identical inputs", () => {
  assert.equal(issueKey(baseIssue), issueKey({ ...baseIssue }));
});

test("first run: all issues are new (no prior)", () => {
  const d = diffRuns([baseIssue], null);
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 0);
  assert.equal(d.unchanged.length, 0);
});

test("no changes: all issues are unchanged", () => {
  const prior = load("prior-issues.json").issues;
  const d = diffRuns(prior, { issues: prior });
  assert.equal(d.new.length, 0);
  assert.equal(d.resolved.length, 0);
  assert.equal(d.unchanged.length, 2);
});

test("issue added since prior: 1 new, 0 resolved", () => {
  const prior = load("prior-issues.json").issues;
  const current = [...prior, { page: "home", component: "footer", state: "default", bp: "mobile", category: "copy-quality", description: "typo", severity: "minor" }];
  const d = diffRuns(current, { issues: prior });
  assert.equal(d.new.length, 1);
  assert.equal(d.resolved.length, 0);
  assert.equal(d.unchanged.length, 2);
});

test("issue removed since prior: 0 new, 1 resolved", () => {
  const prior = load("prior-issues.json").issues;
  const current = [prior[0]];
  const d = diffRuns(current, { issues: prior });
  assert.equal(d.new.length, 0);
  assert.equal(d.resolved.length, 1);
  assert.equal(d.unchanged.length, 1);
});
```

- [ ] **Step 3: Run — FAIL**

- [ ] **Step 4: Write `plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs`**

```javascript
import { createHash } from "node:crypto";

export function issueKey(issue) {
  const sig = `${issue.page}|${issue.component}|${issue.state}|${issue.bp}|${issue.category}|${issue.description}`;
  const hash = createHash("sha1").update(sig).digest("hex").slice(0, 8);
  return `${issue.page}/${issue.component}/${issue.state}/${issue.bp}/${issue.category}/${hash}`;
}

export function diffRuns(currentIssues, priorRun) {
  const currentMap = new Map(currentIssues.map(i => [issueKey(i), i]));
  const priorIssues = priorRun?.issues ?? [];
  const priorMap = new Map(priorIssues.map(i => [issueKey(i), i]));

  const newIssues = [];
  const unchanged = [];
  for (const [k, issue] of currentMap) {
    if (priorMap.has(k)) unchanged.push(issue);
    else newIssues.push(issue);
  }
  const resolved = [];
  for (const [k, issue] of priorMap) {
    if (!currentMap.has(k)) resolved.push(issue);
  }
  return { new: newIssues, resolved, unchanged };
}
```

- [ ] **Step 5: Run — 5/5 pass**

- [ ] **Step 6: Commit**

```bash
git add tests/visual-qa/fixtures/runs tests/visual-qa/lib/diff-runs.test.mjs plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs
git commit -m "feat(visual-qa): diff-runs computes new/resolved/unchanged by stable issue key (TDD)"
```

---

## Task 6: `lib/cost-estimator.mjs` — TDD

**Files:**
- Create: `tests/visual-qa/lib/cost-estimator.test.mjs`
- Create: `plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs`

- [ ] **Step 1: Write tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, MODEL_PRICES } from "../../../plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs";

test("empty matrix costs zero", () => {
  assert.equal(estimateCost([], "claude-sonnet-4-6"), 0);
});

test("known model gives positive cost proportional to matrix size", () => {
  const m1 = estimateCost(new Array(10).fill({}), "claude-sonnet-4-6");
  const m2 = estimateCost(new Array(20).fill({}), "claude-sonnet-4-6");
  assert.ok(m1 > 0);
  assert.ok(Math.abs(m2 - 2 * m1) < 0.0001);
});

test("unknown model falls back to default price and warns via return.warnings", () => {
  // estimateCost can be enhanced to return { usd, warnings }; for now just check it returns positive
  const c = estimateCost(new Array(5).fill({}), "unknown-model");
  assert.ok(c > 0);
});

test("MODEL_PRICES table includes claude-sonnet-4-6 and claude-haiku-4-5", () => {
  assert.ok(MODEL_PRICES["claude-sonnet-4-6"] > 0);
  assert.ok(MODEL_PRICES["claude-haiku-4-5"] > 0);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write `plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs`**

```javascript
// Rough per-capture USD cost: input image tokens (~1500 for 1024x768) + output (~500 tokens) at model rate.
// These are coarse estimates for budget guard-rails; not authoritative.
export const MODEL_PRICES = {
  "claude-opus-4-7": 0.045,
  "claude-sonnet-4-6": 0.012,
  "claude-haiku-4-5": 0.004,
};

const DEFAULT_PRICE = 0.012;

export function estimateCost(matrix, model) {
  const perCapture = MODEL_PRICES[model] ?? DEFAULT_PRICE;
  return matrix.length * perCapture;
}
```

- [ ] **Step 4: Run — 4/4 pass**

- [ ] **Step 5: Commit**

```bash
git add tests/visual-qa/lib/cost-estimator.test.mjs plugins/harness-floor/skills/visual-qa/lib/cost-estimator.mjs
git commit -m "feat(visual-qa): cost-estimator with model price table (TDD)"
```

---

## Task 7: Template `visual-qa.config.json.hbs`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs`

- [ ] **Step 1: Write template**

```handlebars
{
  "baseUrl": "{{baseUrl}}",
  "breakpoints": [
    { "name": "mobile",  "width": 375,  "height": 812 },
    { "name": "tablet",  "width": 768,  "height": 1024 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "pages": [
    {
      "name": "home",
      "path": "/",
      "components": [
        { "name": "header", "selector": "[data-testid=header]" },
        { "name": "primary-cta", "selector": "[data-testid=primary-cta]", "states": ["hover", "focus"] }
      ]
    }
  ],
  "flows": [],
  "analysis": {
    "model": "{{model}}",
    "categories": ["accessibility", "alignment", "color-contrast", "copy-quality", "responsive-fit"],
    "severityThreshold": "minor"
  },
  "output": {
    "dir": "docs/visual-qa",
    "keepLastN": 10
  }
}
```

Note: `{{model}}` will be rendered to e.g. `claude-sonnet-4-6` by Phase 1 of `/agent-init --visual-qa`. `{{baseUrl}}` defaults to `http://localhost:3000`.

- [ ] **Step 2: Render-test**

Render via the existing render lib (re-used from harness-builder):

```bash
node -e "import('./plugins/harness-builder/skills/agent-init/lib/render.mjs').then(m=>{const out=m.render(require('node:fs').readFileSync('plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs','utf-8'),{baseUrl:'http://localhost:3000',model:'claude-sonnet-4-6'});JSON.parse(out);console.log('valid json')})"
```
Expected: `valid json`.

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs
git commit -m "feat(visual-qa): visual-qa.config.json.hbs starter config template"
```

---

## Task 8: Template `analysis-prompt.md.hbs`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/templates/analysis-prompt.md.hbs`

- [ ] **Step 1: Write the prompt template**

```handlebars
You are a UI/UX QA reviewer analyzing a single screenshot of a web interface.

## Context (provided per capture)

- **Page:** <provided>
- **Component:** <provided> (or `_page` for full-page capture)
- **State:** <provided> (default | hover | focus | active | disabled)
- **Breakpoint:** <provided> (width × height)

## Categories to consider

{{#each categories}}- {{this}}
{{/each}}

## Severity definitions

- **critical** — blocks the user (broken layout, unreadable text, unreachable target)
- **major** — degrades the experience noticeably (poor contrast, misaligned, off-spec)
- **minor** — polish issue (small inconsistency, easy improvement)

Report only issues at severity `{{severityThreshold}}` or higher.

## Output format (strict)

You MUST emit exactly two things, in this order, with NOTHING ELSE before, after, or between:

1. A fenced ```json code block with this schema:
   ```json
   {
     "issues": [
       { "severity": "critical|major|minor", "category": "<from list>", "description": "<one sentence>", "suggestion": "<one sentence>" }
     ],
     "summary": "<one-sentence overview>"
   }
   ```
   If no issues at or above threshold: `{"issues": [], "summary": "No issues at or above {{severityThreshold}}."}`

2. A markdown paragraph (1-3 sentences) explaining what you see in plain language. No headings.

## Limitations to acknowledge

- The `active` state may be approximated via class toggle and may not look like a true `:active` pseudo-class. Note this if visible.
- Static screenshots cannot evaluate motion, transitions, or runtime errors.

Begin analysis when given the image.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/templates/analysis-prompt.md.hbs
git commit -m "feat(visual-qa): analysis-prompt.md.hbs guides LLM to strict JSON+markdown output"
```

---

## Task 9: Template `report.md.hbs`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/templates/report.md.hbs`

- [ ] **Step 1: Write template**

```handlebars
# Visual QA Report — {{slug}}

**Timestamp:** {{timestamp}}
**Matrix:** {{matrix.totalCaptures}} captures across {{pageCount}} pages

## Summary

| Severity | New | Resolved | Unchanged | Total |
|----------|-----|----------|-----------|-------|
| Critical | {{counts.critical.new}} | {{counts.critical.resolved}} | {{counts.critical.unchanged}} | {{counts.critical.total}} |
| Major    | {{counts.major.new}} | {{counts.major.resolved}} | {{counts.major.unchanged}} | {{counts.major.total}} |
| Minor    | {{counts.minor.new}} | {{counts.minor.resolved}} | {{counts.minor.unchanged}} | {{counts.minor.total}} |

{{#if hasIncompletePages}}
## Incomplete pages

The following pages did not complete capture and are excluded from issue counts above:

{{#each incompletePages}}- **{{this.page}}** — {{this.reason}}
{{/each}}
{{/if}}

## New Issues

{{#each newIssues}}### [{{severity}}] {{page}} / {{component}} / {{state}} @ {{bp}}

**Category:** {{category}}
**Description:** {{description}}
**Suggestion:** {{suggestion}}

![{{component}} {{state}}]({{imagePath}})

{{/each}}

## Resolved Issues

{{#each resolvedIssues}}- [{{severity}}] {{page}} / {{component}} / {{state}} @ {{bp}} — {{description}}
{{/each}}

## Unchanged Issues

{{#each unchangedIssues}}- [{{severity}}] {{page}} / {{component}} / {{state}} @ {{bp}} — {{description}}
{{/each}}

## Footer

Generated by `/visual-qa`. Config: `.visual-qa.json`. Cost estimate: ${{estCostUSD}}.
```

- [ ] **Step 2: Render-test**

```bash
node -e "import('./plugins/harness-builder/skills/agent-init/lib/render.mjs').then(m=>{const out=m.render(require('node:fs').readFileSync('plugins/harness-floor/skills/visual-qa/templates/report.md.hbs','utf-8'),{slug:'2026-05-17-test',timestamp:'2026-05-17T00:00Z',matrix:{totalCaptures:42},pageCount:3,counts:{critical:{new:0,resolved:0,unchanged:0,total:0},major:{new:1,resolved:0,unchanged:0,total:1},minor:{new:0,resolved:0,unchanged:0,total:0}},hasIncompletePages:false,incompletePages:[],newIssues:[{severity:'major',page:'home',component:'cta',state:'hover',bp:'desktop',category:'color-contrast',description:'low contrast',suggestion:'darken',imagePath:'home/desktop/cta__hover.png'}],resolvedIssues:[],unchangedIssues:[],estCostUSD:'1.20'});console.log(out)})"
```
Expected: full markdown output with the major issue row rendered correctly.

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/templates/report.md.hbs
git commit -m "feat(visual-qa): report.md.hbs human-readable run output"
```

---

## Task 10: Template snapshot tests

**Files:**
- Create: `tests/visual-qa/templates/snapshot.test.mjs`
- Create: `tests/visual-qa/templates/__snapshots__/` (auto-populated)

- [ ] **Step 1: Write test file**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { render } from "../../../plugins/harness-builder/skills/agent-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));

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

const TEMPLATES_DIR = resolve(here, "..", "..", "..", "plugins", "harness-floor", "skills", "visual-qa", "templates");

const FIXTURES = [
  {
    tag: "minimal",
    ctx: {
      baseUrl: "http://localhost:3000",
      model: "claude-sonnet-4-6",
      categories: ["accessibility"],
      severityThreshold: "minor",
      slug: "2026-05-17-min",
      timestamp: "2026-05-17T00:00:00Z",
      matrix: { totalCaptures: 0 },
      pageCount: 0,
      counts: {
        critical: { new: 0, resolved: 0, unchanged: 0, total: 0 },
        major: { new: 0, resolved: 0, unchanged: 0, total: 0 },
        minor: { new: 0, resolved: 0, unchanged: 0, total: 0 },
      },
      hasIncompletePages: false,
      incompletePages: [],
      newIssues: [],
      resolvedIssues: [],
      unchangedIssues: [],
      estCostUSD: "0.00",
    },
  },
  {
    tag: "with-issues",
    ctx: {
      baseUrl: "http://localhost:3000",
      model: "claude-opus-4-7",
      categories: ["accessibility", "alignment"],
      severityThreshold: "major",
      slug: "2026-05-17-iss",
      timestamp: "2026-05-17T01:00:00Z",
      matrix: { totalCaptures: 42 },
      pageCount: 3,
      counts: {
        critical: { new: 1, resolved: 0, unchanged: 0, total: 1 },
        major: { new: 0, resolved: 1, unchanged: 1, total: 2 },
        minor: { new: 0, resolved: 0, unchanged: 0, total: 0 },
      },
      hasIncompletePages: true,
      incompletePages: [{ page: "checkout", reason: "auth flow timed out" }],
      newIssues: [{ severity: "critical", page: "home", component: "modal", state: "default", bp: "mobile", category: "alignment", description: "modal off-screen", suggestion: "constrain max-width", imagePath: "home/mobile/modal__default.png" }],
      resolvedIssues: [{ severity: "major", page: "home", component: "hero", state: "hover", bp: "desktop", description: "logo off-center" }],
      unchangedIssues: [{ severity: "major", page: "home", component: "footer", state: "default", bp: "tablet", description: "missing copyright" }],
      estCostUSD: "1.20",
    },
  },
  {
    tag: "categories-only",
    ctx: { categories: ["a11y", "color"], severityThreshold: "critical", baseUrl: "http://localhost:8080", model: "claude-haiku-4-5", slug: "", timestamp: "", matrix: { totalCaptures: 0 }, pageCount: 0, counts: { critical: { new: 0, resolved: 0, unchanged: 0, total: 0 }, major: { new: 0, resolved: 0, unchanged: 0, total: 0 }, minor: { new: 0, resolved: 0, unchanged: 0, total: 0 } }, hasIncompletePages: false, incompletePages: [], newIssues: [], resolvedIssues: [], unchangedIssues: [], estCostUSD: "0.00" },
  },
];

function listTemplates(dir, base = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = `${base}${e.name}`;
    return e.isDirectory() ? listTemplates(resolve(dir, e.name), `${p}/`) : [p];
  });
}

for (const tplRel of listTemplates(TEMPLATES_DIR)) {
  if (!tplRel.endsWith(".hbs") && !tplRel.endsWith(".md.hbs")) continue;
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplRel), "utf-8");
  for (const fx of FIXTURES) {
    test(`snapshot: ${tplRel} × ${fx.tag}`, () => {
      const out = render(tpl, fx.ctx);
      snapshot(`${tplRel.replace(/\//g, "_")}__${fx.tag}`, out);
    });
  }
}
```

- [ ] **Step 2: Generate snapshots**

Run: `UPDATE_SNAPSHOTS=1 node --test tests/visual-qa/templates/snapshot.test.mjs`
Expected: 9 tests pass (3 templates × 3 fixtures), snapshots in `tests/visual-qa/templates/__snapshots__/`.

- [ ] **Step 3: Re-run without UPDATE_SNAPSHOTS**

Run: `node --test tests/visual-qa/templates/snapshot.test.mjs`
Expected: 9/9 pass, no drift.

- [ ] **Step 4: Commit**

```bash
git add tests/visual-qa/templates
git commit -m "test(visual-qa): snapshot all 3 templates across 3 fixtures"
```

---

## Task 11: `skills/visual-qa/SKILL.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/SKILL.md`

- [ ] **Step 1: Write the orchestrator**

```markdown
---
name: visual-qa
description: Cost-unrestricted visual QA. Drives Playwright MCP to capture a configured matrix of screenshots (pages × components × states × breakpoints + flows), runs LLM analysis per image, diffs vs prior run, writes a markdown+JSON report. Requires `.visual-qa.json` config at project root.
---

# /visual-qa

Drives the visual QA pipeline for the current project. Reads `.visual-qa.json`, captures the matrix via Playwright MCP, analyses each image with the configured LLM, and produces `docs/visual-qa/<date-slug>/report.md`.

## Flags

- `--resume` — skip phases already complete per `.visual-qa-state.json`.
- `--force` — wipe today's slug directory and re-run from scratch.
- `--yes` — skip the Phase 1 confirmation prompt.
- `--budget=<USD>` — abort mid-run if accumulated estimated cost exceeds this.
- `--skip-health` — skip Phase 0 baseUrl health check.
- `--slug=<custom>` — override the auto-generated date slug.

## Pipeline

The skill runs 6 phases strictly in order. Each phase has its own file under `phases/`; Read it on demand.

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + Playwright MCP + health checks |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, get user confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | page-level fan-out: capture + analyze per page |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | console summary + exit code |

## Rules

1. **You orchestrate; phases are the source of truth.** Read each phase file before running it.
2. **State lives in `.visual-qa-state.json`.** Shape: `{ "phases": [{phase, completedAt}], "slug": "...", "matrix": {...}, "estCostUSD": N, "perPageStatus": {...} }`. `--resume` resumes after `max(phases[*].phase)`.
3. **Parallel only in Phase 3.** Invoke `superpowers:dispatching-parallel-agents` before fan-out.
4. **One subagent per page; that subagent IS the analyzer.** Dispatch with the configured `analysis.model`. The page-subagent reads its own captured `.png` files via the Read tool and emits the JSON+markdown analysis itself.
5. **context-mode for any non-trivial inspection.** Use `mcp__plugin_context-mode_context-mode__ctx_batch_execute` for shell work.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path, env)` → `{ok, config | errors}`
- `lib/matrix-builder.mjs` — `buildMatrix(config)` → flat work-list
- `lib/diff-runs.mjs` — `diffRuns(current, prior)` → `{new, resolved, unchanged}`. Also `issueKey(issue)`.
- `lib/cost-estimator.mjs` — `estimateCost(matrix, model)` → USD. Also `MODEL_PRICES`.

## On error

- `.visual-qa.json` missing → abort + suggest `/agent-init --visual-qa`.
- Playwright MCP not available → abort + suggest plugin install.
- baseUrl down → ask user to continue (or abort in non-interactive).
- Matrix > 500 captures + no `--yes` → require explicit confirm.
- `--budget` exceeded → abort gracefully, save partial report.
- 3+ analysis errors in one page → that page marked incomplete, others continue, exit code 2.
- Auth flow fails → page-subagent BLOCKED.

## When done

Print summary, set exit code: 0 = clean, 1 = critical issues, 2 = partial completion.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/SKILL.md
git commit -m "feat(visual-qa): SKILL.md thin orchestrator"
```

---

## Task 12: `phases/0-preflight.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/phases/0-preflight.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 0 — Preflight

## Steps

1. Confirm `.visual-qa.json` exists at the project root. If not: print `Run /agent-init --visual-qa to scaffold the config.` and abort.

2. Confirm Playwright MCP tools are available. Use `ToolSearch` to load `mcp__plugin_playwright_playwright__browser_navigate`. If unavailable: print `Install the playwright plugin: /plugin install playwright@claude-plugins-official` and abort.

3. Unless `--skip-health`: GET `<baseUrl>` with 5s timeout (use `ctx_execute` with `language: "shell"` and `curl --max-time 5 -s -o /dev/null -w "%{http_code}" <baseUrl>`). If the status is not 2xx:
   - If `--yes`: abort with `baseUrl not responding`.
   - Else: ask user `Dev server at <baseUrl> not responding (status=<x>). Continue anyway? [y/N]` and wait.

4. Read `.visual-qa-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 0`, skip the rest of Phase 0.

5. Push `{ "phase": 0, "completedAt": "<iso>" }` onto `phases` in `.visual-qa-state.json` (create the file with `{"phases": []}` if missing). Atomic write: temp file + rename.

## Output to user

Print: `Preflight OK (config + Playwright + health).`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/phases/0-preflight.md
git commit -m "feat(visual-qa): 0-preflight phase doc"
```

---

## Task 13: `phases/1-config.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/phases/1-config.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 1 — Config + Matrix

## Inputs

- `.visual-qa.json` at project root
- environment variables (for `${env:...}` substitution)
- CLI flags: `--yes`, `--force`, `--budget`

## Steps

1. Load config:
   ```javascript
   import { loadConfig } from "./lib/config-loader.mjs";
   const result = loadConfig(".visual-qa.json", process.env);
   if (!result.ok) { /* print result.errors as 'field: message', abort */ }
   const config = result.config;
   ```

2. Build matrix:
   ```javascript
   import { buildMatrix } from "./lib/matrix-builder.mjs";
   const matrix = buildMatrix(config);
   ```

3. Estimate cost:
   ```javascript
   import { estimateCost } from "./lib/cost-estimator.mjs";
   const estCostUSD = estimateCost(matrix, config.analysis?.model ?? "claude-sonnet-4-6");
   ```

4. If `--budget` is set and `estCostUSD > budget`: abort with `Estimated cost $X exceeds budget $Y. Reduce matrix or raise --budget.`

5. Print:
   ```
   Matrix: <matrix.length> captures across <distinct pages> pages, <flows> flows.
   Estimated LLM cost: ~$<estCostUSD>
   ```

6. If `matrix.length > 500` OR `--yes` not set: ask `Proceed? [Y/n]` and wait. (`--yes` skips except when over 500.)

7. Update state:
   - Push `{phase: 1, completedAt}` to `phases`.
   - Set top-level `matrix: {totalCaptures: matrix.length, byPage: {<page>: <count>}}`.
   - Set top-level `estCostUSD`.

## Output to user

Print: `Config OK. Matrix: <N> captures.`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/phases/1-config.md
git commit -m "feat(visual-qa): 1-config phase doc"
```

---

## Task 14: `phases/2-discover.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/phases/2-discover.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 2 — Prior-run discovery + slug dir

## Inputs

- `config.output.dir` (default `docs/visual-qa`)
- `config.output.keepLastN` (default 10)
- CLI: `--slug=<custom>`, `--force`, `--resume`

## Steps

1. List subdirectories of `<config.output.dir>/`. Filter to those with a complete `report.json` (file exists AND parses to JSON with non-empty `slug` field).

2. Sort by directory-name (ISO date prefix sorts lexicographically). Take the most recent as `priorRun`. If none, `priorRun = null`.

3. `keepLastN` cleanup: if more than `keepLastN` complete runs exist, delete the oldest excess directories (rm -rf). Do not delete the just-found `priorRun`.

4. Compute slug:
   - If `--slug=<x>` provided: use `x`.
   - Else: `${YYYY-MM-DD}-${random7hex}`.

5. Determine target dir: `<config.output.dir>/<slug>/`.
   - If exists and `--resume`: keep contents.
   - If exists and `--force`: rm -rf, then mkdir.
   - If exists and neither flag: abort `Slug dir already exists; use --resume or --force.`
   - If not exists: mkdir.

6. Update state:
   - Set top-level `slug`.
   - Push `{phase: 2, completedAt}` to `phases`.
   - Stash `priorRun` path (not contents) in `.visual-qa-state.json` under `priorRunPath` for Phase 4.

## Output to user

Print: `Slug: <slug>. Prior run: <path or 'none'>.`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/phases/2-discover.md
git commit -m "feat(visual-qa): 2-discover phase doc"
```

---

## Task 15: `phases/3-capture.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/phases/3-capture.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 3 — Capture + Analyze (parallel fan-out)

## Pre-fan-out

Invoke `Skill` with `superpowers:dispatching-parallel-agents`. Adopt its dispatch checklist before fan-out.

## Inputs

- `config` from Phase 1
- `matrix` (you may rebuild from config if not persisted)
- `slug-dir` from Phase 2

## Group matrix by page

Group `matrix` entries by `page` (entries with `kind: "flow_step"` form a single virtual page named `__flows__`). Pages with no entries are skipped.

## Dispatch one subagent per page

For each page-group, dispatch via the `Agent` tool with:
- `subagent_type: "general-purpose"`
- `model: <config.analysis.model>` (default `claude-sonnet-4-6`)
- `description: "Visual QA capture: <page>"`
- `prompt`: a prompt that includes:
  1. The full `analysis-prompt.md.hbs` rendered with `{categories, severityThreshold}` from config.
  2. The page's `config.pages[?]` entry verbatim (or, for `__flows__`, the relevant `config.flows[]`).
  3. The breakpoint list.
  4. The auth.loginFlow if `page.requiresAuth`.
  5. The baseUrl.
  6. The output dir for this page (`<slug-dir>/<page>/` or `<slug-dir>/flows/<flowName>/`).
  7. Strict instructions on the capture loop (see Per-subagent steps below).

## Per-subagent steps (these go into the dispatched prompt)

The page-subagent receives those inputs and:

1. If `page.requiresAuth`: run the `loginFlow` step DSL (goto/fill/click/waitFor) via `mcp__plugin_playwright_playwright__*` tools in its own tab.

2. `browser_navigate` to `<baseUrl><page.path>`.

3. For each breakpoint:
   a. `browser_resize(width, height)`
   b. Full-page screenshot via `browser_take_screenshot(fullPage: true)` to `<outputDir>/<bp>/_page.png`.
   c. Read the just-saved `.png` and emit a `_page.analysis.json` + `_page.analysis.md` pair (see "Analysis output" below).
   d. For each component:
      i. Default state: `browser_take_screenshot(element: <selector>)` to `<outputDir>/<bp>/<comp>__default.png`. Then analyze.
      ii. For each declared state in `component.states`:
          - `hover` → `browser_hover(selector)`
          - `focus` → `browser_evaluate('(s) => document.querySelector(s)?.focus()', selector)`
          - `active` → `browser_evaluate('(s) => document.querySelector(s)?.classList.add("active")', selector)` (best-effort; document limitation per analysis prompt)
          - `disabled` → `browser_evaluate('(s) => document.querySelector(s)?.setAttribute("disabled","")', selector)`
          - Then `browser_take_screenshot(element: selector)` to `<outputDir>/<bp>/<comp>__<state>.png`. Analyze.
          - Reset between states: re-navigate to page (cheap, deterministic).

4. For `__flows__` virtual page: walk `flow.steps`. The `screenshot` action saves `<outputDir>/<NN>-<label>.png` and analyses immediately (NN is zero-padded step index).

5. Analysis output per capture:
   - Read the `.png` via the `Read` tool. The model receives it as vision input.
   - Emit a fenced ```json block per `analysis-prompt.md.hbs`'s schema, followed by a markdown paragraph.
   - Extract the JSON, write to `<image>.analysis.json`. Write the markdown paragraph to `<image>.analysis.md`.
   - If JSON is malformed: retry once with `"Your previous JSON was invalid; emit only the schema-compliant JSON block followed by the paragraph."`. If still invalid: write `{"error":"analysis_malformed","raw":"..."}` to the JSON file and continue.

6. If 3+ captures in this page hit `analysis_malformed`, return BLOCKED early.

7. Return `{page, captures: <count>, errors: [<list>], paths: [<paths>], status: "completed"|"incomplete"}`.

## Orchestrator after fan-out

1. Collect all subagent results.
2. Per-page status → `state.perPageStatus`.
3. Push `{phase: 3, completedAt}` to `phases` in state.

## Output to user

Print one line per page: `<page>: <N> captures, <M> errors, <status>`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/phases/3-capture.md
git commit -m "feat(visual-qa): 3-capture phase doc (fan-out + per-page capture/analyze loop)"
```

---

## Task 16: `phases/4-aggregate.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/phases/4-aggregate.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 4 — Aggregate + Diff + Report

## Steps

1. Walk `<slug-dir>/` recursively for `*.analysis.json` files. Use `ctx_batch_execute` with shell `find` or Node fs walk.

2. Parse each JSON. Skip entries with `error` field (record them under `errored`).

3. For each valid analysis, expand its `issues[]` into flat records, attaching `page`, `component`, `state`, `bp`, `imagePath` (derived from the JSON file's path).

4. Load prior run if `state.priorRunPath` set:
   ```javascript
   const prior = JSON.parse(readFileSync(`${priorRunPath}/report.json`, "utf-8"));
   ```

5. Diff:
   ```javascript
   import { diffRuns } from "./lib/diff-runs.mjs";
   const diff = diffRuns(currentIssues, prior);
   ```

6. Compute severity counts for the report header (new/resolved/unchanged × critical/major/minor totals).

7. Identify `incompletePages` from `state.perPageStatus`.

8. Write `<slug-dir>/report.json`:
   ```json
   {
     "slug": "...",
     "timestamp": "<iso>",
     "matrix": { "totalCaptures": N },
     "issues": [<currentIssues>],
     "diff": <diff>,
     "perPageStatus": <state.perPageStatus>,
     "estCostUSD": <state.estCostUSD>,
     "errored": [<errored captures>]
   }
   ```

9. Render `templates/report.md.hbs` with the computed context. Write to `<slug-dir>/report.md`.

10. Push `{phase: 4, completedAt}` to `phases` in state.

## Output to user

Print: `Report written: <slug-dir>/report.md`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/phases/4-aggregate.md
git commit -m "feat(visual-qa): 4-aggregate phase doc"
```

---

## Task 17: `phases/5-summary.md`

**Files:**
- Create: `plugins/harness-floor/skills/visual-qa/phases/5-summary.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 5 — Summary + Exit Code

## Steps

1. Read `<slug-dir>/report.json` (just written by Phase 4).
2. Compute totals from `report.diff`.
3. Print to console:
   ```
   Visual QA complete: <totalCaptures> captures, <totalIssues> issues (<critical> critical, <major> major, <minor> minor)
   vs prior run: +<newCount> new, -<resolvedCount> resolved, <unchangedCount> unchanged
   Report: <slug-dir>/report.md
   ```
4. Determine exit code:
   - 0 if no critical issues AND no incomplete pages
   - 1 if any critical issue
   - 2 if any incomplete page (even when no critical issues)
5. Push `{phase: 5, completedAt}` to `phases` in state.
6. `process.exit(code)`.

## Output to user

Single block per step 3, then exit.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/visual-qa/phases/5-summary.md
git commit -m "feat(visual-qa): 5-summary phase doc"
```

---

## Task 18: Scenario integration test (mocked page-subagent)

**Files:**
- Create: `tests/visual-qa/scenarios/page-subagent.test.mjs`

This task tests the deterministic *coordination* logic (aggregation, diff, report rendering) using a mock page-subagent. The actual page-subagent (which uses MCP + LLM) is verified manually via the checklist.

We build a small in-test helper `runMockPipeline(config, mockResults, priorRun)` that:
1. Builds the matrix.
2. Pretends each capture produced a pre-baked analysis (from `mockResults`).
3. Runs the aggregate logic from Phase 4 against the fake captures.
4. Returns the rendered report.

- [ ] **Step 1: Write the test (it will need a small helper at top)**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatrix } from "../../../plugins/harness-floor/skills/visual-qa/lib/matrix-builder.mjs";
import { diffRuns } from "../../../plugins/harness-floor/skills/visual-qa/lib/diff-runs.mjs";

function aggregate(captures) {
  const issues = captures.flatMap(c => (c.analysis?.issues ?? []).map(i => ({
    ...i,
    page: c.page, component: c.component, state: c.state, bp: c.bp, imagePath: c.imagePath,
  })));
  return issues;
}

const config = {
  baseUrl: "http://localhost:3000",
  breakpoints: [{ name: "d", width: 1, height: 1 }],
  pages: [{ name: "home", path: "/", components: [{ name: "btn", selector: "button" }] }],
};

test("first run: aggregated issues all surface as new in diff", () => {
  const matrix = buildMatrix(config);
  const captures = matrix.map(entry => ({
    ...entry,
    imagePath: `home/d/${entry.component ?? "_page"}__${entry.state ?? "n_a"}.png`,
    analysis: {
      issues: entry.component === "btn"
        ? [{ severity: "minor", category: "color-contrast", description: "ratio 4.3", suggestion: "increase" }]
        : [],
      summary: "...",
    },
  }));
  const issues = aggregate(captures);
  const diff = diffRuns(issues, null);
  assert.equal(diff.new.length, 1);
  assert.equal(diff.resolved.length, 0);
  assert.equal(diff.unchanged.length, 0);
});

test("re-run with same captures: all unchanged", () => {
  const matrix = buildMatrix(config);
  const captures = matrix.map(entry => ({
    ...entry,
    imagePath: `home/d/${entry.component ?? "_page"}__${entry.state ?? "n_a"}.png`,
    analysis: { issues: entry.component === "btn" ? [{ severity: "minor", category: "color-contrast", description: "ratio 4.3", suggestion: "increase" }] : [], summary: "..." },
  }));
  const issues = aggregate(captures);
  const diff = diffRuns(issues, { issues });
  assert.equal(diff.new.length, 0);
  assert.equal(diff.unchanged.length, 1);
});

test("new issue surfaces in diff", () => {
  const matrix = buildMatrix(config);
  const priorCaptures = matrix.map(e => ({
    ...e,
    imagePath: `home/d/${e.component ?? "_page"}__${e.state ?? "n_a"}.png`,
    analysis: { issues: [], summary: "..." },
  }));
  const currentCaptures = priorCaptures.map((c, i) => i === 1
    ? { ...c, analysis: { issues: [{ severity: "major", category: "alignment", description: "off by 3px", suggestion: "snap" }], summary: "..." } }
    : c
  );
  const diff = diffRuns(aggregate(currentCaptures), { issues: aggregate(priorCaptures) });
  assert.equal(diff.new.length, 1);
  assert.equal(diff.new[0].category, "alignment");
});

test("resolved issue surfaces in diff", () => {
  const matrix = buildMatrix(config);
  const priorCaptures = matrix.map((e, i) => ({
    ...e,
    imagePath: `home/d/${e.component ?? "_page"}__${e.state ?? "n_a"}.png`,
    analysis: { issues: i === 1 ? [{ severity: "major", category: "alignment", description: "old", suggestion: "x" }] : [], summary: "" },
  }));
  const currentCaptures = priorCaptures.map(c => ({ ...c, analysis: { issues: [], summary: "" } }));
  const diff = diffRuns(aggregate(currentCaptures), { issues: aggregate(priorCaptures) });
  assert.equal(diff.new.length, 0);
  assert.equal(diff.resolved.length, 1);
});

test("partial failure: errored captures excluded from diff", () => {
  const matrix = buildMatrix(config);
  const captures = matrix.map((e, i) => i === 1
    ? { ...e, imagePath: `home/d/btn__default.png`, analysis: null, error: "analysis_malformed" }
    : { ...e, imagePath: `home/d/_page.png`, analysis: { issues: [], summary: "" } }
  );
  const issues = aggregate(captures.filter(c => !c.error));
  const diff = diffRuns(issues, null);
  assert.equal(diff.new.length, 0);
});
```

- [ ] **Step 2: Run — 5/5 pass**

Run: `node --test tests/visual-qa/scenarios/page-subagent.test.mjs`
Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/visual-qa/scenarios
git commit -m "test(visual-qa): scenario tests for aggregation + diff under mock captures"
```

---

## Task 19: Manual E2E checklist

**Files:**
- Create: `tests/visual-qa/manual-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Visual QA — Manual E2E Checklist

Run before each `harness-floor` release. Requires:
- A small fixture web app (Next.js or static HTML) with at least 2 pages, a login form, and a button with visible hover/focus styles.
- Local dev server running (e.g. `npm run dev`).
- Playwright plugin enabled.

## Setup

\`\`\`bash
mkdir /tmp/visual-qa-fixture && cd /tmp/visual-qa-fixture
git init
# (Place fixture app here.)
\`\`\`

Drop this `.visual-qa.json`:

\`\`\`json
{
  "baseUrl": "http://localhost:3000",
  "breakpoints": [
    { "name": "mobile", "width": 375, "height": 812 },
    { "name": "desktop", "width": 1440, "height": 900 }
  ],
  "pages": [
    { "name": "home", "path": "/", "components": [
      { "name": "cta", "selector": "button.primary", "states": ["hover", "focus"] }
    ]}
  ]
}
\`\`\`

## Checks

- [ ] `/visual-qa` with no `.visual-qa.json` aborts and suggests `/agent-init --visual-qa`.
- [ ] Stop the dev server, run `/visual-qa` — Phase 0 asks "continue anyway?" and abort on "n".
- [ ] First successful run produces `docs/visual-qa/YYYY-MM-DD-<hex>/` with: `report.md`, `report.json`, `home/mobile/_page.png`, `home/desktop/_page.png`, `home/*/cta__default.png`, `home/*/cta__hover.png`, `home/*/cta__focus.png`.
- [ ] Each `.png` has a sibling `.analysis.json` (parses) and `.analysis.md` (non-empty).
- [ ] `report.md` has Summary table, New Issues section.
- [ ] Hover screenshot visually differs from default screenshot.
- [ ] Re-run with no source change → "vs prior run: 0 new, 0 resolved" in console.
- [ ] Add a deliberately bad contrast button, re-run → at least 1 new issue.
- [ ] `--force` wipes and starts over.
- [ ] Ctrl-C during Phase 3, then `--resume` continues without re-capturing completed pages.
- [ ] `--budget=0.01` aborts in Phase 1 before any capture.
- [ ] Critical issue case: exit code 1. Incomplete page case: exit code 2. Clean case: exit code 0.
```

- [ ] **Step 2: Commit**

```bash
git add tests/visual-qa/manual-checklist.md
git commit -m "test(visual-qa): manual E2E checklist"
```

---

## Task 20: Integrate with harness-init via `--visual-qa` flag

**Files:**
- Modify: `plugins/harness-builder/skills/agent-init/SKILL.md` (add flag)
- Modify: `plugins/harness-builder/skills/agent-init/phases/5-wire.md` (handle flag — seed `.visual-qa.json`)
- Modify: `plugins/harness-builder/skills/agent-init/templates/CLAUDE.md.hbs` (optional mention)

- [ ] **Step 1: Add the flag to harness-init SKILL.md**

In `plugins/harness-builder/skills/agent-init/SKILL.md`, under `## Flags`, append:

```
- `--visual-qa` — also scaffold `.visual-qa.json` (requires `harness-floor` plugin enabled).
```

- [ ] **Step 2: Update phases/5-wire.md to handle --visual-qa**

Add a new numbered step before "Single git commit" in `plugins/harness-builder/skills/agent-init/phases/5-wire.md`:

```markdown
4b. If `--visual-qa` was passed:
    - Verify `harness-floor` plugin enabled. If not: print install command, continue (degraded — config won't be runnable yet).
    - Render `plugins/harness-floor/skills/visual-qa/templates/visual-qa.config.json.hbs` with `{baseUrl: "http://localhost:3000", model: "claude-sonnet-4-6"}` (or model from discovery if specified).
    - Write the rendered JSON to `.visual-qa.json` at project root.
    - Append `.visual-qa-state.json` to `.gitignore` (idempotent — same pattern as `.agent-init-state.json`).
```

Renumber subsequent steps accordingly. Update §6 step text to mention `.visual-qa.json` in the success summary.

- [ ] **Step 3: Run full test suite to confirm nothing regressed**

Run:
```bash
node --test tests/lib/*.test.mjs tests/visual-qa/lib/*.test.mjs tests/visual-qa/templates/*.test.mjs tests/visual-qa/scenarios/*.test.mjs
```
Expected: all tests pass (existing 79 from Theme A + new visual-qa tests). SKILL.md and phase doc changes don't touch any `.hbs` template, so existing snapshots remain valid.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(harness-init): --visual-qa flag seeds .visual-qa.json during bootstrap"
```

---

## Task 21: Final verify — full test run, lint, manifests, tag

- [ ] **Step 1: Run all tests**

Run:
```bash
node --test "tests/lib/*.test.mjs" "tests/visual-qa/lib/*.test.mjs" "tests/visual-qa/templates/*.test.mjs" "tests/visual-qa/scenarios/*.test.mjs"
```
Expected: all pass. Note the count.

- [ ] **Step 2: Lint every .mjs file**

Run:
```bash
find . -name "*.mjs" -not -path "./node_modules/*" -not -path "./.git/*" | while read f; do node --check "$f" || echo "FAIL: $f"; done
```
Expected: no `FAIL:` lines.

- [ ] **Step 3: Validate manifests**

Run:
```bash
node -e "JSON.parse(require('node:fs').readFileSync('.claude-plugin/marketplace.json','utf-8'));JSON.parse(require('node:fs').readFileSync('plugins/harness-builder/plugin.json','utf-8'));JSON.parse(require('node:fs').readFileSync('plugins/harness-floor/plugin.json','utf-8'));console.log('manifests ok')"
```
Expected: `manifests ok`.

- [ ] **Step 4: Confirm clean tree**

Run: `git status --porcelain`
Expected: empty output.

- [ ] **Step 5: Tag**

Run: `git tag harness-floor-v0.1.0-rc1`

- [ ] **Step 6: Verify tag**

Run: `git tag --list 'harness-*'`
Expected: lists both `harness-builder-v0.1.0-rc1` (from Theme A) and `harness-floor-v0.1.0-rc1`.

---

## Coverage Self-Check

| Spec section | Task(s) |
|--------------|---------|
| §1 Purpose | Tasks 7, 8, 9, 11, 12–17 (skill + phases produce the pipeline) |
| §2 Non-Goals | Task 11 SKILL.md rules; Task 18 covers no real LLM/browser |
| §3 Inputs/Outputs (flags) | Task 11 lists flags; Tasks 12–17 honour them |
| §4.1 Repo Layout | Tasks 1, 2 (migration + scaffold) |
| §4.2 Plugin manifests | Tasks 1, 2 |
| §4.3 Phase Pipeline | Tasks 12–17 |
| §4.4 State shape | Task 11 SKILL.md `## Rules` documents shape; Tasks 12–17 maintain it |
| §4.5 Config schema | Task 3 (loader validation), Task 7 (template) |
| §5.1 Phase 0 | Task 12 |
| §5.2 Phase 1 | Task 13 |
| §5.3 Phase 2 | Task 14 |
| §5.4 Phase 3 | Task 15 |
| §5.5 Phase 4 | Task 16 |
| §5.6 Per-image LLM analysis | Tasks 8 (prompt template), 15 (in-prompt instruction), 18 (mock test) |
| §5.7 Phase 5 | Task 17 |
| §6 Error handling | Tasks 11–17 (each phase doc has error rules), Task 3 (config schema errors) |
| §7.1 Lib tests | Tasks 3, 4, 5, 6 |
| §7.2 Template snapshots | Task 10 |
| §7.3 Scenario tests | Task 18 |
| §7.4 Manual checklist | Task 19 |
| §8 Migration impact | Task 1 |
| §9 Future work | Out of scope (explicit) |
| harness-init `--visual-qa` integration | Task 20 |
