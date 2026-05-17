# /agent-all Implementation Plan (Theme C-2 + C-3 combined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/agent-all` skill in `plugins/harness-floor/` (7-phase pipeline wrapping superpowers brainstorming/writing-plans/subagent-driven-development with optional `--loop`). Add `--theme=floor` flag to `/harness-init` that bundles `.visual-qa.json` + `.agent-all.json` + CLAUDE.md Floor section.

**Architecture:** Sequential phases 0–6, phase 3 delegates fan-out to `superpowers:subagent-driven-development`. Lib modules are pure JS (TDD). Phase prompts are markdown docs the main agent reads on demand. `--theme=floor` is a small addition to harness-init's phase 5-wire.

**Tech Stack:** Node 18+ native test runner, ES modules, zero npm deps. Reuses `plugins/harness-builder/skills/harness-init/lib/render.mjs` for templates.

**Spec:** `docs/superpowers/specs/2026-05-17-agent-all-design.md`

---

## File Structure (after all tasks)

```
plugins/
├── harness-builder/
│   └── skills/harness-init/
│       ├── SKILL.md                          # MODIFIED — add --theme=floor flag
│       ├── phases/5-wire.md                  # MODIFIED — add step 4c
│       └── templates/CLAUDE.md.hbs           # MODIFIED — add Floor section
└── harness-floor/
    ├── plugin.json                           # MODIFIED — bump 0.2.0, add agent-all skill
    └── skills/
        ├── visual-qa/                        # unchanged (C-1)
        └── agent-all/                        # NEW
            ├── SKILL.md
            ├── phases/{0-preflight..6-loop}.md
            ├── lib/{config-loader,wave-builder,loop-evaluator}.mjs
            ├── templates/{agent-all.config.json.hbs, pr-body.md.hbs}
            └── references/legacy-notes.md

tests/
├── lib/render.test.mjs                       # MODIFIED — floorTheme fixture
└── agent-all/                                # NEW
    ├── lib/{config-loader,wave-builder,loop-evaluator}.test.mjs
    ├── templates/snapshot.test.mjs
    ├── scenarios/wave-dispatch.test.mjs
    ├── fixtures/{configs,plans,runs}/
    └── manual-checklist.md
```

---

## Task 1: Bump harness-floor plugin manifest

**Files:**
- Modify: `plugins/harness-floor/plugin.json`

- [ ] **Step 1: Read current `plugins/harness-floor/plugin.json`**

It currently has:
```json
{
  "name": "harness-floor",
  "version": "0.1.0",
  "description": "Visual QA skill with Playwright MCP capture and LLM per-image analysis",
  "skills": ["skills/visual-qa"]
}
```

- [ ] **Step 2: Update to v0.2.0 + add agent-all skill**

Replace with:
```json
{
  "name": "harness-floor",
  "version": "0.2.0",
  "description": "Visual QA + agent-all pipeline (cost-unrestricted patterns)",
  "skills": ["skills/visual-qa", "skills/agent-all"]
}
```

- [ ] **Step 3: Validate JSON**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('plugins/harness-floor/plugin.json','utf-8'));console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add plugins/harness-floor/plugin.json
git commit -m "feat(harness-floor): bump to 0.2.0, register agent-all skill"
```

---

## Task 2: `lib/config-loader.mjs` — TDD

**Files:**
- Create: `tests/agent-all/fixtures/configs/minimal.json`
- Create: `tests/agent-all/fixtures/configs/full.json`
- Create: `tests/agent-all/fixtures/configs/invalid-type.json`
- Create: `tests/agent-all/lib/config-loader.test.mjs`
- Create: `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`

- [ ] **Step 1: Write fixtures**

`tests/agent-all/fixtures/configs/minimal.json`:
```json
{
  "defaults": { "maxIter": 1, "maxCostUSD": 50, "waveSize": "medium", "brainstormFirst": true, "createPR": true }
}
```

`tests/agent-all/fixtures/configs/full.json`:
```json
{
  "defaults": { "maxIter": 3, "maxCostUSD": 100, "waveSize": "large", "brainstormFirst": false, "createPR": true },
  "waves": {
    "small":  { "maxParallel": 2,  "rolesAllowed": ["dev", "reviewer"] },
    "medium": { "maxParallel": 4,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "reviewer"] },
    "large":  { "maxParallel": 8,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "qa-auth", "reviewer", "doc-writer"] }
  },
  "loop": { "breakCondition": "npm test", "stableIters": 2 },
  "gates": { "specReview": true, "qualityReview": true, "blockOnCritical": true },
  "pr": { "branchPrefix": "feat/agent-all/", "baseBranch": "main" }
}
```

`tests/agent-all/fixtures/configs/invalid-type.json`:
```json
{
  "defaults": { "maxIter": "not-a-number" }
}
```

- [ ] **Step 2: Write `tests/agent-all/lib/config-loader.test.mjs`**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig, DEFAULTS } from "../../../plugins/harness-floor/skills/agent-all/lib/config-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => resolve(here, "..", "fixtures", "configs", name);

test("loads minimal config — fills in built-in defaults for missing sections", () => {
  const result = loadConfig(fx("minimal.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.defaults.maxIter, 1);
  assert.deepEqual(Object.keys(result.config.waves).sort(), ["large", "medium", "small"]);
  assert.equal(result.config.loop.stableIters, DEFAULTS.loop.stableIters);
});

test("loads full config without modification", () => {
  const result = loadConfig(fx("full.json"));
  assert.equal(result.ok, true);
  assert.equal(result.config.defaults.maxIter, 3);
  assert.equal(result.config.loop.stableIters, 2);
});

test("missing config file → returns built-in defaults with warning flag", () => {
  const result = loadConfig(fx("__nonexistent__.json"));
  assert.equal(result.ok, true);
  assert.equal(result.warning, true);
  assert.deepEqual(result.config, DEFAULTS);
});

test("invalid type → returns error", () => {
  const result = loadConfig(fx("invalid-type.json"));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(e => /maxIter/.test(e.path) && /number/i.test(e.message)));
});
```

- [ ] **Step 3: Run — FAIL (module not found)**

Run: `node --test tests/agent-all/lib/config-loader.test.mjs`

- [ ] **Step 4: Write `plugins/harness-floor/skills/agent-all/lib/config-loader.mjs`**

