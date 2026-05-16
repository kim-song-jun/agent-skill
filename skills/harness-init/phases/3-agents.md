# Phase 3 — Agents (parallel fan-out)

## Pre-fan-out

Invoke `Skill` with `superpowers:dispatching-parallel-agents` first. Adopt its dispatch checklist.

## Inputs

- `discovery` and the `agents` array from Phase 2.

## Steps

1. Compute the file list:
   - For each entry in `agents`:
     - If `name` starts with `qa-`: template = `templates/agents/qa.md.hbs`, context = `{ ...discovery, persona: name.slice(3) }`.
     - Else: template = `templates/agents/<name>.md.hbs`, context = `{ ...discovery, persona: "" }`.

2. **Fan out** the render+write work. Each subagent gets one role:
   ```
   For each role in <agents list>:
     - Read template path
     - Render with provided context (use lib/render.mjs)
     - Write to .claude/agents/<role-name>.md
     - Return { role, path, bytesWritten }
   ```
   Dispatch via `Skill` with `superpowers:dispatching-parallel-agents`. Treat each role-render as an independent task — they share no state.

3. Collect results. If any role failed, abort the phase: list the failures, leave `.harness-state.json` unchanged. Do NOT mark Phase 3 complete on partial success.

4. On full success, set top-level `agents_written` to the list of paths and push `{ "phase": 3, "completedAt": "<iso>" }` onto `phases` in `.harness-state.json`.

## Output to user

Print a table: role → file path → bytes.
