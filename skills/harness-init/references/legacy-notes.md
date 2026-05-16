# Legacy Notes

This skill replaces three earlier user skills. Their behaviour is now absorbed into `/harness-init`'s phases.

## Original `claude-init`

> Use when bootstrapping a fresh project that has no CLAUDE.md yet. Refuses if CLAUDE.md exists (use claude-md-improver instead). Optional --merge flag preserves existing CLAUDE.md and appends a bootstrap section.

**Absorbed by:** Phase 2 (`phases/2-claude-md.md`). `--merge` flag preserved.

## Original `agent-init`

> Use after /claude-init (or in a project with existing CLAUDE.md) to scaffold .claude/agents/ with role files (planner / dev / designer / qa-{persona} / tester / reviewer). Takes --size=small|medium|large to scale agent count, auto-infers QA personas from README+DB+route guards (or accepts --qa= override), and injects Agent Pipeline Index into CLAUDE.md.

**Absorbed by:** Phase 3 (`phases/3-agents.md`). `--size` and `--qa` flags preserved.

## Original `agent-all`

> Use when running an end-to-end multi-agent pipeline on a single task — accepts a free-form prompt or existing task doc and drives planner+builders+gates until PR. Requires `.claude/agents/` scaffolded by /agent-init.

**Status:** Not absorbed by this plugin. Lives on as a follow-on workflow that uses the harness this plugin produces. Theme C ("cost-unrestricted parallel mode") is its intended home in this repo.
