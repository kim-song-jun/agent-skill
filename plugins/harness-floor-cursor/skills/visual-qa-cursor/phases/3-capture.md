# Phase 3 — Capture + Analyze (parallel fan-out)

## Cursor dispatch strategy

Cursor has no programmatic subagent dispatch API. Phase 3 fans out by
invoking `@visual-qa-page` (a Cursor agent file with `is_background: true`)
once per page-group. Cursor's planner runs them concurrently.

## Pre-fan-out

Read `templates/page-prompt.md.hbs` as the per-page prompt template.
Render with `{categories, severityThreshold, baseUrl, slugDir,
analysisModel}` from config.

## Group matrix by page

Group the matrix from Phase 1 by `page.name` (or `flows[i].name`). Each
group becomes one subagent invocation.

## Dispatch one subagent per page

For each page-group, invoke `@visual-qa-page` in chat with body:

```
PAGE: <page.name or flows[i].name>
BASE_URL: <config.baseUrl>
OUTPUT_DIR: <slug-dir>/<page>/
BREAKPOINTS: <JSON array>
COMPONENTS: <JSON array of {name, selector, states}>
ANALYSIS_PROMPT_TEMPLATE: <rendered analysis-prompt content>
AUTH_FLOW: <config.auth.loginFlow JSON if page.requiresAuth>
```

Cursor's planner sees `@visual-qa-page.is_background = true` and runs
multiple in parallel.

## Per-subagent steps (these go into the dispatched prompt)

The `@visual-qa-page` subagent template (shipped as
`templates/agents/visual-qa-page.md.hbs`):

1. Call `mcp__plugin_playwright_playwright__browser_navigate(BASE_URL)`.
2. If AUTH_FLOW: execute it (a sequence of clicks/types to log in).
3. For each breakpoint:
   a. `browser_resize(width, height)`.
   b. `browser_take_screenshot(filename = <OUTPUT_DIR>/<breakpoint>/_page.png)`.
   c. For each component: scroll to selector, snapshot, optionally hover/focus
      for each state.
4. For each captured PNG, call the configured LLM with
   ANALYSIS_PROMPT_TEMPLATE + the image. Save:
   - `<image>.analysis.json` (structured issues)
   - `<image>.analysis.md` (human-readable)
5. Return per-page status JSON:
   `{page, captures, analyses, status: "completed" | "incomplete", errors[]}`.

## Orchestrator after fan-out

1. Collect all subagent results from each `@visual-qa-page` invocation.
2. Per-page status → `state.perPageStatus`.
3. Push `{phase: 3, completedAt}` to `phases`.

## Output

Per-page: `Page <name>: <captured>/<expected> captures, <analyzed>/<expected> analyses`.