```javascript
import { readFileSync, existsSync } from "node:fs";

export const DEFAULTS = {
  defaults: { maxIter: 1, maxCostUSD: 50, waveSize: "medium", brainstormFirst: true, createPR: true },
  waves: {
    small:  { maxParallel: 2, rolesAllowed: ["dev", "reviewer"] },
    medium: { maxParallel: 4, rolesAllowed: ["frontend-dev", "backend-dev", "designer", "reviewer"] },
    large:  { maxParallel: 8, rolesAllowed: ["frontend-dev", "backend-dev", "designer", "qa-*", "reviewer", "doc-writer"] },
  },
  loop: { breakCondition: "npm test", stableIters: 1 },
  gates: { specReview: true, qualityReview: true, blockOnCritical: true },
  pr: { branchPrefix: "feat/agent-all/", baseBranch: "main" },
};

function validate(cfg) {
  const errors = [];
  if (cfg.defaults?.maxIter !== undefined && typeof cfg.defaults.maxIter !== "number") {
    errors.push({ path: "defaults.maxIter", message: "must be number" });
  }
  if (cfg.defaults?.maxCostUSD !== undefined && typeof cfg.defaults.maxCostUSD !== "number") {
    errors.push({ path: "defaults.maxCostUSD", message: "must be number" });
  }
  if (cfg.defaults?.waveSize !== undefined && !["small", "medium", "large"].includes(cfg.defaults.waveSize)) {
    errors.push({ path: "defaults.waveSize", message: "must be small|medium|large" });
  }
  return errors;
}

function deepMerge(base, override) {
  if (override == null) return base;
  if (typeof base !== "object" || typeof override !== "object" || Array.isArray(base) || Array.isArray(override)) return override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = deepMerge(base[k], v);
  }
  return out;
}

export function loadConfig(path) {
  if (!existsSync(path)) {
    return { ok: true, config: DEFAULTS, warning: true };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return { ok: false, errors: [{ path, message: `invalid JSON: ${e.message}` }] };
  }
  const errors = validate(raw);
  if (errors.length) return { ok: false, errors };
  return { ok: true, config: deepMerge(DEFAULTS, raw) };
}
```

- [ ] **Step 5: Run — 4/4 pass**

- [ ] **Step 6: Commit**

```bash
git add tests/agent-all/fixtures/configs tests/agent-all/lib/config-loader.test.mjs plugins/harness-floor/skills/agent-all/lib/config-loader.mjs
git commit -m "feat(agent-all): config-loader with deep-merge defaults (TDD)"
```

---

## Task 3: `lib/wave-builder.mjs` — TDD

**Files:**
- Create: `tests/agent-all/lib/wave-builder.test.mjs`
- Create: `plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs`

- [ ] **Step 1: Write tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWaves } from "../../../plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs";

const waveConfig = { maxParallel: 2, rolesAllowed: ["dev", "reviewer"] };

test("single task → 1 wave with 1 task", () => {
  const tasks = [{ id: 1, files: ["a.ts"] }];
  const waves = buildWaves(tasks, waveConfig);
  assert.equal(waves.length, 1);
  assert.equal(waves[0].length, 1);
});

test("4 independent tasks, maxParallel=2 → 2 waves of 2", () => {
  const tasks = [
    { id: 1, files: ["a.ts"] },
    { id: 2, files: ["b.ts"] },
    { id: 3, files: ["c.ts"] },
    { id: 4, files: ["d.ts"] },
  ];
  const waves = buildWaves(tasks, waveConfig);
  assert.equal(waves.length, 2);
  assert.equal(waves[0].length, 2);
  assert.equal(waves[1].length, 2);
});

test("tasks sharing a file are serialized into separate waves", () => {
  const tasks = [
    { id: 1, files: ["shared.ts"] },
    { id: 2, files: ["shared.ts", "b.ts"] },
    { id: 3, files: ["c.ts"] },
  ];
  const waves = buildWaves(tasks, waveConfig);
  // Task 1 and 2 cannot be in same wave. Task 3 independent.
  const wave1Ids = new Set(waves[0].map(t => t.id));
  const wave2Ids = new Set(waves[1].map(t => t.id));
  // 1 must be alone with possibly 3; 2 must be in a later wave
  assert.ok(wave1Ids.has(1));
  assert.ok(wave2Ids.has(2));
});

test("empty plan → empty waves array", () => {
  const waves = buildWaves([], waveConfig);
  assert.deepEqual(waves, []);
});

