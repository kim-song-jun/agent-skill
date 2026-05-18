# Phase 2 — Prior-run Discovery + Slug Dir

1. Compute slug: `<YYYY-MM-DD>-<short-git-sha>`. Override with `--slug=<custom>`.
2. Slug dir: `<config.output.dir>/<slug>/` (default `docs/visual-qa/<slug>/`).
3. If slug dir exists AND `--force`: `read_bash("rm -rf <slugDir>")`.
4. If slug dir exists AND no `--force`: abort with retry hint.
5. Find prior run: `read_bash("ls -td <config.output.dir>/*/ | grep -v <slug> | head -1")`.
   Stash `priorRunDir` (or null).
6. Create slug dir + per-page subdirs via `read_bash("mkdir -p ...")`.
7. Push `{phase: 2, completedAt, slugDir, priorRunDir}` to state.
