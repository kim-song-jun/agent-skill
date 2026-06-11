# /agent-all — Manual E2E Checklist

Run before each `harness-floor` release with /agent-all changes. Requires:
- A small fixture project with `.claude/agents/` already scaffolded (via `/agent-init`).
- `gh` installed and authenticated for PR test.
- Working git repo.

## Setup

```bash
mkdir /tmp/agent-all-fixture && cd /tmp/agent-all-fixture
git init
/agent-init   # default floor profile seeds .visual-qa.json + .agent-all.json
```

## Checks

- [ ] `/agent-all` with empty `.claude/agents/` aborts and suggests `/agent-init`.
- [ ] Dirty git tree aborts.
- [ ] `/agent-all "tiny prompt"` with brainstorming enabled runs brainstorming → plan → 1-wave dispatch → PR.
- [ ] `/agent-all "prompt"` creates `.agent-skill/tasks/NN-slug.md`.
- [ ] `/agent-all "tiny prompt" --no-brainstorm` skips brainstorming, writes task verbatim.
- [ ] `/agent-all .agent-skill/tasks/X-foo.md` (existing task) skips Phase 1 brainstorming entirely.
- [ ] `/agent-all docs/tasks/X-legacy.md` (legacy existing task) remains readable for migration.
- [ ] Completion/PR is blocked when required task sections are missing.
- [ ] Ctrl-C mid-Phase-3 then `--resume` continues without re-running completed waves.
- [ ] `--no-pr` produces commits + branch but no PR.
- [ ] `/agent-all "x" --loop` with deliberately failing breakCondition exhausts maxIter (exit code 3).
- [ ] Handoff is updated when a loop exhausts or a wave blocks.
- [ ] `/agent-all "x" --loop` with passing breakCondition exits after 1 iter (exit code 0).
- [ ] `--max-cost=0.01` aborts in middle of Phase 3.
- [ ] Changed-file classifier dispatches security/data/design reviewers for matching files.
- [ ] Default `/agent-init` produces both `.visual-qa.json` and `.agent-all.json` and adds the floor harness section to CLAUDE.md.
- [ ] `.agent-all-state.json` is in `.gitignore`.