test("rolesAllowed: tasks tagged with a role not in rolesAllowed are dropped (with side-channel log)", () => {
  const tasks = [
    { id: 1, files: ["a.ts"], role: "dev" },
    { id: 2, files: ["b.ts"], role: "frontend-dev" },
  ];
  const result = buildWaves(tasks, waveConfig);
  // Only dev allowed; frontend-dev dropped
  const allIds = result.flat().map(t => t.id);
  assert.deepEqual(allIds, [1]);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write impl**

```javascript
function filesOverlap(a, b) {
  const setA = new Set(a);
  return b.some(f => setA.has(f));
}

function roleAllowed(taskRole, allowed) {
  if (!taskRole) return true;
  return allowed.some(pattern => {
    if (pattern.endsWith("*")) return taskRole.startsWith(pattern.slice(0, -1));
    return pattern === taskRole;
  });
}

export function buildWaves(tasks, waveConfig) {
  const filtered = tasks.filter(t => roleAllowed(t.role, waveConfig.rolesAllowed));
  const waves = [];
  for (const task of filtered) {
    let placed = false;
    for (const wave of waves) {
      const conflict = wave.some(other => filesOverlap(task.files, other.files));
      if (!conflict && wave.length < waveConfig.maxParallel) {
        wave.push(task);
        placed = true;
        break;
      }
    }
    if (!placed) waves.push([task]);
  }
  return waves;
}
```

- [ ] **Step 4: Run — 5/5 pass**

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/lib/wave-builder.test.mjs plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs
git commit -m "feat(agent-all): wave-builder packs tasks into parallel waves (TDD)"
```

---

## Task 4: `lib/loop-evaluator.mjs` — TDD

**Files:**
- Create: `tests/agent-all/lib/loop-evaluator.test.mjs`
- Create: `plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs`

- [ ] **Step 1: Write tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLoop } from "../../../plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs";

function mockRunner(exitSequence) {
  let i = 0;
  return () => ({ exitCode: exitSequence[i++] });
}

test("breakCondition exits 0 once, stableIters=1 → break after 1 pass", () => {
  const state = { iter: 0, consecutivePass: 0, costUSD: 0 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "break");
});

test("breakCondition exits non-0 → continue", () => {
  const state = { iter: 0, consecutivePass: 0, costUSD: 0 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "continue");
  assert.equal(verdict.consecutivePass, 0);
});

test("stableIters=2 requires 2 consecutive passes", () => {
  let state = { iter: 0, consecutivePass: 0, costUSD: 0 };
  let verdict = evaluateLoop(state, { stableIters: 2, maxIter: 5, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "continue");
  assert.equal(verdict.consecutivePass, 1);

  state = { ...state, consecutivePass: 1, iter: 1 };
  verdict = evaluateLoop(state, { stableIters: 2, maxIter: 5, maxCostUSD: 100 }, mockRunner([0]));
  assert.equal(verdict.action, "break");
});

test("maxIter exhausted → exhausted action with exit code 3", () => {
  const state = { iter: 5, consecutivePass: 0, costUSD: 0 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "exhausted");
  assert.equal(verdict.exitCode, 3);
});

test("maxCostUSD exceeded → exhausted with exit code 3", () => {
  const state = { iter: 1, consecutivePass: 0, costUSD: 101 };
  const verdict = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, mockRunner([1]));
  assert.equal(verdict.action, "exhausted");
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Write impl**

```javascript
export function evaluateLoop(state, limits, runner) {
  if (state.iter >= limits.maxIter || state.costUSD > limits.maxCostUSD) {
    return { action: "exhausted", exitCode: 3 };
  }
  const { exitCode } = runner();
  if (exitCode === 0) {
    const consecutivePass = state.consecutivePass + 1;
    if (consecutivePass >= limits.stableIters) {
      return { action: "break", consecutivePass, exitCode: 0 };
    }
    return { action: "continue", consecutivePass };
  }
  return { action: "continue", consecutivePass: 0 };
}
```

- [ ] **Step 4: Run — 5/5 pass**

- [ ] **Step 5: Commit**

```bash
git add tests/agent-all/lib/loop-evaluator.test.mjs plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs
git commit -m "feat(agent-all): loop-evaluator with breakCondition + stableIters + maxIter/Cost guards (TDD)"
```

---

## Task 5: Template `agent-all.config.json.hbs`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs`

- [ ] **Step 1: Write template**

```handlebars
{
  "defaults": {
    "maxIter": {{maxIter}},
    "maxCostUSD": {{maxCostUSD}},
    "waveSize": "{{waveSize}}",
    "brainstormFirst": true,
    "createPR": true
  },
  "waves": {
    "small":  { "maxParallel": 2,  "rolesAllowed": ["dev", "reviewer"] },
    "medium": { "maxParallel": 4,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "reviewer"] },
    "large":  { "maxParallel": 8,  "rolesAllowed": ["frontend-dev", "backend-dev", "designer", "qa-*", "reviewer", "doc-writer"] }
  },
  "loop": {
    "breakCondition": "{{breakCondition}}",
    "stableIters": 1
  },
  "gates": {
    "specReview": true,
    "qualityReview": true,
    "blockOnCritical": true
  },
  "pr": {
    "branchPrefix": "feat/agent-all/",
    "baseBranch": "main"
  }
}
```

- [ ] **Step 2: Render-test**

```bash
node -e "import('./plugins/harness-builder/skills/harness-init/lib/render.mjs').then(m=>{const out=m.render(require('node:fs').readFileSync('plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs','utf-8'),{maxIter:3,maxCostUSD:75,waveSize:'medium',breakCondition:'npm test'});JSON.parse(out);console.log('valid json')})"
```
Expected: `valid json`.

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs
git commit -m "feat(agent-all): agent-all.config.json.hbs starter template"
```

---

## Task 6: Template `pr-body.md.hbs`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/templates/pr-body.md.hbs`

- [ ] **Step 1: Write template**

```handlebars
## Summary

Generated by `/agent-all` from task: [{{task.title}}]({{task.path}})

Plan: [{{plan.path}}]({{plan.path}})

## Waves

{{#each waves}}### Wave {{@index}} — {{this.status}}

Tasks:
{{#each this.tasks}}- {{this.id}}: {{this.title}}
{{/each}}

{{/each}}

## Verification

- [{{#if breakConditionPassed}}x{{/if}}] Break condition `{{loop.breakCondition}}` passed
- [{{#if testsPass}}x{{/if}}] All wave tests pass
- [{{#if reviewClean}}x{{/if}}] Reviewer found no critical issues

## Iteration

Iter {{iter}} of {{maxIter}} max. Cost ${{costUSD}} of ${{maxCostUSD}} budget.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 2: Render-test**

```bash
node -e "import('./plugins/harness-builder/skills/harness-init/lib/render.mjs').then(m=>console.log(m.render(require('node:fs').readFileSync('plugins/harness-floor/skills/agent-all/templates/pr-body.md.hbs','utf-8'),{task:{title:'X',path:'docs/tasks/1-x.md'},plan:{path:'docs/superpowers/plans/p.md'},waves:[{status:'completed',tasks:[{id:1,title:'A'}]}],loop:{breakCondition:'npm test'},breakConditionPassed:true,testsPass:true,reviewClean:true,iter:1,maxIter:3,costUSD:'2.40',maxCostUSD:50})))"
```
Verify output contains `Wave 0 — completed` and `[x] Break condition` (with checkbox marked).

- [ ] **Step 3: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/templates/pr-body.md.hbs
git commit -m "feat(agent-all): pr-body.md.hbs template"
```

---

## Task 7: Snapshot tests for both templates

**Files:**
- Create: `tests/agent-all/templates/snapshot.test.mjs`
- Create: `tests/agent-all/templates/__snapshots__/` (auto-populated)

- [ ] **Step 1: Write test file**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { render } from "../../../plugins/harness-builder/skills/harness-init/lib/render.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function snapshot(name, actual) {
  const snapPath = resolve(here, "__snapshots__", `${name}.snap`);
  mkdirSync(dirname(snapPath), { recursive: true });
  if (!existsSync(snapPath) || process.env.UPDATE_SNAPSHOTS === "1") {
    writeFileSync(snapPath, actual);
    return;
  }
  const expected = readFileSync(snapPath, "utf-8");
  assert.equal(actual, expected, `Snapshot mismatch for ${name}.`);
}

const TEMPLATES_DIR = resolve(here, "..", "..", "..", "plugins", "harness-floor", "skills", "agent-all", "templates");

const CONFIG_FIXTURES = [
  { tag: "minimal", ctx: { maxIter: 1, maxCostUSD: 50, waveSize: "medium", breakCondition: "npm test" } },
  { tag: "loop-large", ctx: { maxIter: 10, maxCostUSD: 200, waveSize: "large", breakCondition: "pytest && npm test" } },
  { tag: "small-tight", ctx: { maxIter: 1, maxCostUSD: 5, waveSize: "small", breakCondition: "make verify" } },
];

const PR_FIXTURES = [
  { tag: "single-wave-pass", ctx: { task: { title: "Fix login", path: "docs/tasks/12-fix-login.md" }, plan: { path: "docs/superpowers/plans/2026-05-17-fix-login.md" }, waves: [{ status: "completed", tasks: [{ id: 1, title: "Failing test" }, { id: 2, title: "Fix" }] }], loop: { breakCondition: "npm test" }, breakConditionPassed: true, testsPass: true, reviewClean: true, iter: 1, maxIter: 1, costUSD: "2.40", maxCostUSD: 50 } },
  { tag: "multi-wave-loop", ctx: { task: { title: "Refactor", path: "docs/tasks/13-refactor.md" }, plan: { path: "docs/superpowers/plans/p.md" }, waves: [{ status: "completed", tasks: [{ id: 1, title: "A" }] }, { status: "completed", tasks: [{ id: 2, title: "B" }] }], loop: { breakCondition: "pytest" }, breakConditionPassed: true, testsPass: true, reviewClean: true, iter: 3, maxIter: 5, costUSD: "12.00", maxCostUSD: 50 } },
  { tag: "incomplete", ctx: { task: { title: "X", path: "docs/tasks/x.md" }, plan: { path: "p.md" }, waves: [{ status: "incomplete", tasks: [{ id: 1, title: "A" }] }], loop: { breakCondition: "true" }, breakConditionPassed: false, testsPass: false, reviewClean: false, iter: 1, maxIter: 1, costUSD: "0.50", maxCostUSD: 50 } },
];

function listTemplates(dir) {
  return readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith(".hbs")).map(e => e.name);
}

