# Phase 0 — Preflight

## Steps

1. Confirm `pwd` is a git repo (`git rev-parse --git-dir`). If not:
   warn `not in a git repo — tree-hash checkpoints will be skipped`
   but continue.

2. Detect whether the working tree is clean (`git status --porcelain`).
   - Clean → baseline hash = current tree hash.
   - Dirty → baseline hash = current tree hash anyway (debug
     **allows** dirty trees because the failure may live in uncommitted
     code). Record `dirtyAtStart: true` in state.

3. Confirm a failing command was provided.
   - Positional argument present → use it as `failure.command`.
   - Not present AND `--resume` AND existing state has
     `failure.command` → reuse that.
   - Not present AND no resumable command → invoke
     `lib/repro-suggester.mjs#suggestCommands({projectRoot})`. Render
     `templates/repro-prompt.md.hbs` with the candidates + questions
     and ask the user to pick one (or type their own).

4. Load (or seed) `.debug-state.json`:
   - `--resume` flag → call `loadState(path)`. If ok, skip to the
     highest completed phase.
   - Otherwise → call `skeleton({command, description})` and persist
     via `saveState`.

5. Push initial checkpoint:
   ```
   pushCheckpoint(state, {
     phase: 0,
     actionsTaken: ["recorded baseline tree hash", "loaded/seeded state"],
   });
   saveState(path, state);
   ```

6. If `superpowers:systematic-debugging` is installed (probe via
   `ToolSearch` for `Skill` or check the plugin cache), record
   `state.supervisor = {wrappedSkill: "superpowers:systematic-debugging"}`
   for Phase 3.

## Output to user

```
Debug preflight OK.
  command:        <failure.command>
  tree:           <clean|dirty>
  baseline hash:  <sha256 short>
  resume:         <no|yes — last completed phase N>
  superpowers:    <available|fallback>
```
