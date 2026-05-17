# Phase 3 — Dispatch

## Inputs (from state)

- `plan.path`
- `config.defaults.waveSize` (or `--wave-size` override)
- `config.waves[<waveSize>]`

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

3. For each wave:
   a. Print: `Wave <i+1>/<N> — <waves[i].length> tasks in parallel`.
   b. Invoke `Skill` with `superpowers:subagent-driven-development` passing a synthesized mini-plan containing just this wave's tasks (rendered as `### Task N: <title>` headings with the same file/code blocks from the original plan section).
   c. subagent-driven-development handles its own implementer + spec-reviewer + quality-reviewer cycle per task in the wave.
   d. Capture wave result: `{index: i, tasks: [{id, status, commits}], status: "completed"|"incomplete"}`.

4. Append to `state.waves`. Push `{phase: 3, completedAt}` to `phases`.

## On error

- If a wave's subagent-driven-development reports BLOCKED for >1 task: mark wave `incomplete`. Phase 4 will decide whether to retry or abort.
- If `tasks.length === 0`: abort with `plan has no '### Task N' headings`.

## Output to user

Print one line per wave: `Wave <i>: <completed>/<total> tasks succeeded`.
