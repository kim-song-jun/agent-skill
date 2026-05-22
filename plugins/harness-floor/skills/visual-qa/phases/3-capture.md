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

## Comprehensive-mode addendum — element identity + capture pairs (v0.4+)

For each interactive element discovered by `dom-walker.mjs` on a page:

1. **Filter via targets.** Pass the element through `lib/targets-filter.mjs`'s `resolveTarget()` using `config.comprehensive.targets`. If `capture: false`, skip the element. Otherwise the returned `action` (e.g. `click`, `fill:vqa-sample`, `blur`) drives step 4.

2. **Compute identity.** Build a descriptor `{vqaId, role, tagName, type, accessibleName, nearestHeading, textContent, selector, domPath}` from the Playwright handle, then call `lib/element-identity.mjs`'s `computeElementIdentity(desc)` → `{ id, confidence, source }`. Store the ID as the element's stable handle for this run.

3. **Capture `before.png`.** Take a viewport screenshot of the current page state before any action runs. Path: `<slug-dir>/captures/<page>/<elementId>/before.png`. Skip this step if `config.comprehensive.pairs.captureBeforeAfter === false`.

4. **Dispatch action.** Parse the resolved action via `targets-filter.parseAction()` → `{kind, arg}`. Run via Playwright:
   - `kind === "click"` → `handle.click()`
   - `kind === "fill"` → `handle.fill(arg ?? "vqa-sample")`, then `handle.blur()` if next action is blur
   - `kind === "hover"` → `handle.hover()`
   - `kind === "select"` → `handle.selectOption(arg)`
   - `kind === "blur"` → `handle.blur()`

5. **Capture `after.png`.** After action + brief settle wait. Path: `<slug-dir>/captures/<page>/<elementId>/after.png`.

6. **Optional baseline pairing.** When `config.comprehensive.pairs.diffBaseline !== false` and `state.priorRunPath` is set:
   - Look up `baselineCaptures.get(elementId)` (built by phase 4 of the prior run).
   - If found: symlink the prior's `after.png` to `<slug-dir>/captures/<page>/<elementId>/baseline.png` (or copy on platforms without symlinks).
   - If not found AND current `confidence === "path"`: also try semantic-fingerprint lookup against the prior run's semantic-tier captures. Match success → record `degraded: true` warning.
   - Record `hasBaseline: <bool>` on the capture record.

7. **State write.** Append to `state.captures`:
   ```javascript
   state.captures.push({
     elementId, pageSlug: page.name, pageUrl: page.path,
     selector, action: parsedAction.kind, confidence,
     hasBaseline,
     screenshots: { before, after, baseline },
     // verdict gets filled by phase 4 (verdict.mjs) per-element
   });
   ```

This new flow is additive — `declared` mode and `comprehensive` runs without `targets` configured fall back to the existing auto-walk + LLM-verdict path (which still writes single `*.png` files per component, not pair directories).

## Comprehensive-mode addendum — DOM-hash cache lookup

When `state.mode === "comprehensive"` AND `state.domHashCache` is loaded,
the subagent checks the cache **before** running the LLM analysis for
each component:

```javascript
import { hashComponent, lookup, recordHit } from "./lib/dom-hash.mjs";

const hash = hashComponent({
  dom: await getComponentDomString(selector),
  computedStyles: await getComponentStyles(selector),
});

const hit = lookup(state.domHashCache, hash);
if (hit) {
  // Reuse prior LLM verdict — skip the image read + model call.
  emitAnalysis(hit.priorAnalysis);
  state.cacheHits = (state.cacheHits ?? 0) + 1;
} else {
  const analysis = await runLLMAnalysis(); // existing path
  recordHit(state.domHashCache, hash, analysis);
  emitAnalysis(analysis);
  state.cacheMisses = (state.cacheMisses ?? 0) + 1;
}
```

Phase 4 writes the updated cache back to
`.visual-qa-cache/dom-hashes.json` so future runs benefit.

## Comprehensive-mode addendum — shallow click

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