for (const tplName of listTemplates(TEMPLATES_DIR)) {
  const tpl = readFileSync(resolve(TEMPLATES_DIR, tplName), "utf-8");
  const fixtures = tplName.startsWith("agent-all.config") ? CONFIG_FIXTURES : PR_FIXTURES;
  for (const fx of fixtures) {
    test(`snapshot: ${tplName} × ${fx.tag}`, () => {
      const out = render(tpl, fx.ctx);
      snapshot(`${tplName}__${fx.tag}`, out);
    });
  }
}
```

- [ ] **Step 2: Generate snapshots**

Run: `UPDATE_SNAPSHOTS=1 node --test tests/agent-all/templates/snapshot.test.mjs`
Expected: 6 tests pass (2 templates × 3 fixtures each). `tests/agent-all/templates/__snapshots__/` populated.

- [ ] **Step 3: Re-run without UPDATE_SNAPSHOTS**

Run: `node --test tests/agent-all/templates/snapshot.test.mjs`
Expected: 6/6 pass.

- [ ] **Step 4: Commit**

```bash
git add tests/agent-all/templates
git commit -m "test(agent-all): snapshot 2 templates × 3 fixtures"
```

---

## Task 8: `skills/agent-all/SKILL.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/SKILL.md`

- [ ] **Step 1: Write the thin orchestrator**

```markdown
---
name: agent-all
description: Cost-unrestricted multi-agent pipeline. Drives intent→plan→wave-dispatch→gate→PR over the .claude/agents/ roster, with optional --loop until a shell break-condition succeeds (bounded by --max-iter and --max-cost). Requires /harness-init scaffolding.
---

# /agent-all

Runs a complete multi-agent pipeline from a free-form prompt or an existing task file. Phase 3 fan-out delegates to `superpowers:subagent-driven-development`. Phase 6 optionally loops the entire run.

## Usage

```
/agent-all "add user signup form"
/agent-all docs/tasks/12-fix-login.md
/agent-all "fix flaky test" --loop --max-iter=5
/agent-all docs/tasks/x.md --no-pr --wave-size=large
```

## Flags

- `--loop` — enable Phase 6 looping.
- `--max-iter=<N>` — cap loop iterations (default from config, hard cap 50).
- `--max-cost=<USD>` — cap accumulated cost.
- `--wave-size=small|medium|large` — override config default.
- `--no-pr` — skip Phase 5 (PR creation).
- `--no-brainstorm` — skip Phase 1's brainstorming for free-form prompts.
- `--resume` — skip phases already complete per `.agent-all-state.json`.
- `--force` — wipe state and restart.
- `--yes` — skip interactive confirms.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | git+roster+config+input checks |
| 1 | `phases/1-intent.md` | brainstorming OR load task file |
| 2 | `phases/2-plan.md` | writing-plans for the task |
| 3 | `phases/3-dispatch.md` | wave-builder + subagent-driven-development |
| 4 | `phases/4-gate.md` | wave-level spec+quality reviews |
| 5 | `phases/5-pr.md` | branch push + gh pr create |
| 6 | `phases/6-loop.md` | breakCondition + stableIters + maxIter/Cost |

## Rules

1. **You orchestrate; phases are source of truth.** Read each phase file before running it.
2. **State lives in `.agent-all-state.json`.** Shape: `{phases:[{phase,completedAt}], task, plan, waves[], iter, costUSD, prUrl}`. `--resume` resumes after `max(phases[*].phase)`.
3. **Delegate, don't reimplement.** Phase 1 calls `superpowers:brainstorming`; Phase 2 calls `superpowers:writing-plans`; Phase 3 calls `superpowers:subagent-driven-development`. Your code is a thin coordinator.
4. **Loop is opt-in.** Without `--loop`, Phase 6 is a no-op.
5. **Hard caps:** `--max-iter` clamped to 50 server-side; `--max-cost` enforced after each wave.

## Lib modules

- `lib/config-loader.mjs` — `loadConfig(path)` → `{ok, config | errors, warning?}`. Returns built-in `DEFAULTS` when path missing.
- `lib/wave-builder.mjs` — `buildWaves(tasks, waveConfig)` → array of waves.
- `lib/loop-evaluator.mjs` — `evaluateLoop(state, limits, runner)` → `{action: "break"|"continue"|"exhausted", consecutivePass?, exitCode?}`.

## On error

- Dirty git tree → abort.
- `.claude/agents/` missing → abort + suggest `/harness-init`.
- `.agent-all.json` missing → warn + use built-ins.
- writing-plans fails → abort.
- Wave task BLOCKED 3× → Phase 3 abort with exit code 2.
- `--max-cost` exceeded → finish current wave, abort, preserve state.
- Loop maxIter exhausted → exit code 3, last commit preserved.

## When done

Print summary: phases completed, iters, cost, PR URL. Exit code 0/1/2/3 per spec.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/SKILL.md
git commit -m "feat(agent-all): SKILL.md thin orchestrator"
```

---

## Task 9: `phases/0-preflight.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/0-preflight.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo: `git rev-parse --git-dir` exit 0. If not: abort `Not in a git repo. Run git init first.`

2. Confirm working tree clean: `git status --porcelain` empty. If not: abort `Stash or commit local changes first; agent-all needs a clean tree.`

3. Confirm `.claude/agents/` exists and contains at minimum `planner.md`, `dev.md`, `reviewer.md`. If not: abort `Run /harness-init first to scaffold .claude/agents/.`

