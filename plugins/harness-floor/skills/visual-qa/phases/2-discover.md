# Phase 2 — Prior-run discovery + slug dir

## Inputs

- `config.output.dir` (default `docs/visual-qa`)
- `config.output.keepLastN` (default 10)
- CLI: `--slug=<custom>`, `--force`, `--resume`

## Steps

1. List subdirectories of `<config.output.dir>/`. Filter to those with a complete `report.json` (file exists AND parses to JSON with non-empty `slug` field).

2. Sort by directory-name (ISO date prefix sorts lexicographically). Take the most recent as `priorRun`. If none, `priorRun = null`.

3. `keepLastN` cleanup: if more than `keepLastN` complete runs exist, delete the oldest excess directories (rm -rf). Do not delete the just-found `priorRun`.

4. Compute slug:
   - If `--slug=<x>` provided: use `x`.
   - Else: `${YYYY-MM-DD}-${random7hex}`.

5. Determine target dir: `<config.output.dir>/<slug>/`.
   - If exists and `--resume`: keep contents.
   - If exists and `--force`: rm -rf, then mkdir.
   - If exists and neither flag: abort `Slug dir already exists; use --resume or --force.`
   - If not exists: mkdir.

6. Update state:
   - Set top-level `slug`.
   - Push `{phase: 2, completedAt}` to `phases`.
   - Stash `priorRun` path (not contents) in `.visual-qa-state.json` under `priorRunPath` for Phase 4.

## Output to user

Print: `Slug: <slug>. Prior run: <path or 'none'>.`
