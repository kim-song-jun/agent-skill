# Phase 2 — Prior-run Discovery + Slug Dir

1. Compute slug: `slug = <YYYY-MM-DD>-<short-git-sha>` (e.g.,
   `2026-05-18-abc1234`). Override with `--slug=<custom>` if provided.
2. Slug dir: `<config.output.dir>/<slug>/` (default `docs/visual-qa/<slug>/`).
3. If slug dir exists AND `--force`: rm -rf it.
4. If slug dir exists AND no `--force`: print `Run with --force to re-run
   today's slug, or use --slug=<other>` and abort.
5. Find prior run: latest sibling dir under `<config.output.dir>/` (sort by
   mtime; exclude current slug). Stash `priorRunDir` in state (or null if
   first run).
6. Create slug dir + subdirs per `pages[]` (also `flows/` if flows exist).
7. Push `{phase: 2, completedAt, slugDir, priorRunDir}` to state.
