# CLI runtime verification — handoff checklist

**Date:** 2026-05-18
**Status:** Handoff doc — runtime checks deferred to next session
**Purpose:** Document the verification steps that require live CLI access
(Codex, Copilot CLI, Gemini CLI, Cursor) that the current sandbox cannot
perform. Anyone with these CLIs installed can follow this checklist to
validate the scaffolded plugins ship correctly.

## Why a handoff

The current iteration shipped:
- 5 specs (agent-all decomposition, visual-qa porting design, native
  ask_user integration, cross-platform plugins design, this checklist)
- 4 implementation iterations (auto-detect-docker-stack, cross-platform
  plugin MVPs, cross-platform follow-ups, visual-qa scaffold + agent-all
  porting)
- 11 plugins on marketplace
- 280+ unit tests passing

None of the cross-platform plugins (Codex/Copilot/Gemini/Cursor) have
been run end-to-end against their actual CLIs. The Claude Code sandbox
where this work was authored does not have those binaries installed.

This checklist enumerates the runtime checks required to validate each
plugin works on its target platform.

## Common prerequisites per platform

| Platform | Install | Project requirement |
|---|---|---|
| Codex CLI | `npm i -g @openai/codex-cli` (or per OpenAI docs) | `.codex/config.toml` writable |
| Copilot CLI | `gh copilot install` (v0.0.380+) | `~/.copilot/mcp-config.json` writable |
| Gemini CLI | `npm i -g @google/gemini-cli` (or per Google docs) | `~/.gemini/settings.json` writable |
| Cursor | Cursor IDE installed | `.cursor/` writable; MCP support enabled |

Each platform needs:
1. A test project with `package.json` + a dev server reachable on
   `http://localhost:3000` (for visual-qa tests).
2. Playwright MCP available globally (`npx -y @playwright/mcp@latest` works
   on macOS without prior install if Node.js is installed).
3. `gh` CLI + GitHub auth (for `agent-all` PR creation tests).
4. A clean git repo with at least one feature branch.

## Per-plugin verification matrix

### harness-builder-{codex,copilot,gemini,cursor}

**Goal**: Verify `/agent-init` (or equivalent) emits correct
platform-specific files.

For each platform:

| Step | Command | Expected outcome |
|---|---|---|
| 1 | Install the plugin (per platform's mechanism) | Plugin appears in `<platform> plugins list` |
| 2 | Run init: `<platform>-init` or equivalent | Files created without errors |
| 3 | Verify CLAUDE.md/AGENTS.md/GEMINI.md/copilot-instructions.md content | Section headings match templates |
| 4 | Verify hook config (if applicable) | Hooks fire on tool use |
| 5 | Verify MCP config (if applicable) | MCP servers listed in platform's config inspector |

#### Codex specifics

```bash
codex --version  # Should be recent enough
codex skill install harness-builder-codex
codex skill run codex-init
# Verify:
ls .codex/skills/  # planner, dev, reviewer
cat AGENTS.md
cat .codex/config.toml | grep -A 5 '\[hooks\]'
```

#### Copilot specifics

```bash
gh copilot --version  # >= 0.0.380
# Plugin install path TBD (Copilot plugin system not fully GA)
# Manually copy plugins/harness-builder-copilot/skills/copilot-init/templates/* to project
# Then in Copilot chat:
@workspace help me run copilot-init
```

#### Gemini specifics

```bash
gemini --version
gemini extension install harness-builder-gemini
gemini extension run gemini-init
# Verify:
ls .gemini/skills/
cat GEMINI.md
cat ~/.gemini/settings.json | jq '.hooks, .mcpServers'
```

#### Cursor specifics

```bash
node plugins/harness-builder-cursor/bin/init.mjs /path/to/test/project --ctx ctx.json
# Verify:
ls /path/to/test/project/.cursor/rules/
ls /path/to/test/project/.cursor/agents/
# Open project in Cursor; verify rules + agents appear in Cursor's panel
```

### harness-floor-{codex,copilot,gemini,cursor}

#### visual-qa-<platform> (scaffold + full pipeline)

For each platform, in a test project with `.visual-qa.json` and a running
dev server:

| Step | Command | Expected outcome |
|---|---|---|
| 1 | Render config: invoke `visual-qa-<platform>` Phase 1 | `.visual-qa.json` created (or refuse-overwrite) |
| 2 | Print MCP snippet: Phase 2 | Snippet on stdout matches mcp-snippet template |
| 3 | Run full pipeline (after merging MCP snippet): Phase 0–5 | `docs/visual-qa/<slug>/report.md` produced |
| 4 | Diff vs prior run | Second run shows `new`/`resolved`/`unchanged` issue buckets |
| 5 | `--resume` after Ctrl-C in Phase 3 | Skips completed phases, resumes capture |

**Platform-specific Phase 3 checks:**

- **Cursor**: Verify `@visual-qa-page` background subagents run in parallel
  (multiple chat tabs spawn). Verify each writes results to `<slug-dir>/<page>/`.
- **Copilot**: Verify `task()` dispatch returns `agentId`. Verify
  `list_agents()` shows the page subagents. Verify `subagentStop` hook
  fires (or polling fallback engages).
- **Codex**: Verify `[[hooks.agent]]` matcher catches the dispatch when
  registered. Verify sequential fallback engages when not registered.
  Verify `codex agent wait` blocks until all dispatched agents finish.
- **Gemini**: Verify subprocess spawn via `run_shell_command(... &)`. Verify
  `wait <pid>` blocks. Verify `/tmp/visual-qa/page-<name>.json` files
  populated by subprocesses.

#### agent-all-<platform> (scaffold)

For each platform, in a test project with `.agent-all.json` and `.claude/agents/`
(or equivalent):

| Step | Command | Expected outcome |
|---|---|---|
| 1 | Run with free-form prompt | Phase 1 brainstorm initiated |
| 2 | Run with `--no-brainstorm` | Phase 1 skips, task file written verbatim |
| 3 | Run with `docs/tasks/N-slug.md` | Phase 1 loads task |
| 4 | Phase 2 plan emitted | `docs/superpowers/plans/<date>-<slug>.md` exists |
| 5 | Phase 3 dispatch | Wave 1 implementers dispatched (count matches `waveSize.maxParallel`) |
| 6 | Phase 4 gate reviews | Spec + quality reviewer dispatched per wave |
| 7 | Phase 5 PR creation | `gh pr create` succeeds; URL returned |
| 8 | `--loop` with breakCondition | Re-enters Phase 1 until condition passes |
| 9 | `--max-iter=2` exhausted | Exit code 3 |

**Platform-specific Phase 3 checks:**

- **Cursor**: `@agent-all-implementer` background subagents fan out per task.
  Verify each commits its work.
- **Copilot**: `task()` invocations spawn per task. `read_agent(agentId)`
  returns `{status, commits, costUSD}`.
- **Codex**: `[[hooks.agent]]` catches dispatch with prefix
  `agent-all/wave/<i>/`. Sequential fallback works when hook missing.
- **Gemini**: Subprocess pool spawns up to `dispatch.maxSubprocesses`.
  Per-task tmp file populated. Cost accumulator reads `--output-json`.

## Tests that CANNOT be sandbox-verified

| Test category | Why deferred |
|---|---|
| `task` tool concurrency cap (Copilot) | Need live CLI to probe rate-limits |
| `agent` hook matcher syntax (Codex) | Schema not yet documented publicly |
| `--output-json` flag presence (Gemini) | CLI flag inventory not in repo |
| `subagentStop` hook payload (Copilot) | Hook fires only with real subagent dispatch |
| Cursor background-chat completion polling | No public API documented |
| Cost-tracking field names per platform | Need real LLM responses |

## Test scripts to author after CLI access

For repeatability, write the following smoke-test shell scripts in
`scripts/runtime-checks/<platform>.sh`:

```bash
# scripts/runtime-checks/codex.sh
#!/bin/bash
set -euo pipefail

mkdir -p /tmp/agent-skill-runtime-test
cd /tmp/agent-skill-runtime-test
git init
cp -r /path/to/agent-skill/plugins/harness-builder-codex .

codex skill install ./harness-builder-codex
codex skill run codex-init

test -f AGENTS.md
test -d .codex/skills/planner
test -d .codex/skills/dev
test -d .codex/skills/reviewer
grep -q "\[hooks\]" .codex/config.toml

echo "PASS: harness-builder-codex runtime check"
```

Similar scripts for the other three platforms — drives the verification
matrix from cmdline.

## Acceptance criteria for "next session can ship"

Before considering any `<plugin>` ready for marketplace promotion (beyond
the current MVP listing):

- [ ] Plugin installs via platform-native mechanism without errors.
- [ ] Init flow emits expected files.
- [ ] No cross-plugin imports (enforced by `tests/lib/cross-platform-isolation.test.mjs`
      at build time — already passing).
- [ ] visual-qa scaffold: produces config + MCP snippet on first run.
- [ ] visual-qa full pipeline: produces a report.md after Phase 5.
- [ ] agent-all scaffold: runs Phase 0–2 without errors (Phase 3+ may
      defer to per-platform research-spike outcomes).
- [ ] At least one full agent-all pipeline run produces a PR.

## Tracking

This handoff doc lives at
`docs/superpowers/specs/2026-05-18-cli-runtime-verification-checklist.md`.
Update its status to "Verified" once a session with CLI access completes
the matrix above. Add per-CLI runtime issues found to a new tracking
issue (e.g., `docs/superpowers/plans/2026-05-<date>-cli-runtime-fixes.md`).