4. Load `.agent-all.json`:
   ```javascript
   import { loadConfig } from "./lib/config-loader.mjs";
   const { ok, config, warning, errors } = loadConfig(".agent-all.json");
   if (!ok) { /* print errors as 'field: message', abort */ }
   if (warning) { /* print: ".agent-all.json not found; using built-ins. Run /harness-init --theme=floor to seed." */ }
   ```

5. Read `.agent-all-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 0`, skip rest of Phase 0.

6. Validate positional argument:
   - If ends with `.md`: must exist as a file. If not: abort `task file not found: <path>`. Stash as `taskPath`.
   - Otherwise: must be non-empty string. Stash as `prompt`. If empty: abort `provide a prompt or task path`.

7. Push `{phase: 0, completedAt: "<iso>"}` to state. Use atomic write (temp + rename). Create `.agent-all-state.json` with `{"phases": []}` if missing.

## Output to user

Print: `Preflight OK. <input mode: prompt|task>.`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/0-preflight.md
git commit -m "feat(agent-all): 0-preflight phase doc"
```

---

## Task 10: `phases/1-intent.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/1-intent.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 1 — Intent

## Inputs (from state)

- `taskPath` (if Phase 0 set it) OR `prompt`
- `config.defaults.brainstormFirst`
- CLI: `--no-brainstorm`
- `state.iter` (for loop iterations)

## Branches

### Branch A — taskPath exists OR state.iter > 0

Skip brainstorming entirely. Use the existing `docs/tasks/<N>-<slug>.md` file as the task. Stash `task` in state with `{path, title}` (title from first `#` heading of the file).

### Branch B — prompt + (--no-brainstorm OR config.defaults.brainstormFirst === false)

Write the prompt verbatim to a new task file:
1. `nextN = scanDir("docs/tasks/").map(parseLeadingInt).max() + 1` (default 1 if empty).
2. `slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)`.
3. Write file `docs/tasks/<nextN>-<slug>.md` with content:
   ```
   # <slug rendered as Title Case>

   <prompt>
   ```
4. Stash `task = {path, title}` in state.

### Branch C — prompt + brainstormFirst true (default)

1. Invoke `Skill` with `superpowers:brainstorming` passing the prompt as `args`. Brainstorming will write its own design doc to `docs/superpowers/specs/`.
2. After it completes, locate the newest file under `docs/superpowers/specs/` (sort by mtime).
3. Copy or symlink that file's content to `docs/tasks/<nextN>-<slug>.md` (title from spec's first `#`).
4. Stash `task` in state.

## All branches

Push `{phase: 1, completedAt}` to `phases`.

## Output to user

Print: `Task ready: <task.path> ("<task.title>")`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/1-intent.md
git commit -m "feat(agent-all): 1-intent phase doc"
```

---

## Task 11: `phases/2-plan.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/2-plan.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 2 — Plan

## Inputs (from state)

- `task.path`

## Steps

1. Invoke `Skill` with `superpowers:writing-plans` passing `task.path` as `args`.

2. writing-plans saves its output to `docs/superpowers/plans/<date>-<slug>.md`. Capture that path. If writing-plans returns without a written file, abort with `writing-plans produced no plan file`.

3. Stash `plan = {path, title}` in state (title from first `#` of the plan file).

4. Push `{phase: 2, completedAt}` to `phases`.

## Output to user

