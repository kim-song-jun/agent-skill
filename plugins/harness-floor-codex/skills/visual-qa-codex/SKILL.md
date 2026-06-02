---
name: visual-qa-codex
description: >
  Codex CLI port of /visual-qa — Playwright MCP capture matrix + per-image LLM
  analysis + diff vs prior run. Supports `declared` and `comprehensive` modes
  (crawl + DOM walk auto-discovery, shallow click, baseline-relative verdict).
  Phase 3 uses sequential `.codex/skills/visual-qa-page` dispatch because
  current Codex hooks do not expose the older agent-dispatch surface. The
  local phase files in this skill are the runnable Codex workflow contract.
---

# /visual-qa-codex

Runs the cost-unrestricted visual-QA pipeline on Codex CLI. Reads
`.visual-qa.json`, captures via Playwright MCP, analyses each image
with the configured LLM, produces `docs/visual-qa/<slug>/report.md`.

## Usage

From an installed Codex project, open `codex` in the repo and type the public
harness entrypoint:

```
run /visual-qa for the configured project
```

This routes to the local `visual-qa-codex` workflow contract below. The
Codex-specific skill name remains visible so installed files, release audits,
and phase paths can stay platform-explicit.

```
/visual-qa-codex
/visual-qa-codex --resume
/visual-qa-codex --force --slug=my-run
/visual-qa-codex --dispatch=sequential
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
| Prompt user | `ask_user` |
| Persist state | `apply_patch` |
| Playwright | `mcp__playwright__browser_*` (via `[mcp_servers.playwright]`) |

## On error

- `.visual-qa.json` missing → abort.
- Playwright MCP not in config.toml → abort with snippet.
- baseUrl unreachable → `ask_user`, abort if `--yes`.
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
