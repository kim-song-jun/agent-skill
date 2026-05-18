---
name: visual-qa-codex
description: >
  Codex CLI port of /visual-qa — Playwright MCP capture matrix + per-image LLM
  analysis + diff vs prior run. Supports `declared` and `comprehensive` modes
  (crawl + DOM walk auto-discovery, shallow click, baseline-relative verdict).
  Phase 3 uses Codex's `agent` hook (preferred) or sequential
  `.codex/skills/visual-qa-page` (fallback). See
  plugins/harness-floor/skills/visual-qa/SKILL.md for source-of-truth.
---

# /visual-qa (Codex port)

Runs the cost-unrestricted visual-QA pipeline on Codex CLI. Reads
`.visual-qa.json`, captures via Playwright MCP, analyses each image
with the configured LLM, produces `docs/visual-qa/<slug>/report.md`.

## Usage

```
/visual-qa-codex
/visual-qa-codex --resume
/visual-qa-codex --force --slug=my-run
/visual-qa-codex --dispatch=sequential   # force fallback
```

## Flags

`--resume`, `--force`, `--yes`, `--budget=<USD>`, `--skip-health`,
`--slug=<custom>`, `--dispatch=agent-hook|sequential`.

## Pipeline

| Phase | File | Purpose |
|-------|------|---------|
| 0 | `phases/0-preflight.md` | config + MCP + dispatch-strategy detect + health |
| 1 | `phases/1-config.md` | load config, build matrix, estimate cost, confirm |
| 2 | `phases/2-discover.md` | find prior run, create slug dir |
| 3 | `phases/3-capture.md` | `agent` hook fan-out OR sequential dispatch |
| 4 | `phases/4-aggregate.md` | diff vs prior, write report.json + report.md |
| 5 | `phases/5-summary.md` | summary + exit code |

## Rules

1. **Phases sequential.**
2. **State lives in `.visual-qa-state.json`.** Atomic via `apply_patch` + rename.
3. **Dispatch auto-detected** at preflight; explicit flag overrides.
4. **Diff vs prior run** always computed in Phase 4.

## Codex primitive map

| Action | Codex |
|---|---|
| Read file | implicit |
| Write file | `apply_patch` |
| Shell | `shell_command` (one-shot) / `exec_command` (PTY) |
| Dispatch page subagent | `agent` hook OR `.codex/skills/visual-qa-page/SKILL.md` |
| Prompt user | `ask_user` |
| Persist state | `apply_patch` |
| Playwright | `mcp__playwright__browser_*` (via `[mcp_servers.playwright]`) |

## On error

- `.visual-qa.json` missing → abort.
- Playwright MCP not in config.toml → abort with snippet.
- baseUrl unreachable → `ask_user`, abort if `--yes`.
- `agent-hook` dispatch fails → fall back to sequential for that wave (warn).
- Page subagent fails all captures → mark incomplete, continue.

## When done

Print summary: captures, analyses, issues, diff, dispatch strategy, report path.
Exit 0 if no critical, 1 otherwise.

## Templates

- `templates/visual-qa.config.json.hbs` — `.visual-qa.json` seed
- `templates/mcp-snippet.toml.hbs` — `[mcp_servers.playwright]` entry
- `templates/codex-hooks-snippet.toml.hbs` — `[[hooks.agent]]` matcher
- `templates/page-prompt.md.hbs` — per-page subagent prompt
- `templates/analysis-prompt.md.hbs` — per-image LLM prompt
- `templates/report.md.hbs` — human-readable report

## References

- `references/porting-notes.md` — graduation, research questions
- `plugins/harness-floor/skills/visual-qa/SKILL.md` — source-of-truth