Print: `Plan written: <plan.path>`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/2-plan.md
git commit -m "feat(agent-all): 2-plan phase doc"
```

---

## Task 12: `phases/3-dispatch.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/3-dispatch.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`

## Steps

1. Parse the plan file. Extract task list using:
   ```javascript
   const text = readFileSync(plan.path, "utf-8");
   const headings = [...text.matchAll(/^### Task (\d+):\s*(.+)$/gm)];
   const tasks = headings.map((m, i) => {
     const next = headings[i + 1]?.index ?? text.length;
     const section = text.slice(m.index, next);
     const files = [...section.matchAll(/^- (?:Create|Modify):\s*`([^`]+)`/gm)].map(x => x[1]);
     const role = (/role:\s*(\w[\w-]*)/i.exec(section) ?? [])[1] ?? "dev";
     return { id: parseInt(m[1], 10), title: m[2].trim(), files, role };
   });
   ```

2. Build waves: `const waves = buildWaves(tasks, config.waves[waveSize])` from `lib/wave-builder.mjs`.

3. For each wave:
   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   b. Invoke `Skill` with `superpowers:subagent-driven-development` passing a synthesized mini-plan containing just this wave's tasks (rendered as `### Task N: <title>` headings with the same file/code blocks from the original plan section).
   c. subagent-driven-development handles its own implementer + spec-reviewer + quality-reviewer cycle per task in the wave.
   d. Capture wave result: `{index: i, tasks: [{id, status, commits}], status: "completed"|"incomplete"}`.

4. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If a wave's subagent-driven-development reports BLOCKED for >1 task: mark wave `incomplete`. Phase 4 will decide whether to retry or abort.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output to user

Print one line per wave: `Wave <i>: <completed>/<total> tasks succeeded`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/3-dispatch.md
git commit -m "feat(agent-all): 3-dispatch phase doc"
```

---

## Task 13: `phases/4-gate.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/4-gate.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 4 — Gate

## Inputs (from state)

- `state.waves[]`
- `config.gates.{specReview, qualityReview, blockOnCritical}`

## Skip conditions

If `gates.specReview === false` AND `gates.qualityReview === false`: skip Phase 4 entirely (subagent-driven-development already did per-task reviews). Push `{phase: 4, completedAt}` and exit phase.

## Steps

For each wave with `status === "completed"` (skip already-incomplete waves):

1. Compute the wave's diff:
   ```bash
   git diff <wave.startCommit>..<wave.endCommit>
   ```
   (Start/end commits are first and last from `wave.tasks[].commits`.)

2. If `gates.specReview`:
   - Dispatch a spec-reviewer subagent. Prompt includes: the plan section for this wave, the diff, and a request to flag any spec deviations.

3. If `gates.qualityReview`:
   - Dispatch a code-quality reviewer subagent over the diff.

4. Collect verdicts. Bucket issues by severity (`critical | major | minor`).

5. If any critical issue AND `blockOnCritical === true`:
   - Dispatch an implementer subagent with the critical issues. Re-run reviewers afterward.
   - Up to 3 retry cycles. If still failing: abort phase, push `{phase: 4, status: "blocked"}` to state, exit code 2.

6. Record wave gate verdict in `state.waves[i].gateVerdict = {issues, retries, finalStatus}`.

7. Push `{phase: 4, completedAt}` to `phases` once all waves processed.

## Output to user

Print one line per wave: `Wave <i> gate: <issuesCount> issues (<critical>c <major>m <minor>n), <retries> retries`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/4-gate.md
git commit -m "feat(agent-all): 4-gate phase doc"
```

---

## Task 14: `phases/5-pr.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/5-pr.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 5 — PR

## Inputs (from state)

- `task.path`, `task.title`
- `plan.path`
- `state.waves[]`
- `config.pr.{branchPrefix, baseBranch}`
- `config.defaults.createPR`
- CLI `--no-pr`

## Skip conditions

If `--no-pr` OR `config.defaults.createPR === false`: skip Phase 5. Push `{phase: 5, status: "skipped"}` and exit phase.

## Steps

1. Compute slug from task path: `slug = basename(task.path).replace(/^\d+-/, "").replace(/\.md$/, "")`.

2. Branch name: `branch = config.pr.branchPrefix + slug`.

3. Create or switch to branch:
   ```bash
   git rev-parse --verify <branch> 2>/dev/null && git checkout <branch> || git checkout -b <branch>
   ```

4. Push branch:
   ```bash
   git push -u origin <branch>
   ```
   If push fails (network, auth): warn and skip the next step; phase still pushes `{phase: 5, status: "pushed-locally"}`.

5. Compute PR body context:
   ```javascript
   const ctx = {
     task, plan,
     waves: state.waves.map(w => ({ status: w.status, tasks: w.tasks })),
     loop: { breakCondition: config.loop.breakCondition },
     breakConditionPassed: state.lastBreakConditionExit === 0,
     testsPass: state.waves.every(w => w.status === "completed"),
     reviewClean: state.waves.every(w => !w.gateVerdict?.issues?.some(i => i.severity === "critical")),
     iter: state.iter, maxIter: config.defaults.maxIter,
     costUSD: state.costUSD?.toFixed(2) ?? "0.00", maxCostUSD: config.defaults.maxCostUSD,
   };
   ```

6. Render `templates/pr-body.md.hbs` with `ctx` using `plugins/harness-builder/skills/harness-init/lib/render.mjs`.

7. Create PR:
   ```bash
   gh pr create --base <config.pr.baseBranch> --title "<task.title>" --body "$(rendered)"
   ```
   Capture URL. If `gh` not installed / unauth: warn `gh missing — PR not created`, stash `prUrl: null`, continue.

8. Stash `prUrl` in state. Push `{phase: 5, completedAt}` to `phases`.

## Output to user

Print: `PR: <prUrl or '(skipped|pushed-locally|gh-missing)'>`.
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/5-pr.md
git commit -m "feat(agent-all): 5-pr phase doc"
```

---

## Task 15: `phases/6-loop.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/phases/6-loop.md`

- [ ] **Step 1: Write phase prompt**

```markdown
# Phase 6 — Loop

## Inputs (from state + CLI)

- `--loop` flag (boolean)
- `config.loop.{breakCondition, stableIters}`
- CLI `--max-iter`, `--max-cost` (override config defaults)
- `state.iter`, `state.consecutivePass`, `state.costUSD`

## Skip condition

If `--loop` not set: push `{phase: 6, status: "skipped"}` to `phases`, exit normally (exit code 0 if no critical issues, 1 if any).

## Steps

1. Run breakCondition via shell:
   ```javascript
   import { evaluateLoop } from "./lib/loop-evaluator.mjs";
   const runner = () => {
     const result = spawnSync("sh", ["-c", config.loop.breakCondition], { stdio: "pipe" });
     return { exitCode: result.status ?? 1 };
   };
   const verdict = evaluateLoop(
     { iter: state.iter, consecutivePass: state.consecutivePass ?? 0, costUSD: state.costUSD ?? 0 },
     { stableIters: config.loop.stableIters, maxIter: Math.min(50, cliMaxIter ?? config.defaults.maxIter), maxCostUSD: cliMaxCost ?? config.defaults.maxCostUSD },
     runner,
   );
   ```

2. Stash `state.lastBreakConditionExit = verdict.exitCode ?? 1`. Update `state.consecutivePass = verdict.consecutivePass ?? state.consecutivePass`.

3. Branch on `verdict.action`:
   - `break`: push `{phase: 6, completedAt, status: "broken"}` to `phases`, exit 0.
   - `continue`: increment `state.iter`. Reset `state.phases` to drop entries with phase >= 1 (so re-entry skips Phase 0 only). Re-invoke from Phase 1 — but in loop mode, Phase 1 always uses `state.task` (no re-brainstorm).
   - `exhausted`: push `{phase: 6, completedAt, status: "exhausted"}`, exit 3.

## Output to user

Per iter, print: `Iter <N>/<max>: break check exit=<code>, consecutive=<N>/<stableIters>`.
On final exit: `Loop <broken|exhausted> after <N> iter(s). Cost ~$<costUSD>.`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/phases/6-loop.md
git commit -m "feat(agent-all): 6-loop phase doc"
```

---

## Task 16: `references/legacy-notes.md`

**Files:**
- Create: `plugins/harness-floor/skills/agent-all/references/legacy-notes.md`

- [ ] **Step 1: Write the provenance doc**

```markdown
# Legacy Notes

This skill is a superpowers-based reimplementation of the original user skill `agent-all` (preserved at `plugins/harness-builder/skills/harness-init/references/legacy-notes.md` for Theme A).

## What changed from the original

- **Brainstorming required** — original optionally brainstormed; this version always brainstorms free-form prompts (unless `--no-brainstorm`).
- **superpowers delegation** — phases 2-4 are thin wrappers around `superpowers:writing-plans`, `superpowers:subagent-driven-development`. Original embedded planner/builder/gate logic inline.
- **Loop is opt-in** — original wave dispatch did not loop; the original Ralph-style loop pattern is now `--loop` here (no separate `/ralph` skill).
- **Config file** — `.agent-all.json` is new; the original took everything via CLI args.

## What was preserved

- Wave dispatch model (size → maxParallel → rolesAllowed)
- Task numbering scheme (`docs/tasks/<N>-<slug>.md`)
- `--resume` semantics via on-disk state
- PR creation via `gh pr create`
```

- [ ] **Step 2: Commit**

```bash
git add plugins/harness-floor/skills/agent-all/references/legacy-notes.md
git commit -m "docs(agent-all): legacy-notes captures provenance"
```

---

## Task 17: Scenario integration tests

**Files:**
- Create: `tests/agent-all/scenarios/wave-dispatch.test.mjs`
- Create: `tests/agent-all/fixtures/plans/simple-plan.md`

- [ ] **Step 1: Write fixture plan**

`tests/agent-all/fixtures/plans/simple-plan.md`:
```markdown
# Test Plan

### Task 1: Create file A

- Create: `src/a.ts`

Some content.

### Task 2: Create file B

- Create: `src/b.ts`

Some content.

### Task 3: Modify file A

- Modify: `src/a.ts`

Some content.
```

- [ ] **Step 2: Write scenario tests**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildWaves } from "../../../plugins/harness-floor/skills/agent-all/lib/wave-builder.mjs";
import { evaluateLoop } from "../../../plugins/harness-floor/skills/agent-all/lib/loop-evaluator.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parsePlan(path) {
  const text = readFileSync(path, "utf-8");
  const headings = [...text.matchAll(/^### Task (\d+):\s*(.+)$/gm)];
  return headings.map((m, i) => {
    const next = headings[i + 1]?.index ?? text.length;
    const section = text.slice(m.index, next);
    const files = [...section.matchAll(/^- (?:Create|Modify):\s*`([^`]+)`/gm)].map(x => x[1]);
    return { id: parseInt(m[1], 10), title: m[2].trim(), files, role: "dev" };
  });
}

test("single wave success: 3-task plan with file dep → 2 waves", () => {
  const tasks = parsePlan(resolve(here, "..", "fixtures", "plans", "simple-plan.md"));
  // Task 1 (a.ts) and Task 2 (b.ts) parallel; Task 3 (a.ts) must serialize after Task 1
  const waves = buildWaves(tasks, { maxParallel: 4, rolesAllowed: ["dev", "reviewer"] });
  assert.equal(waves.length, 2);
  assert.ok(waves[0].some(t => t.id === 1));
  assert.ok(waves[0].some(t => t.id === 2));
  assert.ok(waves[1].some(t => t.id === 3));
});

test("multi-wave partial fail: wave-builder is deterministic regardless of failures (failures handled at gate)", () => {
  const tasks = parsePlan(resolve(here, "..", "fixtures", "plans", "simple-plan.md"));
  const waves = buildWaves(tasks, { maxParallel: 4, rolesAllowed: ["dev", "reviewer"] });
  // The wave-builder doesn't see runtime status; this test just verifies determinism.
  const wavesAgain = buildWaves(tasks, { maxParallel: 4, rolesAllowed: ["dev", "reviewer"] });
  assert.deepEqual(waves, wavesAgain);
});

test("--loop 3 iterations: breakCondition fails twice then passes", () => {
  let runs = 0;
  const exits = [1, 1, 0];
  const runner = () => ({ exitCode: exits[runs++] });
  let state = { iter: 0, consecutivePass: 0, costUSD: 0 };

  let v = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "continue");
  state = { ...state, iter: 1, consecutivePass: 0 };

  v = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "continue");
  state = { ...state, iter: 2, consecutivePass: 0 };

  v = evaluateLoop(state, { stableIters: 1, maxIter: 5, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "break");
});

