# /agent-all — Manual E2E Checklist

Run before each `harness-floor` release with /agent-all changes. Requires:
- A small fixture project with `.claude/agents/` already scaffolded (via `/agent-init`).
- `gh` installed and authenticated for PR test.
- Working git repo.

## Setup

```bash
mkdir /tmp/agent-all-fixture && cd /tmp/agent-all-fixture
git init
/agent-init --size=small
/agent-init --theme=floor   # seeds .visual-qa.json + .agent-all.json
```

## Checks

- [ ] `/agent-all` with empty `.claude/agents/` aborts and suggests `/agent-init`.
- [ ] Dirty git tree aborts.
- [ ] `/agent-all "tiny prompt"` with brainstorming enabled runs brainstorming → plan → 1-wave dispatch → PR.
- [ ] `/agent-all "tiny prompt" --no-brainstorm` skips brainstorming, writes task verbatim.
- [ ] `/agent-all docs/tasks/X-foo.md` (existing task) skips Phase 1 brainstorming entirely.
- [ ] Ctrl-C mid-Phase-3 then `--resume` continues without re-running completed waves.
- [ ] `--no-pr` produces commits + branch but no PR.
- [ ] `/agent-all "x" --loop` with deliberately failing breakCondition exhausts maxIter (exit code 3).
- [ ] `/agent-all "x" --loop` with passing breakCondition exits after 1 iter (exit code 0).
- [ ] `--max-cost=0.01` aborts in middle of Phase 3.
- [ ] `--theme=floor` from `/agent-init` produces both `.visual-qa.json` and `.agent-all.json` and adds "Floor Theme" section to CLAUDE.md.
- [ ] `.agent-all-state.json` is in `.gitignore`.
