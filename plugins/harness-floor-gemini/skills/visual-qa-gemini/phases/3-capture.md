# Phase 3 — Capture + Analyze (parallel fan-out)

## Gemini dispatch strategy

Phase 3 forks N parallel headless `gemini -p` subprocesses — one per page-group.
Each subprocess gets its own Playwright MCP session.

## Group matrix by page

Group matrix from Phase 1 by `page.name` (or `flows[i].name`).

## Dispatch

For each page-group, spawn a background subprocess:

```
run_shell_command(
  "node plugins/harness-floor-gemini/bin/spawn-page-subagent.mjs \
    --pages '/tmp/visual-qa/pages.json' \
    --tmp '/tmp/visual-qa' \
    --timeout 1800 &",
  { background: true }
)
```

The wrapper invokes Gemini CLI as `gemini -p '<rendered page-prompt body>'
--output-format json --skip-trust`, captures stdout, and writes
`/tmp/visual-qa/page-<sanitized-name>.json`. Gemini CLI 0.47 uses the
default command with `-p` and `--output-format json`; do not use old
chat-subcommand or output-file style flags.

Capture each wrapper subprocess `pid`. Tag output filename by page name.

## Awaiter

```
run_shell_command(
  "wait <pid1> <pid2> ... <pidN>",
  { timeout: 1800 + 60 }
)
```

OR poll tmp dir:

```
run_shell_command(
  "while :; do
    sleep 2
    finished=$(ls /tmp/visual-qa/page-*.json 2>/dev/null | wc -l)
    [ \"$finished\" -ge <N> ] && break
  done",
  { timeout: 1800 + 60 }
)
```

## Per-subprocess steps (in page-prompt template)

1. `browser_navigate(BASE_URL + page.path)`.
2. AUTH_FLOW if needed.
3. For each breakpoint × component × state: screenshot to OUTPUT_DIR.
4. For each PNG: LLM analysis → `.analysis.{json,md}`.
5. Return per-page JSON status; the wrapper writes it to
   `/tmp/visual-qa/page-<name>.json`.

## Orchestrator after fan-out

1. For each page, `read_file('/tmp/visual-qa/page-<name>.json')`. If
   missing (subprocess crashed): synthesize `{status: "failed"}`.
2. Aggregate `state.perPageStatus`.
3. `state.costUSD += sum(costUSD)`. Abort if exceeds `maxCostUSD`.
4. Push `{phase: 3, completedAt, maxParallelUsed}` to state.

## On error

- Subprocess timeout: `kill <pid>`, mark page `failed`, continue.
- Output file unparseable: mark page `failed`.
- LLM analysis fails for image: retry once in subprocess, then record
  as `analysis_error`.