test("--max-iter=2 exhausted: 2 failing iters then 3rd evaluation says exhausted", () => {
  const runner = () => ({ exitCode: 1 });
  let state = { iter: 2, consecutivePass: 0, costUSD: 0 };
  const v = evaluateLoop(state, { stableIters: 1, maxIter: 2, maxCostUSD: 100 }, runner);
  assert.equal(v.action, "exhausted");
  assert.equal(v.exitCode, 3);
});
```

- [ ] **Step 3: Run — 4/4 pass**

Run: `node --test tests/agent-all/scenarios/wave-dispatch.test.mjs`

- [ ] **Step 4: Commit**

```bash
git add tests/agent-all/scenarios tests/agent-all/fixtures/plans
git commit -m "test(agent-all): scenario integration tests for wave-dispatch + loop"
```

---

## Task 18: Manual E2E checklist

**Files:**
- Create: `tests/agent-all/manual-checklist.md`

- [ ] **Step 1: Write checklist**

```markdown
# /agent-all — Manual E2E Checklist

Run before each `harness-floor` release with /agent-all changes. Requires:
- A small fixture project with `.claude/agents/` already scaffolded (via `/harness-init`).
- `gh` installed and authenticated for PR test.
- Working git repo.

## Setup

\`\`\`bash
mkdir /tmp/agent-all-fixture && cd /tmp/agent-all-fixture
git init
/harness-init --size=small
/harness-init --theme=floor   # seeds .visual-qa.json + .agent-all.json
\`\`\`

## Checks

- [ ] `/agent-all` with empty `.claude/agents/` aborts and suggests `/harness-init`.
- [ ] Dirty git tree aborts.
- [ ] `/agent-all "tiny prompt"` with brainstorming enabled runs brainstorming → plan → 1-wave dispatch → PR.
- [ ] `/agent-all "tiny prompt" --no-brainstorm` skips brainstorming, writes task verbatim.
- [ ] `/agent-all docs/tasks/X-foo.md` (existing task) skips Phase 1 brainstorming entirely.
- [ ] Ctrl-C mid-Phase-3 then `--resume` continues without re-running completed waves.
- [ ] `--no-pr` produces commits + branch but no PR.
- [ ] `/agent-all "x" --loop` with deliberately failing breakCondition exhausts maxIter (exit code 3).
- [ ] `/agent-all "x" --loop` with passing breakCondition exits after 1 iter (exit code 0).
- [ ] `--max-cost=0.01` aborts in middle of Phase 3.
- [ ] `--theme=floor` from `/harness-init` produces both `.visual-qa.json` and `.agent-all.json` and adds "Floor Theme" section to CLAUDE.md.
- [ ] `.agent-all-state.json` is in `.gitignore`.
```

Note: replace the bash fences with actual triple backticks when writing the file.

- [ ] **Step 2: Commit**

```bash
git add tests/agent-all/manual-checklist.md
git commit -m "test(agent-all): manual E2E checklist"
```

---

## Task 19: `/harness-init --theme=floor` integration (C-3)

**Files:**
- Modify: `plugins/harness-builder/skills/harness-init/SKILL.md`
- Modify: `plugins/harness-builder/skills/harness-init/phases/5-wire.md`
- Modify: `plugins/harness-builder/skills/harness-init/templates/CLAUDE.md.hbs`

- [ ] **Step 1: Add `--theme=floor` flag to SKILL.md**

Read `plugins/harness-builder/skills/harness-init/SKILL.md`. Find the `## Flags` section. Append after the `--visual-qa` line (added in VQ20):

```
- `--theme=floor` — bundle harness-floor configs (.visual-qa.json + .agent-all.json + CLAUDE.md Floor section). Implicit `--visual-qa`.
```

- [ ] **Step 2: Add step 4c to phases/5-wire.md**

Read `plugins/harness-builder/skills/harness-init/phases/5-wire.md`. Find step `4b` (the `--visual-qa` handler). Insert after it (before step 5):

