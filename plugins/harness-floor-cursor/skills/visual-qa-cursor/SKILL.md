---
name: visual-qa
description: >
  Use when a Cursor project needs browser screenshot capture, visual regression
  review, UI state coverage, or Playwright-backed visual QA evidence.
---

# /visual-qa (Cursor port)

Runs the cost-unrestricted visual-QA pipeline on Cursor. Reads
`.visual-qa.json`, captures via Playwright MCP, analyses each image with
the configured LLM, produces `.agent-skill/reports/visual-qa/<slug>/report.md`.
Supports `declared` and `comprehensive` modes. Comprehensive mode adds crawl
auto-discovery, DOM walk coverage, shallow click expansion, DOM-hash caching,
and a baseline-relative verdict.

## Usage (from Cursor chat)

```
@visual-qa-coordinator run /visual-qa
@visual-qa-coordinator run /visual-qa --resume
@visual-qa-coordinator run /visual-qa --force --slug=my-run
```

If you don't have a `@visual-qa-coordinator` agent installed, the kit ships
with templates — see "What this skill installs".

## Flags

- `--resume` — skip phases already complete per `.visual-qa-state.json`.
- `--force` — wipe today's slug dir and re-run.
- `--yes` — skip the Phase 1 cost confirmation.
- `--budget=<USD>` — abort if accumulated estimated cost exceeds this.
- `--skip-health` — skip Phase 0 baseUrl health check.
- `--slug=<custom>` — override the auto-generated date slug.

## What this skill installs

1. `.visual-qa.json` — config (capture matrix; same shape as Claude Code).
2. Playwright MCP entry in `.cursor/mcp.json`.
3. `.cursor/agents/visual-qa-page.md` (with `is_background: true`) — per-page
   capture+analyze subagent.
4. (Optional, future) `.cursor/agents/visual-qa-coordinator.md` — parent
   agent that reads phases sequentially. For now, the user (or Cursor's
   default agent) follows `phases/0..5.md` manually.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + Playwright MCP + health checks |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | fan out `@visual-qa-page` per page (parallel via is_background) |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | chat summary + exit code |

## Rules

1. **Phases sequential.** Do not skip; do not parallelize phases.
2. **State lives in `.visual-qa-state.json`.** Same shape as Claude port.
3. **Phase 3 fan-out only.** Cursor's planner runs `@visual-qa-page`
   background subagents concurrently.
4. **Diff vs prior run** is always computed in Phase 4 if a prior run exists.
5. **Awaiter limitation.** Cursor cannot programmatically detect all
   background subagents finished. Coordinator waits for user confirmation
   before Phase 4. See `references/porting-notes.md`.

## On error

- `.visual-qa.json` missing → abort with install instructions.
- Playwright MCP not registered → abort with `.cursor/mcp.json` snippet.
- baseUrl unreachable (no `--skip-health`) → `agent-interaction/v1`
  confirmation via `renderer-cursor.mjs`, abort if `--yes` or non-TTY
  resolves the default abort option.
- Per-page subagent fails on all captures → mark page `incomplete`,
  continue other pages, surface in report.
- LLM call fails for an image → retry once, then record as `analysis_error`.

## When done

Coordinator prints summary: captures, analyses, issues, diff vs prior,
report path. Exit code 0 if no critical issues, 1 otherwise.

## Templates

- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed
- `templates/mcp-snippet.json.hbs` — `.cursor/mcp.json` Playwright entry
- `templates/agents/visual-qa-page.md.hbs` — per-page capture+analyze subagent (is_background: true)
- `templates/analysis-prompt.md.hbs` — per-image LLM analysis prompt
- `templates/report.md.hbs` — human-readable report

## References

- `references/porting-notes.md` — graduation details, Cursor-specific limitations
- `plugins/harness-floor/skills/visual-qa/SKILL.md` — source-of-truth pipeline
