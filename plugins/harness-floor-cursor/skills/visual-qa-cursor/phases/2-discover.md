# Phase 2 — Prior-run Discovery + Slug Dir

1. Compute slug: `slug = <YYYY-MM-DD>-<short-git-sha>` (e.g.,
   `2026-05-18-abc1234`). Override with `--slug=<custom>` if provided.
2. Slug dir: `<config.output.dir>/<slug>/` (default `.agent-skill/reports/visual-qa/<slug>/`).
3. If slug dir exists AND `--force`: rm -rf it.
4. If slug dir exists AND no `--force`: print `Run with --force to re-run
   today's slug, or use --slug=<other>` and abort.
5. Find prior run: latest sibling dir under `<config.output.dir>/` (sort by
   mtime; exclude current slug). Stash `priorRunDir` in state (or null if
   first run).
6. Create slug dir + subdirs per `pages[]` (also `flows/` if flows exist).
7. Push `{phase: 2, completedAt, slugDir, priorRunDir}` to state.

## Shell helpers

```bash
# Initialise the state file (slug-scoped) on the first run.
node .cursor/visual-qa/lib/state-rw.mjs read  .visual-qa-state.json
node .cursor/visual-qa/lib/state-rw.mjs write .visual-qa-state.json '{"slug":"<slug>","slugDir":"<dir>","priorRunDir":<dir-or-null>,"phases":[]}'
```
