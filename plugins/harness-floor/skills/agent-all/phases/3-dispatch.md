# Phase 3 — Dispatch (3a Scoping → 3b Ask → 3c Implement)

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`
- `config.policy.decisionSurfacing` (default true)

## Steps

1. Parse the plan file. Extract task list using:
   ```javascript
   const text = readFileSync(plan.path, "utf-8");
   const headings = [...text.matchAll(/^### Task (\d+):\s*(.+)$/gm)];
   const tasks = headings.map((m, i) => {
     const next = headings[i + 1]?.index ?? text.length;
     const section = text.slice(m.index, next);
     const files = [...section.matchAll(/^- (?:Create|Modify):\s*`([^`]+)`/gm)].map(x => x[1]);
     const role = (/role:\s*(\w[\w-]*)/i.exec(section) ?? [])[1] ?? "dev";
     return { id: parseInt(m[1], 10), title: m[2].trim(), files, role };
   });
   ```

2. Build waves: `const waves = buildWaves(tasks, config.waves[waveSize])` from `lib/wave-builder.mjs`.

3. For each wave, run sub-phases **3a → 3b → 3c**:

### 3a — Scoping (parallel)

a. Dispatch one Task subagent per task in the wave with description `Implement Task N: <title>` and a prompt containing the mini-plan ONLY (no addendum text — the `floor-policy` PreToolUse hook injects the scoping addendum + verification directive automatically).
b. Collect each return as a JSON payload between ` ```decision-payload ` fences. Parse with `lib/decisions/schema.mjs` `validateDecisionPayload`. If `result.ok === false`, treat as `NO_DECISIONS` and log a warning.

### 3b — Ask (sequential UI per task)

a. If `config.policy.decisionSurfacing === false`, skip 3b entirely and use empty answer map for all tasks.
b. Call `lib/decision-router.mjs` `routeWaveDecisions({ payloads, statePath, isTTY, askUser })`.
   - `isTTY = process.stdout.isTTY && !flags.yes && iteration === 1`. Loop iteration > 1 forces non-TTY.
   - `askUser` invokes `AskUserQuestion` with the renderer's args. The returned index is mapped back through the router.
c. Persist `state.decisions` to `.agent-all-state.json` after every individual answer (resumable).

### 3c — Implementation (parallel re-dispatch)

a. For each task, build a fresh prompt: the original mini-plan PLUS a section `## User Decisions for This Task` listing `decision.title → chosen option label + description`.
b. Re-dispatch implementer subagent. PostToolUse hook validates `STATUS: DONE` came with `verification_passed` line.
c. Phase 4 (Gate) reviewer subagents likewise get the `Review Task N: <title>` description; PreToolUse hook injects the `VERIFICATION_AUDIT` directive; PostToolUse hook validates the token's presence.

4. Capture wave result: `{index: i, tasks: [{id, status, commits, decisions: state.decisions[id]}], status: "completed"|"incomplete"}`.

5. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If a 3a scoping subagent returns invalid JSON or a payload that fails schema validation: treat as `NO_DECISIONS` for that task and log a warning to `state.warnings`.
- If a 3c implementer reports BLOCKED for >1 task in a wave: mark wave `incomplete`. Phase 4 will decide whether to retry or abort.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Per-subagent verification (safety net)

Now enforced by the `floor-policy` hook (Pre+Post on `Task`). The hook auto-injects:

- For implementer dispatches (`description: "Implement Task ..."`): scoping-pass addendum + verification directive.
- For reviewer dispatches (`description: "Review Task ..."`): `VERIFICATION_AUDIT` directive.

PostToolUse validates each. A failing implementer (claims DONE without verification log) or failing reviewer (omits `VERIFICATION_AUDIT:` line) is rejected — the controller must re-dispatch with the hook's error message visible.

For projects that opt out via `.agent-all.json` `policy: { decisionSurfacing: false, verification: false, reviewerAudit: false }`, the corresponding hook routes become no-ops; phase 3 falls back to a single implementer dispatch with the mini-plan only.

## Output to user

Print per wave:
```
Wave <i> — scoping <N>/<N>, ask <K>/<N>, implement <M>/<N>
```
Print decision summary in non-TTY mode:
```
[wave i] auto-resolved 5 decisions across 3 tasks → docs/agent-all/iter-<n>/decisions.md
```