```markdown
4c. If `--theme=floor` was passed:
    - Implicitly set `--visual-qa = true` (so step 4b also runs).
    - Verify `harness-floor` plugin enabled. If not: print install command, continue.
    - Render `plugins/harness-floor/skills/agent-all/templates/agent-all.config.json.hbs` with `{maxIter: 1, maxCostUSD: 50, waveSize: <size from Phase 1>, breakCondition: "npm test"}` and write to `.agent-all.json` at project root.
    - Append `.agent-all-state.json` to `.gitignore` (idempotent — same pattern as `.harness-state.json` and `.visual-qa-state.json`).
    - Set Phase 2 context flag `floorTheme: true` (used by `templates/CLAUDE.md.hbs` for the conditional section).
```

- [ ] **Step 3: Add Floor section to CLAUDE.md.hbs**

Read `plugins/harness-builder/skills/harness-init/templates/CLAUDE.md.hbs`. Append at the end (after the existing `{{#if constraints}}` block):

```handlebars
{{#if floorTheme}}
## Floor Theme

Cost-unrestricted parallel pattern enabled. Commands:

- `/visual-qa` — visual regression with LLM analysis (see `.visual-qa.json`)
- `/agent-all "task description"` — multi-wave pipeline (see `.agent-all.json`)
- `/agent-all <task-path> --loop` — iterate until the break-condition succeeds

Read `plugins/harness-floor/skills/{visual-qa,agent-all}/SKILL.md` for full flag references.
{{/if}}
```

- [ ] **Step 4: Regenerate snapshots for CLAUDE.md.hbs**

The template changed, so existing snapshots are stale. Add `floorTheme: false` to existing fixtures, plus 1 new fixture with `floorTheme: true`.

Modify `tests/lib/render.test.mjs`:
- For each entry in `FIXTURES`, add `floorTheme: false` to the `ctx`.
- Add a new fixture:
  ```javascript
  {
    tag: "floor-theme",
    ctx: {
      purpose: "Floor test app",
      stack: "typescript",
      deploy_targets: "vercel",
      agents: [{name:"planner",when:"plan"},{name:"dev",when:"code"},{name:"reviewer",when:"review"}],
      constraints: "",
      floorTheme: true,
    },
  },
  ```

Then regenerate snapshots:
```bash
UPDATE_SNAPSHOTS=1 node --test tests/lib/render.test.mjs
```

- [ ] **Step 5: Re-run all tests**

Run:
```bash
node --test tests/lib/*.test.mjs tests/visual-qa/lib/*.test.mjs tests/visual-qa/templates/snapshot.test.mjs tests/visual-qa/scenarios/page-subagent.test.mjs tests/agent-all/lib/*.test.mjs tests/agent-all/templates/snapshot.test.mjs tests/agent-all/scenarios/wave-dispatch.test.mjs
```
Expected: all tests pass. Existing snapshot count was 55; with the new fixture added and CLAUDE.md.hbs changed, snapshot count grows to 66 for harness-builder (11 templates × 6 fixtures).

- [ ] **Step 6: Commit**

```bash
git add plugins/harness-builder/skills/harness-init/SKILL.md plugins/harness-builder/skills/harness-init/phases/5-wire.md plugins/harness-builder/skills/harness-init/templates/CLAUDE.md.hbs tests/lib/render.test.mjs tests/lib/__snapshots__
git commit -m "feat(harness-init): --theme=floor flag bundles agent-all config + Floor CLAUDE section"
```

---

## Task 20: Final verify + tag

- [ ] **Step 1: Run all tests**

```bash
node --test "tests/lib/*.test.mjs" "tests/visual-qa/lib/*.test.mjs" "tests/visual-qa/templates/snapshot.test.mjs" "tests/visual-qa/scenarios/page-subagent.test.mjs" "tests/agent-all/lib/*.test.mjs" "tests/agent-all/templates/snapshot.test.mjs" "tests/agent-all/scenarios/wave-dispatch.test.mjs"
```
Expected: all pass. Note count.

- [ ] **Step 2: Lint every .mjs**

```bash
find . -name "*.mjs" -not -path "./node_modules/*" -not -path "./.git/*" -print0 | while IFS= read -r -d '' f; do node --check "$f" || echo "FAIL: $f"; done
```
Expected: no FAIL lines.

- [ ] **Step 3: Validate all manifests**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('.claude-plugin/marketplace.json','utf-8'));JSON.parse(require('node:fs').readFileSync('plugins/harness-builder/plugin.json','utf-8'));JSON.parse(require('node:fs').readFileSync('plugins/harness-floor/plugin.json','utf-8'));console.log('manifests ok')"
```
Expected: `manifests ok`.

- [ ] **Step 4: Clean tree**

`git status --porcelain` → empty.

- [ ] **Step 5: Tag**

```bash
git tag harness-floor-v0.2.0-rc1
```

- [ ] **Step 6: Verify tags**

`git tag --list 'harness-*'` → 3 tags: `harness-builder-v0.1.0-rc1`, `harness-floor-v0.1.0-rc1`, `harness-floor-v0.2.0-rc1`.

---

## Coverage Self-Check

| Spec section | Task(s) |
|--------------|---------|
| §1 Purpose | Tasks 8 (SKILL.md), 9-15 (phase docs) |
| §2 Non-Goals | Task 8 SKILL.md Rules; legacy-notes (Task 16) |
| §3 Inputs/Outputs (flags + state) | Task 8 SKILL.md flags; Tasks 9-15 honour them; Task 9 defines state shape |
| §4.1 Package Layout | Tasks 1 (manifest bump), 2-15 (create files) |
| §4.2 plugin.json bump | Task 1 |
| §4.3 .agent-all.json schema | Task 2 (loader), Task 5 (template), Task 7 (snapshots) |
| §4.4 Phase pipeline | Tasks 9-15 |
| §5.1 Phase 0 | Task 9 |
| §5.2 Phase 1 | Task 10 |
| §5.3 Phase 2 | Task 11 |
| §5.4 Phase 3 | Task 12 |
| §5.5 Phase 4 | Task 13 |
| §5.6 Phase 5 | Task 14 |
| §5.7 Phase 6 | Task 15 |
| §5.8 --theme=floor integration | Task 19 |
| §6 Error handling | Tasks 9-15 (per-phase abort rules), Task 2 (config errors) |
| §7.1 Lib tests | Tasks 2, 3, 4 (4 + 5 + 5 = 14 tests) |
| §7.2 Template snapshots | Task 7 (6 tests) |
| §7.3 Scenario integration | Task 17 (4 tests) |
| §7.4 harness-init integration tests | Task 19 step 4 (CLAUDE.md.hbs floor fixture) |
| §7.5 Manual E2E | Task 18 |
| §8 Migration impact | Task 1 (plugin.json bump) |
| §9 Future work | Out of scope |
