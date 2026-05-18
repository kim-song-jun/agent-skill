> 🇰🇷 한국어: [2026-05-17-visual-qa-design.ko.md](2026-05-17-visual-qa-design.ko.md)

# Visual-QA Skill — Design Spec (Theme C, sub-spec C-1)

**Status:** Approved (brainstorming complete, awaiting plan)
**Date:** 2026-05-17
**Author:** kimsongjun (sungjun@molcube.com)
**Theme:** C of 3 (cost-unrestricted patterns). Sub-spec C-1 of 3 within C.

**Note (2026-05-18):** `/harness-init` was renamed to `/agent-init` in harness-builder v0.2.0. References below to the old name reflect the original design and remain accurate for that timeframe. Treat `harness-init` and `agent-init` as the same skill in current code.

---

## 1. Purpose

Provide a Claude Code skill — `/visual-qa` — that, when invoked in a project with a `.visual-qa.json` config, drives Playwright MCP to capture a matrix of screenshots (pages × components × interactive states × breakpoints + scripted flows), runs LLM analysis on each image, diffs against the previous run, and writes a markdown + JSON report to `docs/visual-qa/<date-slug>/`.

The skill packages as a sibling plugin `harness-floor` in the same marketplace as `harness-builder`. `/agent-init --visual-qa` (a flag added to the existing Theme A skill) installs a starter `.visual-qa.json` into a project.

Cost-unrestricted by design: every screenshot triggers a fresh LLM analysis on every run. Diff happens at the report level (issue keys), not at the pixel level.

## 2. Non-Goals

- Not a pixel-diff visual regression library — every image goes through LLM analysis.
- Not a Playwright-config replacement — `.visual-qa.json` only describes the capture matrix; underlying Playwright tuning stays in the project.
- Not a CI runner — manual `/visual-qa` invocation only. CI integration is out of scope for C-1.
- Not a unified launcher with Theme C's other sub-specs (agent-all/ralph-loop wrapping) — those land separately in C-2 and C-3.

## 3. Inputs / Outputs

**Inputs (implicit):** target project working directory, `.visual-qa.json` at project root, running dev server at `baseUrl`, available Playwright MCP, available LLM (default `claude-sonnet-4-6`).

**Inputs (explicit flags):**
- `--resume` — skip phases already complete per `.visual-qa-state.json`.
- `--force` — wipe today's slug directory and re-run from scratch.
- `--yes` — skip the Phase 1 "X captures, est. cost $Y, proceed?" confirmation.
- `--budget=<USD>` — abort mid-run if accumulated estimated cost exceeds this.
- `--skip-health` — skip Phase 0 baseUrl health check.
- `--slug=<custom>` — override the auto-generated date slug for the output dir.

**Outputs (per run):**

```
<project>/
├── .visual-qa.json                                  # config (user-edited or seeded)
├── .visual-qa-state.json                            # phase progress (gitignored)
└── docs/visual-qa/
    └── 2026-05-17-<slug>/
        ├── report.md                                # human-readable summary
        ├── report.json                              # structured (for diff next run)
        ├── home/
        │   ├── mobile/
        │   │   ├── _page.png
        │   │   ├── _page.analysis.json
        │   │   ├── _page.analysis.md
        │   │   ├── hero-cta__default.png
        │   │   ├── hero-cta__default.analysis.json
        │   │   ├── hero-cta__default.analysis.md
        │   │   ├── hero-cta__hover.png
        │   │   ├── hero-cta__hover.analysis.json
        │   │   └── hero-cta__hover.analysis.md
        │   ├── tablet/
        │   └── desktop/
        ├── settings/
        └── flows/
            └── signup-happy-path/
                ├── 00-signup-empty.png
                ├── 00-signup-empty.analysis.{json,md}
                ├── 01-signup-success.png
                └── 01-signup-success.analysis.{json,md}
```

## 4. Architecture

### 4.1 Repo Layout Change

The current single-plugin layout (Theme A) moves to a multi-plugin layout to fit `harness-floor` cleanly:

