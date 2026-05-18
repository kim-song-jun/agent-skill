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

## Comprehensive-mode addendum

When `state.mode === "comprehensive"` AND the page subagent's
`config.comprehensive.interactions.click === true`, the subagent also
invokes the shallow-click expander after capturing all declared states:

```javascript
import { shallowClick } from "./lib/shallow-clicker.mjs";

const result = await shallowClick({
  pagePath: page.path,
  clickables: components.filter((c) => ["button", "link", "tab", "menuitem", "switch", "labelled"].includes(c.kind)),
  hooks: {
    click:      ({selector}) => mcp__plugin_playwright_playwright__browser_click({selector}),
    waitStable: ({timeoutMs}) => mcp__plugin_playwright_playwright__browser_wait_for({timeoutMs}),
    screenshot: ({selector, suffix}) => mcp__plugin_playwright_playwright__browser_take_screenshot({path: `${outputDir}/${suffix}.png`}),
    revert:     ({pagePath}) => mcp__plugin_playwright_playwright__browser_navigate({url: `${baseUrl}${pagePath}`}),
  },
});
```

Each `result.captures[i].path` is analysed by the same LLM prompt as
declared-mode captures. Errors don't abort — they're surfaced in the
per-page error list returned to the orchestrator.

Input-kind elements (`input`, `textarea`, `select`) are skipped by
default — clicking them rarely changes UI state and form-fill flows
belong in `declared` mode with explicit flows.

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
