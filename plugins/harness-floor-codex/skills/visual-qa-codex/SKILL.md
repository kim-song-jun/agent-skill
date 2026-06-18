---
name: visual-qa
description: >
  Use when a Codex CLI project needs browser screenshot capture, visual
  regression review, UI state coverage, or Playwright-backed visual QA evidence.
---

# /visual-qa

Runs the cost-unrestricted visual-QA pipeline on Codex CLI. Reads
`.visual-qa.json`, captures via Playwright MCP, analyses each image
with the configured LLM, and produces
`.agent-skill/reports/visual-qa/<slug>/report.md`. The packaged release
supports `declared` and `comprehensive` modes, including the same comprehensive
mode used by `/agent-all --qa`. Comprehensive mode adds crawl auto-discovery,
DOM walk coverage, shallow click expansion, DOM-hash caching, and a
baseline-relative verdict.

## Usage

From an installed Codex project, open `codex` in the repo and type the public
harness entrypoint:

```
run /visual-qa for the configured project
```

The installed project-local skill is named `visual-qa`. The source directory
remains `visual-qa-codex` only to identify the Codex implementation inside this
repository.

```
/visual-qa
/visual-qa --resume
/visual-qa --force --slug=my-run
/visual-qa --dispatch=sequential
```

## Flags

`--resume`, `--force`, `--yes`, `--budget=<USD>`, `--skip-health`,
`--slug=<custom>`, `--dispatch=sequential`.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + MCP + dispatch-strategy detect + health |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | sequential dispatch |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | summary + exit code |

## Rules

1. **Phases sequential.**
2. **State lives in `.visual-qa-state.json`.** Atomic via `apply_patch` + rename.
3. **Dispatch is sequential** on current Codex hooks.
4. **Diff vs prior run** always computed in Phase 4.

## Codex primitive map

| Action | Codex |
|---|---|
| Read file | implicit |
| Write file | `apply_patch` |
| Shell | `shell_command` (one-shot) / `exec_command` (PTY) |
| Dispatch page subagent | `.codex/skills/visual-qa-page/SKILL.md` |
| Prompt user | `agent-interaction/v1` via `renderer-codex.mjs`, logged to `interactions.jsonl` |
| Persist state | `apply_patch` |
| Playwright | `mcp__playwright__browser_*` (via `[mcp_servers.playwright]`) |

## On error

- `.visual-qa.json` missing → abort.
- Playwright MCP not in config.toml → abort with snippet.
- baseUrl unreachable → `agent-interaction/v1` confirmation, abort if
  `--yes` or non-TTY resolves the default abort option.
- Page subagent fails all captures → mark incomplete, continue.

## When done

Print summary: captures, analyses, issues, diff, dispatch strategy, report path.
Exit 0 if no critical, 1 otherwise.

## Templates

- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed
- `templates/mcp-snippet.toml.hbs` — `[mcp_servers.playwright]` entry
- `templates/codex-hooks-snippet.toml.hbs` — documents why no dispatch hook is emitted
- `templates/page-prompt.md.hbs` — per-page subagent prompt
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt
- `templates/report.md.hbs` — human-readable report

## References

- `references/porting-notes.md` — graduation, research questions
- `phases/*.md` — runnable Codex phase contract
