# Manual end-to-end checklist

Run before each `harness-builder` release. Use a fresh tmpdir as the target project.

## Setup

```bash
mkdir /tmp/harness-fixture && cd /tmp/harness-fixture && git init
# (Optional: drop a package.json or pyproject.toml to influence stack detection)
```

## Run

In Claude Code, invoke `/agent-init`.

## Checks

- [ ] Phase 1 actually triggers `superpowers:brainstorming` (you see brainstorming questions).
- [ ] Stack detection picked the right language (or "unknown").
- [ ] Phase 3 dispatches in parallel (visible in the agent log as multiple subagents launched at once).
- [ ] `CLAUDE.md` written; re-run `/agent-init` against an existing `CLAUDE.md` and confirm only the `agent-skill:operational` sentinel section is appended or replaced.
- [ ] `.claude/agents/*.md` count matches size (small=3, medium=6+#qa, large=9+#qa).
- [ ] Each generated agent file contains the three operating principles in its `## Rules` section.
- [ ] `.claude/hooks/{context-mode-router,session-summary,cache-heal,agent-policy-hook}.mjs` exist and are syntactically valid (`node --check`).
- [ ] `.claude/settings.local.json` registers the base three hooks and the operational policy hook.
- [ ] `.gitignore` contains `.claude/.agent-init-state.json`.
- [ ] Final commit message is `chore: bootstrap harness via /agent-init`.
- [ ] Re-running with no flags is a no-op and prints "All phases already complete (use --force to re-run)".
- [ ] `--force` rebuilds from scratch and overwrites artefacts.
- [ ] `--dry-run` writes nothing to disk.
- [ ] `/agent-init` default creates `docs/tasks/index.md`, folder guides, and policy hook artifacts.
- [ ] `/agent-init --lite` skips task ledger and policy hooks.
- [ ] Re-running `/agent-init` against existing `CLAUDE.md` appends or replaces only the sentinel section.
- [ ] `--dry-run --update-foundations` prints foundation update plan without changing files.
- [ ] Missing-plugin scenario: temporarily disable `context-mode` in settings, re-run, confirm Phase 5 prints the install command.
