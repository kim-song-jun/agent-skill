# Integration with `superpowers:systematic-debugging`

`harness-debug` deliberately does NOT re-implement the prompt
engineering inside `superpowers:systematic-debugging`. Instead it
**wraps and persists** that skill. Both can be installed
side-by-side; `harness-debug` becomes the orchestrator and the
superpowers skill becomes the cognitive engine inside Phase 3.

## How the wrap works

1. **Phase 0** detects whether `superpowers:systematic-debugging` is
   installed. If present, `state.supervisor.wrappedSkill` is set to
   that skill's identifier.

2. **Phase 3 (Hypothesize)** auto-loads the skill when the supervisor
   field is populated:
   - Renders `templates/hypothesis-prompt.md.hbs` with the structured
     failure and prior rejections.
   - Invokes the `Skill` tool with `skill: "superpowers:systematic-debugging"`,
     passing the rendered prompt as the initial input.
   - Captures the model's reply (which lives inside the skill's
     framing) and parses out the hypothesis enumeration.
   - Stores each hypothesis in `state.hypotheses[]` via
     `hypothesis-tracker#addHypothesis`.
   - Records `state.supervisor.lastInvokedAt` and
     `state.supervisor.promptDigest = sha256(prompt).slice(0,16)`.

3. **State persistence** is the key value-add. The skill's transient
   reasoning chain is captured into `.debug-state.json` so the next
   turn (or the next session via `--resume`) starts from structured
   state instead of re-deriving the analysis from a long conversation
   that has likely been compacted.

4. **Phase 4 honours the skill's Phase 4 (Implementation).** When the
   superpowers skill advances to proposing an experiment, harness-debug
   runs that experiment instead of inventing its own. The skill
   remains the source of truth for HOW to think; harness-debug
   supplies WHAT to think about and WHERE the conclusions land.

## Graceful fallback

When `superpowers:systematic-debugging` is not installed,
`harness-debug` uses the inlined version of the same template
(`templates/hypothesis-prompt.md.hbs`) and prints a banner:

```
[fallback — superpowers:systematic-debugging not installed]
```

Functionality is reduced (no skill updates flow through; the model
loses the skill's "Four Phases / Iron Law" framing) but the workflow
remains intact: the model still enumerates 2-3 falsifiable hypotheses,
they still land in state, and Phase 4 still tests them one at a time.

## Version pinning (future)

If `superpowers:systematic-debugging` bumps its prompt structure,
the hypothesis-extraction parser in Phase 3 may misread the reply.
v0.1 stores the skill version in `state.supervisor.skillVersion` so
mismatches are detectable; future iterations may pin a known-good
range in `plugin.json`.

## Why not just re-implement?

Three reasons:

1. The superpowers skill's prompt is the result of many sessions of
   refinement. Re-implementing risks regressing on subtle phrasing
   that took weeks to find.
2. Updates to the superpowers skill should automatically flow into
   `/debug` users without a plugin release.
3. Users who already use `superpowers:systematic-debugging`
   standalone get the familiar framing inside `/debug`, lowering the
   adoption barrier.

## Detection probe

In Phase 0, the skill calls something like:
```js
// Pseudocode — actual probe TBD via Skill tool capability surface.
const skills = listAvailableSkills();
const supervisor = skills.find(s => s.startsWith("superpowers:systematic-debugging"));
state.supervisor = supervisor
  ? { wrappedSkill: supervisor, lastInvokedAt: null, promptDigest: null }
  : null;
```

If the detection probe itself errors, treat as "not installed" and
proceed with the fallback path.
