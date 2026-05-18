# Phase 2 — Prior-run Discovery + Slug Dir

1. Compute slug: `<YYYY-MM-DD>-<short-git-sha>`. Override with `--slug`.
2. Slug dir: `<config.output.dir>/<slug>/`.
3. If exists AND `--force`: `run_shell_command("rm -rf <slugDir>")`.
4. If exists AND no `--force`: abort with hint.
5. Find prior run: latest sibling under `<config.output.dir>/`.
6. Create slug dir + per-page subdirs.
7. Push `{phase: 2, completedAt, slugDir, priorRunDir}` to state.
