# Phase 3 — Capture + Analyze (parallel fan-out)

## Copilot dispatch strategy

Phase 3 uses Copilot's `task` tool to fan out one subagent per page group.
Each `task` invocation gets a dedicated Playwright MCP session.

## Group matrix by page

Group matrix from Phase 1 by `page.name` (or `flows[i].name`). One group
per `task` invocation.

## Dispatch one subagent per page

For each page-group, call:

```
task({
  prompt: <rendered page-prompt with PAGE/BASE_URL/OUTPUT_DIR/BREAKPOINTS/COMPONENTS/ANALYSIS_PROMPT_TEMPLATE/AUTH_FLOW>,
  context: { visualQaPage: pageName, slugDir, matrixPath: state.matrixPath },
})
```

Use a stable agent name such as `visual-qa-page-<sanitized-page-name>` so
optional `subagentStop` lifecycle logs can be correlated by `agentName`.

## Awaiter

Wait for each `task` invocation's final response. If the optional
`subagentStop` helper is installed, also tail `.copilot/visual-qa/inbox.jsonl`
for lifecycle records with `{agentName, sessionId, transcriptPath,
stopReason}`. Hook records are evidence only; page status comes from the
task's returned JSON contract.

## Per-subagent steps (in the page-prompt template)

The dispatched `task` follows `templates/page-prompt.md.hbs`:

1. `browser_navigate(BASE_URL + page.path)`.
2. If AUTH_FLOW: execute (`browser_click`, `browser_type`).
3. For each breakpoint: `browser_resize`, `browser_take_screenshot`,
   per-component captures including hover/focus states.
4. For each PNG: call the configured LLM with ANALYSIS_PROMPT_TEMPLATE
   + image; save `<image>.analysis.json` + `<image>.analysis.md`.
5. Return JSON: `{page, captures, analyses, status, errors[], costUSD}`.

## Orchestrator after fan-out

1. Parse each finished page task's returned JSON.
2. Aggregate per-page status -> `state.perPageStatus`.
3. Accumulate `state.costUSD`.
4. Push `{phase: 3, completedAt}` to state.

## On error

- `task` invocation rate-limited: retry once with backoff.
- Subagent times out: mark page `incomplete`, continue others.
- LLM analysis fails for image: subagent retries once; if still failing,
  records `analysis_error` and continues.