```
agent-skill/
├── .claude-plugin/
│   ├── marketplace.json            # now lists 2 plugins
│   └── plugin.json                 # REMOVED — moves into plugins/harness-builder/
├── plugins/
│   ├── harness-builder/            # was at repo root in Theme A
│   │   ├── plugin.json
│   │   └── skills/agent-init/
│   │       └── ... (unchanged)
│   └── harness-floor/              # NEW (Theme C)
│       ├── plugin.json
│       └── skills/visual-qa/
│           ├── SKILL.md
│           ├── phases/
│           │   ├── 0-preflight.md
│           │   ├── 1-config.md
│           │   ├── 2-discover.md
│           │   ├── 3-capture.md
│           │   ├── 4-aggregate.md
│           │   └── 5-summary.md
│           ├── lib/
│           │   ├── config-loader.mjs
│           │   ├── matrix-builder.mjs
│           │   ├── diff-runs.mjs
│           │   └── cost-estimator.mjs
│           └── templates/
│               ├── visual-qa.config.json.hbs
│               ├── analysis-prompt.md.hbs
│               └── report.md.hbs
├── hooks/                          # unchanged (global cache-heal)
├── docs/
│   ├── superpowers/
│   │   ├── specs/
│   │   └── plans/
│   └── visual-qa/                  # outputs only when this repo itself is harnessed
└── tests/
    ├── lib/                        # harness-builder lib tests (existing)
    └── visual-qa/                  # NEW — visual-qa tests
        ├── lib/
        ├── templates/
        ├── scenarios/
        └── fixtures/
```

The repo-layout move is bundled into this spec because dropping `harness-floor` without it produces an inconsistent layout (one plugin at root, one in `plugins/`). The move is mechanical (git mv) and preserves history.

### 4.2 Updated Plugin Manifests

`.claude-plugin/marketplace.json`:

```json
{
  "name": "agent-skill",
  "description": "Harness builder + visual-QA + (future) optimisation skills for Claude Code",
  "plugins": [
    { "name": "harness-builder", "source": "./plugins/harness-builder", "description": "Bootstrap CLAUDE.md, .claude/agents/, hooks, and plugin wiring with /agent-init" },
    { "name": "harness-floor",   "source": "./plugins/harness-floor",   "description": "Cost-unrestricted patterns starting with /visual-qa (visual regression + LLM analysis via Playwright MCP)" }
  ]
}
```

`plugins/harness-floor/plugin.json`:

```json
{
  "name": "harness-floor",
  "version": "0.1.0",
  "description": "Visual QA skill with Playwright MCP capture and LLM per-image analysis",
  "skills": ["skills/visual-qa"]
}
```

No new hooks at the plugin level. The skill itself is the only entry.

### 4.3 Phase Pipeline

