---
name: visual-qa
description: >
  Use when a Gemini CLI project needs browser screenshot capture, visual
  regression review, UI state coverage, or Playwright-backed visual QA evidence.
---

# /visual-qa (Gemini port)

Runs the cost-unrestricted visual-QA pipeline on Gemini CLI. Reads
`.visual-qa.json`, captures via Playwright MCP, analyses each image with
the configured LLM, produces `.agent-skill/reports/visual-qa/<slug>/report.md`.
Supports `declared` and `comprehensive` modes. Comprehensive mode adds crawl
auto-discovery, DOM walk coverage, shallow click expansion, DOM-hash caching,
and a baseline-relative verdict.

## Usage

```
/visual-qa
/visual-qa --resume
/visual-qa --force --slug=my-run
```

## Flags

`--resume`, `--force`, `--yes`, `--budget=<USD>`, `--skip-health`,
`--slug=<custom>`, `--subprocess-timeout=<sec>`, `--max-subprocesses=<N>`.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + MCP + subprocess sanity + health |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | fork N parallel `gemini chat` subprocesses per page |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | summary + tmp GC + exit code |

## Rules

1. **Phases sequential.**
2. **State lives in `.visual-qa-state.json`.** Atomic via `write_file` + rename.
3. **Per-page subprocesses get their own MCP session.** No shared browser context.
4. **Tmp dir at `/tmp/visual-qa/`** for IPC; GC'd in Phase 5.
5. **Diff vs prior run** always computed in Phase 4.

## Gemini primitive map

| Action | Gemini |
|---|---|
| Read file | `read_file` |
| Write file | `write_file` |
| Shell | `run_shell_command` |
| Dispatch page subagent | spawn `gemini chat -p ... --output-file ... &` subprocess |
| Await | `wait <pid>` OR poll tmp dir |
| Prompt user | `agent-interaction/v1` via `renderer-gemini.mjs`, logged to `interactions.jsonl` |
| Playwright | `mcp__playwright__browser_*` (via `~/.gemini/settings.json` mcpServers) |

## On error

- `.visual-qa.json` missing → abort.
- Playwright MCP not in settings.json → abort with snippet.
- `gemini` binary missing → abort.
- baseUrl unreachable → `agent-interaction/v1` confirmation, abort if
  `--yes` or non-TTY resolves the default abort option.
- Subprocess timeout → kill, mark page failed, continue.
- Tmp file missing (subprocess crashed) → synthesize failed status, continue.

## When done

Print summary including subprocesses used + total cost. GC `/tmp/visual-qa/`.
Exit 0 if no critical, 1 otherwise.

## Templates

- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed
- `templates/mcp-snippet.json.hbs` — `~/.gemini/settings.json` Playwright entry
- `templates/page-prompt.md.hbs` — per-page subagent prompt
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt
- `templates/report.md.hbs` — human-readable report

## References

- `references/porting-notes.md` — graduation, subprocess strategy details
- `plugins/harness-floor/skills/visual-qa/SKILL.md` — source-of-truth
