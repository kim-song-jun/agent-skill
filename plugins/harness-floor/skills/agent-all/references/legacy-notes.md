# Legacy Notes

This skill is a superpowers-based reimplementation of the original user skill `agent-all` (preserved at `plugins/harness-builder/skills/harness-init/references/legacy-notes.md` for Theme A).

## What changed from the original

- **Brainstorming required** — original optionally brainstormed; this version always brainstorms free-form prompts (unless `--no-brainstorm`).
- **superpowers delegation** — phases 2-4 are thin wrappers around `superpowers:writing-plans`, `superpowers:subagent-driven-development`. Original embedded planner/builder/gate logic inline.
- **Loop is opt-in** — original wave dispatch did not loop; the original Ralph-style loop pattern is now `--loop` here (no separate `/ralph` skill).
- **Config file** — `.agent-all.json` is new; the original took everything via CLI args.

## What was preserved

- Wave dispatch model (size → maxParallel → rolesAllowed)
- Task numbering scheme (`docs/tasks/<N>-<slug>.md`)
- `--resume` semantics via on-disk state
- PR creation via `gh pr create`