`/visual-qa` runs 6 phases strictly in order. Each phase records completion in `.visual-qa-state.json` (same shape pattern as Theme A's `.agent-init-state.json`).

| Phase | Name | Parallel? |
|-------|------|-----------|
| 0 | Preflight (config check, Playwright MCP check, health check) | No |
| 1 | Config + Matrix build + cost confirmation | No |
| 2 | Prior-run discovery + slug dir creation | No |
| 3 | Capture + Analyze (page-level fan-out via `superpowers:dispatching-parallel-agents`) | **Yes** |
| 4 | Aggregate + Diff + Report | No |
| 5 | Console summary + exit code | No |

### 4.4 `.visual-qa-state.json` shape

```json
{
  "phases": [
    { "phase": 0, "completedAt": "2026-05-17T..." },
    { "phase": 1, "completedAt": "..." }
  ],
  "slug": "2026-05-17-abc1234",
  "matrix": { "totalCaptures": 247, "byPage": { "home": 60, "settings": 30 } },
  "estCostUSD": 4.20,
  "perPageStatus": {
    "home": { "phase3": "completed", "captures": 60, "errors": 0 },
    "settings": { "phase3": "running" }
  }
}
```

### 4.5 `.visual-qa.json` Schema

See §3 of the brainstorming notes; reproduced here for completeness. Required top-level keys: `baseUrl`, `breakpoints`, `pages`. Optional: `auth`, `flows`, `analysis`, `output`.

```json
{
  "baseUrl": "http://localhost:3000",
  "auth": {
    "type": "none|cookie|bearer|form",
    "cookieFile": ".visual-qa-auth.json",
    "loginFlow": [
      { "goto": "/login" },
      { "fill": "[name=email]", "value": "${env:VQA_EMAIL}" },
      { "fill": "[name=password]", "value": "${env:VQA_PASSWORD}" },
      { "click": "button[type=submit]" },
      { "waitFor": "[data-testid=dashboard]" }
    ]
  },
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
        { "name": "header",   "selector": "[data-testid=header]" },
        { "name": "hero-cta", "selector": "[data-testid=hero] button", "states": ["hover", "focus"] }
      ]
    }
  ],
  "flows": [
    {
      "name": "signup-happy-path",
      "steps": [
        { "goto": "/signup" },
        { "screenshot": "signup-empty" },
        { "fill": "[name=email]", "value": "test@example.com" },
        { "click": "button[type=submit]" },
        { "waitFor": "[data-testid=signup-success]" },
        { "screenshot": "signup-success" }
      ]
    }
  ],
  "analysis": {
    "model": "claude-sonnet-4-6",
    "categories": ["accessibility", "alignment", "color-contrast", "copy-quality", "responsive-fit"],
    "severityThreshold": "minor"
  },
  "output": {
    "dir": "docs/visual-qa",
    "keepLastN": 10
  }
}
```

State semantics:
- A component with no `states` field is captured in its default state (1 screenshot per breakpoint).
- A component with `states: ["hover", "focus"]` produces 1 + 2 = 3 screenshots per breakpoint.
- `requiresAuth: true` on a page triggers `auth.loginFlow` at the START of that page-subagent's run (each subagent has its own browser tab; sharing HttpOnly cookies across subagents is brittle, so we re-login per page-subagent). `auth.cookieFile` is reserved for Phase 0 credential validation only.
- `flows[].steps` is a small DSL: `goto | fill | click | hover | waitFor | screenshot`. The `screenshot` action names a label for the captured image and triggers an analysis.
- `${env:VAR}` placeholders are resolved at config load time; missing env vars abort Phase 1.

## 5. Component Detail

### 5.1 Phase 0 — Preflight

1. Confirm `.visual-qa.json` exists at project root. If absent: print `/agent-init --visual-qa` suggestion, abort.
2. Confirm Playwright MCP tools are available (`mcp__plugin_playwright_playwright__browser_navigate` is callable). If not: print MCP install instructions, abort.
3. Probe `baseUrl` with a `GET /` (timeout 5s). If non-200 and `--skip-health` not set: ask user "dev server down, continue anyway?" and wait for confirmation (or abort if `--yes` was passed in non-interactive mode).
4. Read `.visual-qa-state.json` if present. If `--resume` and `max(state.phases[*].phase) >= 0`, skip Phase 0 proper.

### 5.2 Phase 1 — Config + Matrix

1. `lib/config-loader.mjs#loadConfig(path)` reads, parses, validates the JSON, resolves `${env:...}`. Returns either `{ok: true, config}` or `{ok: false, errors: [{path, message}]}`. On error: print errors, abort.
2. `lib/matrix-builder.mjs#buildMatrix(config)` returns a flat list:
   ```javascript
   [
     { kind: "page",      page: "home", bp: "mobile" },
     { kind: "component", page: "home", bp: "mobile", component: "hero-cta", state: "default" },
     { kind: "component", page: "home", bp: "mobile", component: "hero-cta", state: "hover" },
     { kind: "flow_step", flow: "signup-happy-path", stepIndex: 0, label: "signup-empty" }
   ]
   ```
3. `lib/cost-estimator.mjs#estimate(matrix, modelPrice)` returns rough USD cost (matrix length × per-image cost factor).
4. Print:
   ```
   Matrix: 247 captures across 3 pages, 2 flows.
   Estimated LLM cost: ~$4.20 (claude-sonnet-4-6)
   Proceed? [Y/n]
   ```
5. If `--yes` skip the confirm. If captures > 500 and `--force` not set, require explicit confirm even with `--yes`.
6. Push `{phase: 1, completedAt}` to state.

### 5.3 Phase 2 — Prior-run discovery + slug dir

1. List subdirectories of `<output.dir>/`. Find the most recent one with a complete `report.json` (oldest format: ordered by ISO date prefix in dir name).
2. Stash that JSON in memory as `priorRun` (or `null` if first run).
3. If `keepLastN` is set and total subdirectories ≥ `keepLastN`, delete the oldest excess directories (rm -rf).
4. Compute today's slug: `YYYY-MM-DD-<7-char-random>`. Override with `--slug=<custom>` if provided.
5. Create `<output.dir>/<slug>/`. If it already exists and not `--resume`/`--force`: abort with "slug already exists". If `--force`: rm -rf first.
6. Push `{phase: 2, completedAt}`.

### 5.4 Phase 3 — Capture + Analyze (parallel)

Pre-fan-out: invoke `Skill` with `superpowers:dispatching-parallel-agents`.

Group matrix items by page. For each page:

Dispatch one subagent with these inputs:
```javascript
{
  page,                  // page config object
  baseUrl,
  breakpoints,           // full breakpoint list
  authState,             // path to cookie file, or null
  analysisConfig,        // { model, categories, severityThreshold }
  outputDir              // <slug-dir>/<page-name>/
}
```

Each page-subagent then performs sequentially:
1. If `page.requiresAuth`: run the `auth.loginFlow` step DSL (same DSL as flows in §5.4 step 4) to establish a session in this subagent's tab. Then continue.
2. `browser_navigate` to `baseUrl + page.path`.
3. For each breakpoint:
   a. `browser_resize(width, height)`
   b. Full-page screenshot → `<outputDir>/<bp>/_page.png`. Run LLM analysis immediately (see §5.6). Write `.analysis.{json,md}` next to image.
   c. For each component:
      - Default state: `browser_take_screenshot` with selector → `<outputDir>/<bp>/<component>__default.png`. Analyze.
      - For each declared state in `component.states`:
        - Apply state: `hover` → `browser_hover`; `focus` → `browser_evaluate('el.focus()')`; `active` → `browser_evaluate('el.classList.add("active")')` (or `:active` is hard to capture without input event — see §6 caveat); `disabled` → `browser_evaluate('el.setAttribute("disabled", "")')`.
        - Screenshot → `<outputDir>/<bp>/<component>__<state>.png`. Analyze.

4. Flow handling (separate pass after page+breakpoint loop): for each flow whose `steps[0].goto` falls under this page, run the step DSL:
   - `goto x` → `browser_navigate(baseUrl + x)`
   - `fill sel val` → `browser_type(sel, val)`
   - `click sel` → `browser_click(sel)`
   - `hover sel` → `browser_hover(sel)`
   - `waitFor sel` → `browser_wait_for(sel)`
   - `screenshot label` → full-page screenshot to `<outputDir>/../flows/<flow.name>/<NN-label>.png` + analyze

5. Return `{page: "home", captures: 60, errors: 0, paths: [...]}`.

A page-subagent abort (timeout, auth expiry, 3+ analysis failures) marks that page incomplete and returns `{page, captures: N, errors: [...], status: "incomplete"}`. The orchestrator continues with other pages.

### 5.5 Phase 4 — Aggregate + Diff + Report

1. Read all `.analysis.json` files under `<slug-dir>/` (skip any missing or marked `error`).
2. Flatten into `runIssues: [{page, component, state, bp, severity, category, description, suggestion, imagePath}]`.
3. Compute issue key: `${page}/${component}/${state}/${bp}/${category}/${sha1(description).slice(0,8)}`. Stable enough to recognize "same issue" across runs.
4. `lib/diff-runs.mjs#diff(runIssues, priorRun?.issues)` returns `{new: [...], resolved: [...], unchanged: [...]}`.
5. Write `report.json`: `{slug, timestamp, matrix, issues: runIssues, diff, perPageStatus, estCostUSD, actualCostUSD}`.
6. Render `templates/report.md.hbs` with the above context. Write `report.md` at slug dir root.
7. Push `{phase: 4, completedAt}`.

### 5.6 Per-image LLM analysis

The page-subagent IS an LLM agent (dispatched via the Agent tool with `model = analysis.model`). For each capture, it:

1. Reads the just-written `.png` via the `Read` tool (Claude Code reads PNG as multimodal vision input).
2. Composes its analysis as part of its own model output, following the format dictated by `templates/analysis-prompt.md.hbs` which is included in its dispatch prompt.
3. The model output MUST be a fenced ```json block (validating against the schema below) followed by a markdown paragraph explaining the findings — nothing else.
4. The page-subagent extracts the json block, writes it to `.analysis.json`; writes the trailing paragraph to `.analysis.md`. If the json block is malformed or schema-invalid, the page-subagent retries the analysis once (re-Reads the image, re-emits) with a stricter prefix. If still malformed: write `{error: "analysis_malformed", raw: "..."}` to `.analysis.json` and continue.

There is no external Claude API call from a JS module — the subagent's own LLM does the work. The `analysis.model` config field is passed to the Agent tool's `model` parameter when dispatching the page-subagent.

JSON shape per capture:
```json
{
  "issues": [
    { "severity": "critical|major|minor", "category": "accessibility|...", "description": "...", "suggestion": "..." }
  ],
  "summary": "one-line"
}
```

The markdown that follows the JSON block goes into the `.analysis.md` file alongside; the JSON goes into `.analysis.json`.

### 5.7 Phase 5 — Summary

Print 3-5 lines to console, set exit code:
```
Visual QA complete: 247 captures, 12 issues (3 critical, 5 major, 4 minor)
vs prior run: +2 new, -7 resolved, 5 unchanged
Report: docs/visual-qa/2026-05-17-abc1234/report.md
```

Exit code:
- 0 if no critical issues
- 1 if any critical issue
- 2 if Phase 3 had partial failures (some page incomplete)

## 6. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `.visual-qa.json` missing | Phase 0 abort + suggest `/agent-init --visual-qa` |
| Playwright MCP not available | Phase 0 abort + suggest `/plugin install playwright@claude-plugins-official` |
| `baseUrl` not responding | Phase 0 ask user to continue (or abort if non-interactive) |
| Config schema invalid | Phase 1 abort with `field: message` list |
| Missing `${env:VAR}` | Phase 1 abort naming the variable |
| Matrix > 500 captures | Phase 1 require explicit `--yes` even when `--force` is set |
| `--budget` exceeded mid-run | Phase 3 abort gracefully, save partial report |
| Single LLM call malformed | Retry once, then mark capture `error`, continue |
| 3+ analysis errors in one page | Page-subagent BLOCKED, orchestrator continues other pages, Phase 5 exit code 2 |
| Auth flow fails (login page redirect mid-run) | Page-subagent BLOCKED, asks user to refresh `auth.cookieFile` |
| Selector not found at runtime | Skip that capture, accumulate to "Missing selectors" section in report |
| `:active` pseudo-class unreachable via JS class toggle | Document limitation in `analysis-prompt.md.hbs` so the model knows; capture what we can |
| Same slug dir exists | Abort unless `--resume` or `--force` |
| Disk fills mid-capture | Abort, leave partial state in place for `--resume` |

## 7. Testing Strategy

### 7.1 Lib unit tests (`tests/visual-qa/lib/`)

| Module | Test |
|--------|------|
| `config-loader.mjs` | 5 valid + 5 invalid fixture configs; assert `{ok, errors}` correctness. `${env:...}` resolved when present, errors when missing. |
| `matrix-builder.mjs` | Small config (1 page, 1 component, 2 breakpoints, 1 state) → expected 4-entry matrix (1 page + 2 component states × 2 bp). Plus 1 flow → expected flow steps appended. |
| `diff-runs.mjs` | (prior, current) fixture pairs covering: first run (prior null), no changes, new issue, resolved issue, modified issue (same key, different description). Assert `{new, resolved, unchanged}` arrays. |
| `cost-estimator.mjs` | Matrix sizes × model price table → expected USD. Edge cases: empty matrix → $0. |

### 7.2 Template snapshot tests (`tests/visual-qa/templates/`)

Render `visual-qa.config.json.hbs`, `analysis-prompt.md.hbs`, `report.md.hbs` against 3 fixture contexts → snapshot.

### 7.3 Scenario integration tests (`tests/visual-qa/scenarios/`)

Mock Playwright MCP and LLM. The page-subagent module exports a `runPage({page, mockBrowser, mockAnalyzer, outputDir})` function. Tests drive 5 scenarios:
1. First run (no prior) — assert report shape, all issues marked "new".
2. Re-run no changes — assert all issues marked "unchanged".
3. New issue — one mock analysis result has an extra issue.
4. Resolved issue — one mock analysis result drops an issue.
5. Partial failure — 1 of 3 pages throws after 2 captures; assert orchestrator continues other pages and report marks page incomplete.

### 7.4 Manual E2E checklist (`tests/visual-qa/manual-checklist.md`)

Run against a fake next.js fixture project with dev server up. Tick:
- [ ] `/visual-qa` with no `.visual-qa.json` → abort + suggestion.
- [ ] Config seeded by `/agent-init --visual-qa` is valid.
- [ ] First run produces full slug dir + report.md + per-image .png/.json/.md.
- [ ] Hover state actually captures a hover (compare to default state visually).
- [ ] Auth flow works: protected page captures land.
- [ ] `--resume` after Ctrl-C continues from last completed phase.
- [ ] `--force` wipes and starts over.
- [ ] `--budget=0.01` aborts in Phase 1.
- [ ] Exit code 1 when any critical issue.
- [ ] Re-run with no source change → "vs prior run: 0 new, 0 resolved".

### 7.5 Out of scope

- Live Playwright runs in CI (manual checklist covers).
- Real LLM calls in unit tests (use mock analyzer).
- Verifying Playwright MCP's own correctness.

## 8. Migration impact on Theme A

Theme A's `skills/agent-init/...` moves to `plugins/harness-builder/skills/agent-init/...`. Specifically:
- `git mv skills/agent-init plugins/harness-builder/skills/agent-init`
- `git mv` the root `hooks/` to `plugins/harness-builder/hooks/` (was referenced by the old root `plugin.json` via `${CLAUDE_PLUGIN_ROOT}/hooks/...`)
- `mv .claude-plugin/plugin.json plugins/harness-builder/plugin.json`
- Update `.claude-plugin/marketplace.json` to add `source: "./plugins/harness-builder"` for the existing plugin and `source: "./plugins/harness-floor"` for the new one
- Tests under `tests/lib/` keep working — they import via relative paths from `tests/lib/*.test.mjs` to `../../skills/agent-init/lib/*.mjs`, which become `../../plugins/harness-builder/skills/agent-init/lib/*.mjs`. Update the import paths.
- Snapshot paths under `tests/lib/__snapshots__/` already use slash-replaced names like `agents_planner.md.hbs__ts-small.snap` — those stay valid since they're keyed by relative-template-path. The TEMPLATES_DIR constant in `tests/lib/render.test.mjs` changes.

The migration is mechanical and lands in C-1 because waiting until C-2 would mean shipping `harness-floor` in a layout that doesn't match its sibling.

## 9. Examples

### First run: baseline establishment

```
cd my-next-app
npm run dev                  # localhost:3000
/visual-qa
```

Creates `docs/visual-qa/2026-05-18-abc1234/`:
- `report.md` showing all 247 captures across 3 pages
- Per-image `.png`, `.analysis.json`, `.analysis.md` files
- Diff section empty (no prior run to compare)
- Exit code 0 (no critical issues on first baseline)

### Re-run after introducing a visual bug

```
# Introduce bug: change hero button color
git commit -am "style: change hero button to red"

/visual-qa
```

Output `docs/visual-qa/2026-05-18-xyz9876/`:
- Same 247 captures
- Diff at top: `+3 new issues (2 critical color-contrast, 1 major alignment)`
- Report marks the hero button component with new issues
- Exit code 1 (critical issue detected)

### Auth flow example

```
# .visual-qa.json configured with:
"auth": {
  "type": "form",
  "loginFlow": [
    { "goto": "/login" },
    { "fill": "[name=email]", "value": "${env:VQA_EMAIL}" },
    { "fill": "[name=password]", "value": "${env:VQA_PASSWORD}" },
    { "click": "button[type=submit]" },
    { "waitFor": "[data-testid=dashboard]" }
  ]
},
"pages": [
  { "name": "dashboard", "path": "/dashboard", "requiresAuth": true }
]

VQA_EMAIL=test@example.com VQA_PASSWORD=pass123 /visual-qa
```

Phase 3 logs:
```
  Dashboard page requires auth
  Running login flow...
  Captured dashboard at mobile (after login)
  Captured dashboard at tablet (after login)
  Captured dashboard at desktop (after login)
```

## 10. Future work (out of scope for this spec)

- **C-2 (agent-all pipeline)**: a sibling skill in `harness-floor` that wraps the user's existing `agent-all` workflow with `superpowers:subagent-driven-development`.
- **C-3 (ralph-loop pattern + harness-init integration)**: surface `/agent-init --theme=floor` to bundle agent-all + visual-qa + ralph-loop into a single setup.
- **CI integration**: separate plugin or skill that wires `/visual-qa` into GitHub Actions with PR comment outputs.
- **Baseline mode**: option for pixel-diff first, LLM only when threshold exceeded (would belong to Theme B, the cost-optimisation theme).
