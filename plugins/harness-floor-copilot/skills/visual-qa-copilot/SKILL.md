---
name: visual-qa-copilot
description: >
  Copilot CLI port of /visual-qa — Playwright MCP capture matrix + per-image
  LLM analysis + diff vs prior run. Supports `declared` and `comprehensive`
  modes (crawl + DOM walk auto-discovery, shallow click, baseline-relative
  verdict). Phase 3 uses Copilot's `task` tool for parallel per-page
  dispatch. See plugins/harness-floor/skills/visual-qa/SKILL.md for the
  source-of-truth pipeline.
---

# /visual-qa (Copilot port)

Runs the cost-unrestricted visual-QA pipeline on Copilot CLI. Reads
`.visual-qa.json`, captures via Playwright MCP, analyses each image with
the configured LLM, produces `docs/visual-qa/<slug>/report.md`.

## Usage

```
/visual-qa-copilot
/visual-qa-copilot --resume
/visual-qa-copilot --force --slug=my-run --yes
```

## Flags

`--resume`, `--force`, `--yes`, `--budget=<USD>`, `--skip-health`, `--slug=<custom>`.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + Playwright MCP + task tool + health checks |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | `task` per page (parallel); subagentStop OR list_agents awaiter |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | summary + exit code |

## Rules

1. **Phases sequential.** Phases run in order. Phase 3 is the only parallel one.
2. **State lives in `.visual-qa-state.json` + `store_memory("visual-qa/...").`**
3. **Matrix persisted to store_memory** for fast subagent reads in Phase 3.
4. **Diff vs prior run** always computed in Phase 4 if prior exists.
5. **Hard cap on cost via `--budget`** enforced in Phase 1 (pre-run) and
   Phase 3 (per-wave accumulator from `read_agent` cost field).

## Copilot primitive map

| Action | Copilot primitive |
|---|---|
| Read file | `read_file` |
| Write file | `apply_patch` |
| Shell | `read_bash` |
| Dispatch page subagent | `task` |
| Await dispatched agent | `subagentStop` hook OR `list_agents` poll |
| Inspect dispatched agent | `read_agent` |
| Persist matrix/state | `apply_patch` + `store_memory(scope="repository")` |
| Prompt user | `ask_user` |
| Playwright | `mcp__playwright__browser_*` (via `~/.copilot/mcp-config.json`) |

## On error

- `.visual-qa.json` missing → abort.
- Playwright MCP not registered → abort with mcp-config.json snippet.
- `task` tool unavailable (Copilot < v0.0.380) → abort with upgrade hint.
- baseUrl unreachable → `ask_user`, abort if `--yes`.
- Per-page `task` fails → mark page incomplete, continue others.

## When done

Print summary: captures, analyses, issues, diff, report path, total cost.
Exit code 0 if no critical, 1 otherwise.

## Templates

- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed
- `templates/mcp-snippet.json.hbs` — `~/.copilot/mcp-config.json` Playwright entry
- `templates/page-prompt.md.hbs` — per-page subagent prompt template
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt
- `templates/report.md.hbs` — human-readable report

## References

- `references/porting-notes.md` — graduation, known unknowns, Copilot-specific limits
- `plugins/harness-floor/skills/visual-qa/SKILL.md` — source-of-truth
